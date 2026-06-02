import api from "@/api";

interface ModelConfig {
  provider: string;
  model: string;
  baseUrl?: string;
}

export interface InsightCallbacks {
  onText: (text: string) => void;
  onReasoning?: (text: string) => void;
  onStatus?: (status: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

// --- Chart data helpers ---

function parseChartInfo(resp: Record<string, unknown>) {
  const r = (resp.result || {}) as Record<string, unknown>;
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse((r.params as string) || "{}");
  } catch {
    /* */
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
function buildFilterInfo(filters: Record<string, unknown>) {
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

// --- Direct LLM streaming (OpenAI-compatible SSE) ---

function _yieldToReact(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function _streamLlmDirect(
  system: string,
  prompt: string,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
  history?: { role: string; content: string }[],
) {
  callbacks.onStatus?.("正在获取回答…");

  const rawBaseUrl = modelCfg?.baseUrl || "";
  const baseUrl = /172\.\d+\.\d+\.\d+|host\.docker\.internal/.test(rawBaseUrl)
    ? "/llm"
    : rawBaseUrl || "/llm";
  const model = modelCfg?.model || "gemma-4-e2b-it";

  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  if (history) messages.push(...history);
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.1,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM API error: ${res.status} ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          callbacks.onDone?.();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) {
            callbacks.onText(content);
            await _yieldToReact();
          }
        } catch {
          /* skip malformed JSON */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  callbacks.onDone?.();
}

// --- Public API ---

export async function streamChartInsight(
  chartId: number,
  filters: Record<string, unknown>,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
): Promise<string> {
  callbacks.onStatus?.("正在获取图表元数据…");
  const infoResp = await api
    .get(`/chart/${chartId}`, { signal })
    .catch((e: Error) => {
      throw new Error(`获取图表信息失败: ${e.message}`);
    });
  const info = parseChartInfo(infoResp.data);
  if (!info.dsId) throw new Error("图表数据源 ID 为空");
  const fi = buildFilterInfo(filters);

  callbacks.onStatus?.("正在查询数据…");
  const ROW_LIMIT = 500;
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

  const dataResp = await api.post("/chart/data", payload, { signal });
  const first =
    (Array.isArray(dataResp.data?.result)
      ? dataResp.data.result[0]
      : dataResp.data?.result) || {};
  const data: Record<string, unknown>[] = first.data || [];
  const colnames: string[] = first.colnames || [];
  const totalCount = first.rowcount ?? data.length;

  callbacks.onStatus?.("数据获取完成");

  const shortNames = colnames.map((c: string) =>
    c.replace(/^SUM\(/, "").replace(/\)$/, ""),
  );
  const sorted = [...data].sort((a, b) => {
    const va =
      Number(Object.values(a).find((v) => typeof v === "number")) || 0;
    const vb =
      Number(Object.values(b).find((v) => typeof v === "number")) || 0;
    return vb - va;
  }).slice(0, ROW_LIMIT);
  const tableStr = [
    shortNames.join("\t"),
    ...sorted.map((r) =>
      shortNames
        .map((_, i) => {
          const v = r[colnames[i]];
          return v == null
            ? "-"
            : typeof v === "number"
              ? Number.isInteger(v)
                ? String(v)
                : v.toFixed(2)
              : String(v);
        })
        .join("\t"),
    ),
  ].join("\n");

  const truncNote =
    totalCount > ROW_LIMIT
      ? `⚠️ 共 ${totalCount} 行，仅展示消耗最高的 ${ROW_LIMIT} 行，缺失 ${totalCount - ROW_LIMIT} 行`
      : totalCount >= ROW_LIMIT
        ? `⚠️ 达到查询上限 ${ROW_LIMIT} 行，可能存在截断`
        : null;

  const contextLines = [
    `图表: ${info.name}`,
    `类型: ${info.vizType}`,
    `数据行: ${sorted.length}`,
    `数据列: ${shortNames.join(", ")}`,
  ];
  if (truncNote) contextLines.push(truncNote);
  if (fi.text) contextLines.push(`\n${fi.text}`);
  const dataBlock = sorted.length ? `\n数据:\n${tableStr}` : "";

  callbacks.onStatus?.("正在分析…");
  const system =
    "你是一个专业的数据分析师。请直接分析下面给出的图表数据，输出结构化的分析结果（趋势、异常、建议等），使用中文和 markdown 格式。不要生成或执行任何代码。";
  const text = `分析图表 #${chartId} 的数据。\n\n图表上下文:\n${contextLines.join("\n")}${dataBlock}`;

  await _streamLlmDirect(system, text, callbacks, signal, modelCfg);
  return "";
}

export async function streamChat(
  _sessionId: string,
  message: string,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
  history?: { role: string; content: string }[],
) {
  await _streamLlmDirect("", message, callbacks, signal, modelCfg, history);
}

export async function abortSession(_sessionId: string) {
  /* no-op with direct LLM mode */
}

export async function streamDirectChat(
  prompt: string,
  systemPrompt: string,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
  history?: { role: string; content: string }[],
): Promise<string> {
  await _streamLlmDirect(systemPrompt, prompt, callbacks, signal, modelCfg, history);
  return "";
}
