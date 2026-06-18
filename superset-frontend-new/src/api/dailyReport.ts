import api from "@/api";

const DATASOURCE = { id: 26, type: "table" as const };

type SupersetMetric =
  | { expressionType: "SIMPLE"; column: { column_name: string }; aggregate: string; label: string }
  | string;

interface Row {
  [key: string]: unknown;
}

const COST_METRIC: SupersetMetric = {
  expressionType: "SIMPLE",
  column: { column_name: "返点后消耗" },
  aggregate: "SUM",
  label: "SUM(ad_real_cost)",
};

const USER_METRIC: SupersetMetric = {
  expressionType: "SIMPLE",
  column: { column_name: "新增进入" },
  aggregate: "SUM",
  label: "SUM(n_unum)",
};

const BASE_METRICS: SupersetMetric[] = [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"];

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

function parseBatchResult(resp: unknown) {
  const r = resp as { data?: Row[]; colnames?: string[] } | undefined;
  return { rows: r?.data ?? [], cols: r?.colnames ?? [] };
}

function extractDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Convert 日期 timestamps to "M/D" strings in-place */
function normalizeDates(rows: Row[]): void {
  for (const r of rows) {
    const ts = Number(r.日期);
    if (ts) r.日期 = extractDate(ts);
  }
}

/** Get unique dates sorted descending */
function uniqueDates(rows: Row[], field = "日期"): number[] {
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
    granularity: "日期" as const,
    time_range: "Last 2 days" as const,
  };

  const trendFilter = {
    granularity: "日期" as const,
    time_range: "Last 7 days" as const,
  };

  const orderDesc = [["SUM(ad_real_cost)", false]];

  const mediaMetrics: SupersetMetric[] = [COST_METRIC, USER_METRIC, "cpa", "roi_1"];
  const trendMetrics: SupersetMetric[] = [COST_METRIC];

  const resp = await api.post("/chart/data", {
    ...baseQuery,
    queries: [
      { metrics: BASE_METRICS, columns: ["主游戏", "日期"], ...dayFilter, orderby: orderDesc, row_limit: 100 },
      { metrics: BASE_METRICS, columns: ["主游戏", "渠道商", "日期"], ...dayFilter, orderby: orderDesc, row_limit: 500 },
      { metrics: mediaMetrics, columns: ["媒体", "日期"], ...dayFilter, orderby: orderDesc, row_limit: 100 },
      { metrics: trendMetrics, columns: ["日期"], ...trendFilter, orderby: orderDesc, row_limit: 10 },
      { metrics: BASE_METRICS, columns: ["团队", "渠道商", "日期"], ...dayFilter, orderby: orderDesc, row_limit: 100 },
    ],
  });

  const results = ((resp as { data?: { result?: unknown[] } }).data?.result) ?? [];
  const parseAt = (idx: number) => parseBatchResult(results[idx]);
  const r1 = parseAt(0);
  const r2 = parseAt(1);
  const r3 = parseAt(2);
  const rTrend = parseAt(3);
  const rTeam = parseAt(4);

  // Extract date labels BEFORE normalization (timestamps still intact)
  const rawDates1 = uniqueDates(r1.rows);
  const yesLabel = rawDates1[0] ? extractDate(rawDates1[0]) : "昨日";
  const prevLabel = rawDates1[1] ? extractDate(rawDates1[1]) : "前日";

  // Normalize dates to "M/D" for all rows
  normalizeDates(r1.rows);
  normalizeDates(r2.rows);
  normalizeDates(r3.rows);
  normalizeDates(rTeam.rows);

  const cols1 = r1.cols;
  const cols2 = r2.cols;
  const cols3 = r3.cols;
  const colsTeam = rTeam.cols;

  const sortCost = (rows: Row[]) =>
    [...rows].sort(
      (a, b) => (Number(b["SUM(ad_real_cost)"]) || 0) - (Number(a["SUM(ad_real_cost)"]) || 0),
    );

  function truncNote(label: string, count: number, limit: number): string | null {
    if (count > limit) return `⚠️ ${label}: 共 ${count} 行，仅展示消耗最高的 ${limit} 行，缺失 ${count - limit} 行`;
    if (count >= limit) return `⚠️ ${label}: 达到查询上限 ${limit} 行，可能存在截断`;
    return null;
  }

  const notes: string[] = [];

  // Section 1
  const s1Rows = sortCost(r1.rows);
  const n1 = truncNote("项目维度", s1Rows.length, 60);
  if (n1) notes.push(n1);

  // Section 2
  const yesDate2 = yesLabel;
  const allYesRows2 = sortCost(r2.rows.filter((r) => String(r.日期) === yesDate2));
  const n2 = truncNote("项目+渠道（昨日）", allYesRows2.length, 200);
  if (n2) notes.push(n2);

  // Section 3
  const rawTotal3 = r3.rows.length;
  const dates3 = [...new Set(r3.rows.map((r) => String(r.日期)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
  let mediaTruncated = false;
  for (const d of dates3) {
    const dayRows = sortCost(r3.rows.filter((r) => String(r.日期) === d));
    if (dayRows.length > 40) mediaTruncated = true;
  }
  if (rawTotal3 >= 100) notes.push(`⚠️ 媒体维度: 查询返回 ${rawTotal3} 行（达到上限 100），可能存在截断`);
  if (mediaTruncated) notes.push("⚠️ 媒体维度: 部分日期仅展示消耗最高的 40 行");

  // Team section
  const yesDateTeam = yesLabel;
  const allYesTeamRows = sortCost(rTeam.rows.filter((r) => String(r.日期) === yesDateTeam));
  const nTeam = truncNote("团队维度（昨日）", allYesTeamRows.length, 60);
  if (nTeam) notes.push(nTeam);

  // Section 4
  // No truncation needed for 7-day trend

  const truncHeader = notes.length
    ? ["### ⚠️ 数据截断说明", ...notes, ""].join("\n")
    : "";

  const sections: string[] = [`报告日期: ${yesLabel} | 对比: ${prevLabel}`, ""];

  if (truncHeader) sections.push(truncHeader);

  sections.push("#### 1. 项目维度汇总", "");
  sections.push(toMarkdownTable(cols1, s1Rows, 60));
  sections.push("");

  sections.push("#### 2. 项目+渠道明细（昨日）", "");
  sections.push(toMarkdownTable(cols2, allYesRows2, 200));
  sections.push("");

  sections.push("#### 3. 媒体维度分析", "");
  for (const d of dates3) {
    const dayRows = sortCost(r3.rows.filter((r) => String(r.日期) === d));
    sections.push(`【${d}】`);
    sections.push(toMarkdownTable(cols3, dayRows, 40));
    sections.push("");
  }

  sections.push("#### 4. 分团队分析（昨日）", "");
  sections.push(toMarkdownTable(colsTeam, allYesTeamRows, 60));
  sections.push("");

  const trendRows = [...rTrend.rows]
    .filter((r) => (Number(r["SUM(ad_real_cost)"]) || 0) > 0)
    .sort((a, b) => (Number(a.日期) || 0) - (Number(b.日期) || 0));
  const trendLines = trendRows.map((r) => {
    const dl = extractDate(Number(r.日期));
    return `  ${dl}: ¥${fmt(r["SUM(ad_real_cost)"] ?? 0, 0)}`;
  });
  sections.push("#### 5. 近7天消耗趋势", "");
  sections.push(trendLines.length ? trendLines.join("\n") : "（暂无趋势数据）");

  return { summaryContext: sections.join("\n") };
}
