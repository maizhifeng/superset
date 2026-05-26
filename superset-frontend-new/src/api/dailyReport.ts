import api from "@/api";

const DATASOURCE = { id: 26, type: "table" as const };

interface Row {
  [key: string]: unknown;
}

const COST_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "ad_real_cost" },
  aggregate: "SUM" as const,
  label: "SUM(ad_real_cost)",
};

const USER_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "n_unum" },
  aggregate: "SUM" as const,
  label: "SUM(n_unum)",
};

const BASE_METRICS = [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"] as unknown[];

function fmt(v: unknown, decimals = 2): string {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(decimals);
  }
  return String(v);
}

function toMarkdownTable(cols: string[], rows: Row[], maxRows = 40): string {
  const header = cols.join(" | ");
  const sep = cols.map(() => "---").join(" | ");
  const display = rows.slice(0, maxRows);
  const body = display.map((r) =>
    cols.map((c) => fmt(r[c])).join(" | "),
  );
  return [header, sep, ...body].join("\n");
}

function parseResult(resp: unknown) {
  const r = (resp as { data?: { result?: unknown[] } })?.data?.result?.[0] as
    | { data?: Row[]; colnames?: string[] }
    | undefined;
  return { rows: r?.data ?? [], cols: r?.colnames ?? [] };
}

function extractDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Convert report_date_calc timestamps to "M/D" strings in-place */
function normalizeDates(rows: Row[]): void {
  for (const r of rows) {
    const ts = Number(r.report_date_calc);
    if (ts) r.report_date_calc = extractDate(ts);
  }
}

/** Get unique dates sorted descending */
function uniqueDates(rows: Row[], field = "report_date_calc"): number[] {
  return [...new Set(rows.map((r) => Number(r[field])).filter(Boolean))]
    .sort((a, b) => b - a);
}

export interface DailyReportData {
  summaryContext: string;
}

export async function fetchDailyReportData(): Promise<DailyReportData> {
  const baseQuery = {
    datasource: DATASOURCE,
    result_format: "json" as const,
    result_type: "full" as const,
  };

  const dayFilter = {
    granularity: "report_date_calc" as const,
    time_range: "Last 2 days" as const,
  };

  const trendFilter = {
    granularity: "report_date_calc" as const,
    time_range: "Last 7 days" as const,
  };

  const [q1, q2, q3, qTrend] = await Promise.all([
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: BASE_METRICS,
        columns: ["papp_name", "report_date_calc"],
        ...dayFilter,
        row_limit: 200,
      }],
    }),
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: BASE_METRICS,
        columns: ["papp_name", "cch_name", "report_date_calc"],
        ...dayFilter,
        row_limit: 300,
      }],
    }),
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1"] as unknown[],
        columns: ["channel_name", "report_date_calc"],
        ...dayFilter,
        row_limit: 200,
      }],
    }),
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [COST_METRIC],
        columns: ["report_date_calc"],
        ...trendFilter,
        row_limit: 10,
      }],
    }),
  ]);

  const r1 = parseResult(q1);
  const r2 = parseResult(q2);
  const r3 = parseResult(q3);
  const rTrend = parseResult(qTrend);

  // Extract date labels BEFORE normalization (timestamps still intact)
  const rawDates1 = uniqueDates(r1.rows);
  const yesLabel = rawDates1[0] ? extractDate(rawDates1[0]) : "昨日";
  const prevLabel = rawDates1[1] ? extractDate(rawDates1[1]) : "前日";

  // Normalize dates to "M/D" for all rows
  normalizeDates(r1.rows);
  normalizeDates(r2.rows);
  normalizeDates(r3.rows);

  const cols1 = r1.cols;
  const cols2 = r2.cols;
  const cols3 = r3.cols;

  const sortCost = (rows: Row[]) =>
    [...rows].sort(
      (a, b) => (Number(b["SUM(ad_real_cost)"]) || 0) - (Number(a["SUM(ad_real_cost)"]) || 0),
    );

  const sections: string[] = [`报告日期: ${yesLabel} | 对比: ${prevLabel}`, ""];

  // Section 1
  sections.push("#### 1. 项目维度汇总", "");
  sections.push(toMarkdownTable(cols1, sortCost(r1.rows), 60));
  sections.push("");

  // Section 2: yesterday's channel data only
  const yesDate2 = yesLabel; // "5/25" etc.
  const yesRows2 = r2.rows.filter((r) => String(r.report_date_calc) === yesDate2);
  sections.push("#### 2. 项目+渠道明细（昨日）", "");
  sections.push(toMarkdownTable(cols2, sortCost(yesRows2), 200));
  sections.push("");

  // Section 3
  const dates3 = [...new Set(r3.rows.map((r) => String(r.report_date_calc)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
  sections.push("#### 3. 媒体维度分析", "");
  for (const d of dates3) {
    const dayRows = r3.rows.filter((r) => String(r.report_date_calc) === d);
    sections.push(`【${d}】`);
    sections.push(toMarkdownTable(cols3, sortCost(dayRows), 40));
    sections.push("");
  }

  // Section 4: trend
  const trendRows = [...rTrend.rows]
    .filter((r) => (Number(r["SUM(ad_real_cost)"]) || 0) > 0)
    .sort((a, b) => (Number(a.report_date_calc) || 0) - (Number(b.report_date_calc) || 0));
  const trendLines = trendRows.map((r) => {
    const dl = extractDate(Number(r.report_date_calc));
    return `  ${dl}: ¥${fmt(r["SUM(ad_real_cost)"] ?? 0, 0)}`;
  });
  sections.push("#### 4. 近7天消耗趋势", "");
  sections.push(trendLines.length ? trendLines.join("\n") : "（暂无趋势数据）");

  return { summaryContext: sections.join("\n") };
}
