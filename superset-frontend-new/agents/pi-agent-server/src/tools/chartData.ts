import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { fetchWithRetry, resolveToken, toMarkdownTable } from "./querySuperset.js";

/**
 * Chart insight data acquisition. Fetches a chart's metadata and data
 * through the Superset API using the acting user's verified token and
 * builds the prompt handed to the model.
 */

interface ChartInfo {
  dsId: number;
  dsType: string;
  metrics: unknown[];
  groupby: string[];
  vizType: string;
  name: string;
}

const ROW_LIMIT = 500;

function parseChartInfo(resp: Record<string, unknown>): ChartInfo {
  const r = (resp.result || {}) as Record<string, unknown>;
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse((r.params as string) || "{}");
  } catch {
    /* invalid params: fall back to form_data */
  }
  const fd = (r.form_data as Record<string, unknown>) || params;
  return {
    dsId: (r.datasource_id as number) || (fd.datasource_id as number) || 0,
    dsType:
      (r.datasource_type as string) ||
      (fd.datasource_type as string) ||
      "table",
    metrics: (fd.metrics as unknown[]) || [],
    groupby: ((fd.groupby as string[]) || []).map(String),
    vizType: (r.viz_type as string) || (fd.viz_type as string) || "",
    name: (r.slice_name as string) || `#${r.id}`,
  };
}

type FilterMeta = { value?: unknown; column?: string; filterType?: string };

function buildFilterInfo(filters: Record<string, unknown>): {
  text: string;
  query: Record<string, unknown>[];
} {
  const lines: string[] = [];
  const qf: Record<string, unknown>[] = [];
  for (const [, v] of Object.entries(filters)) {
    const i = v as FilterMeta;
    if (
      i.filterType === "time_range" &&
      Array.isArray(i.value) &&
      i.value.length >= 2 &&
      i.column
    ) {
      lines.push(`  ${i.column}: ${i.value[0]} ~ ${i.value[1]}`);
      qf.push({ col: i.column, op: ">=", val: i.value[0] });
      qf.push({ col: i.column, op: "<=", val: i.value[1] });
    } else if (i.filterType === "filter_select" && i.column) {
      const arr = Array.isArray(i.value) ? i.value : [i.value];
      lines.push(`  ${i.column} IN [${arr.join(", ")}]`);
      qf.push({ col: i.column, op: "IN", val: arr });
    }
  }
  return {
    text: lines.length ? "当前筛选条件:\n" + lines.join("\n") : "",
    query: qf,
  };
}

/**
 * Fetch chart metadata and data, then build the full user prompt for the
 * chart insight analysis. Throws on data-acquisition failure.
 */
export async function buildChartInsightPrompt(
  chartId: number,
  filters: Record<string, unknown>,
  userId: string,
  authToken?: string,
): Promise<string> {
  const config = loadConfig();
  const token = await resolveToken(authToken);
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const infoResp = await fetchWithRetry(
    `${config.flaskInternalUrl}/api/v1/chart/${chartId}`,
    { headers: authHeaders },
  );
  if (!infoResp.ok) {
    throw new Error(`获取图表信息失败: HTTP ${infoResp.status}`);
  }
  const info = parseChartInfo((await infoResp.json()) as Record<string, unknown>);
  if (!info.dsId) throw new Error("图表数据源 ID 为空");
  const fi = buildFilterInfo(filters);

  const payload: Record<string, unknown> = {
    datasource: { id: info.dsId, type: info.dsType },
    queries: [
      {
        metrics: info.metrics.slice(0, 10),
        columns: info.groupby.slice(0, 5),
        row_limit: ROW_LIMIT,
      },
    ],
    result_format: "json",
    result_type: "full",
  };
  if (fi.query.length)
    (payload.queries as Record<string, unknown>[])[0].filters = fi.query;

  const dataResp = await fetchWithRetry(
    `${config.flaskInternalUrl}/api/v1/chart/data`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(payload),
    },
  );
  if (!dataResp.ok) {
    const text = await dataResp.text().catch(() => "");
    throw new Error(`查询图表数据失败: ${text.slice(0, 200)}`);
  }

  const json = (await dataResp.json()) as {
    result?: Array<{
      data?: Record<string, unknown>[];
      colnames?: string[];
      rowcount?: number;
    }>;
  };
  const first = (Array.isArray(json.result) ? json.result[0] : {}) || {};
  const data: Record<string, unknown>[] = first.data ?? [];
  const colnames: string[] = first.colnames ?? [];
  const totalCount = first.rowcount ?? data.length;

  const shortNames = colnames.map((c) =>
    c.replace(/^SUM\(/, "").replace(/\)$/, ""),
  );
  const sorted = [...data]
    .sort((a, b) => {
      const va =
        Number(Object.values(a).find((v) => typeof v === "number")) || 0;
      const vb =
        Number(Object.values(b).find((v) => typeof v === "number")) || 0;
      return vb - va;
    })
    .slice(0, ROW_LIMIT);
  const renamedRows = sorted.map((row) =>
    Object.fromEntries(
      colnames.map((c, idx) => [shortNames[idx] ?? c, row[c]]),
    ),
  );
  const table =
    shortNames.length > 0
      ? toMarkdownTable(shortNames, renamedRows, ROW_LIMIT)
      : "（查询未返回数据）";

  const truncNote =
    totalCount > ROW_LIMIT
      ? `共 ${totalCount} 行，仅展示消耗最高的 ${ROW_LIMIT} 行，缺失 ${totalCount - ROW_LIMIT} 行`
      : totalCount >= ROW_LIMIT
        ? `达到查询上限 ${ROW_LIMIT} 行，可能存在截断`
        : null;

  const contextLines = [
    `图表: ${info.name}`,
    `类型: ${info.vizType}`,
    `数据行: ${sorted.length}`,
    `数据列: ${shortNames.join(", ")}`,
  ];
  if (truncNote) contextLines.push(truncNote);
  if (fi.text) contextLines.push(`\n${fi.text}`);
  const dataBlock = sorted.length ? `\n数据:\n${table}` : "";

  logger.info(
    "insight",
    `chart=${chartId} user=${userId} rows=${sorted.length} cols=${colnames.length}`,
  );

  return `分析图表 #${chartId} 的数据。\n\n图表上下文:\n${contextLines.join("\n")}${dataBlock}`;
}
