export function buildMetricEntry(m: string): unknown {
  const sumMatch = m.match(/^SUM\((.+)\)$/);
  if (sumMatch) {
    return {
      expressionType: "SIMPLE",
      column: { column_name: sumMatch[1] },
      aggregate: "SUM",
      label: m,
    };
  }
  if (m === "cpa") {
    return {
      expressionType: "SQL",
      sqlExpression:
        'CAST(SUM("返点后消耗") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)',
      label: "cpa",
    };
  }
  if (m === "roi_1") {
    return {
      expressionType: "SQL",
      sqlExpression:
        'CAST(SUM("1日充值") AS NUMERIC(20,4)) / NULLIF(SUM("返点后消耗"), 0) * 100',
      label: "roi_1",
    };
  }
  if (m === "ltv_1") {
    return {
      expressionType: "SQL",
      sqlExpression:
        'CAST(SUM("1日充值") AS NUMERIC(20,4)) / NULLIF(SUM("新增进入"), 0)',
      label: "ltv_1",
    };
  }
  return m;
}

export function buildFilters(
  filters: Record<string, string | number> | undefined,
): unknown[] {
  if (!filters || Object.keys(filters).length === 0) return [];
  return Object.entries(filters).map(([col, val]) => ({
    expressionType: "SIMPLE",
    subject: col,
    operator: "==",
    comparator: String(val),
  }));
}

export function toMarkdownTable(
  cols: string[],
  rows: Record<string, unknown>[],
  maxRows: number,
): string {
  const header = cols.join(" | ");
  const sep = cols.map(() => "---").join(" | ");
  const display = rows.slice(0, maxRows);
  const body = display.map((r) =>
    cols
      .map((c) => {
        const v = r[c];
        if (c === "日期" && typeof v === "number") {
          const d = new Date(v);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        }
        if (v == null) return "-";
        if (typeof v === "number") {
          if (Number.isInteger(v)) return String(v);
          return v.toFixed(2);
        }
        return String(v);
      })
      .join(" | "),
  );
  return [header, sep, ...body].join("\n");
}

export async function executeQuerySuperset(
  args: Record<string, unknown>,
  userId: string,
  signal?: AbortSignal,
): Promise<string> {
  const flaskUrl = process.env.FLASK_INTERNAL_URL || "http://superset-light:8088";
  const rowLimit = (args.row_limit as number) ?? 100;
  const timeRange = (args.time_range as string) ?? "Last 14 days";
  const columns = args.columns as string[];
  const metricsArr = args.metrics as string[];
  const hasDateCol = columns.includes("日期");
  const metrics = metricsArr.map(buildMetricEntry);
  const filters = buildFilters(args.filters as Record<string, string | number> | undefined);
  const orderby = (args.orderby as [string, boolean][]) ?? [["SUM(消耗)", false]];

  const payload = {
    datasource: { id: 26, type: "table" },
    result_format: "json",
    result_type: "full",
    queries: [
      {
        ...(hasDateCol ? { granularity: "日期" } : {}),
        time_range: timeRange,
        metrics,
        columns,
        adhoc_filters: filters,
        orderby,
        row_limit: rowLimit,
      },
    ],
  };

  const res = await fetch(`${flaskUrl}/api/v1/chart/agent-data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Agent": "true",
      "X-User-Id": userId,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Superset 查询失败: ${res.status} ${text}`);
  }

  const json = await res.json();
  const result = json?.result?.[0];
  const rows: Record<string, unknown>[] = result?.data ?? [];
  const cols: string[] = result?.colnames ?? [];

  if (cols.length === 0) {
    return "（查询未返回数据）";
  }

  return toMarkdownTable(cols, rows, rowLimit);
}
