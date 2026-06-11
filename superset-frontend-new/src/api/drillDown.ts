import api from "@/api";

const DATASOURCE = { id: 26, type: "table" as const };

interface Row {
  [key: string]: unknown;
}

function fmt(v: unknown, decimals = 2): string {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(decimals);
  }
  return String(v);
}

function extractDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function normalizeDates(rows: Row[]): void {
  for (const r of rows) {
    const ts = Number(r.日期);
    if (ts) r.日期 = extractDate(ts);
  }
}

function toMarkdownTable(cols: string[], rows: Row[], maxRows = 50): string {
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

const COST_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "返点后消耗" },
  aggregate: "SUM" as const,
  label: "SUM(ad_real_cost)",
};

const USER_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "新增进入" },
  aggregate: "SUM" as const,
  label: "SUM(n_unum)",
};

const BASE_METRICS = [
  COST_METRIC, USER_METRIC,
  "cpa", "roi_1", "ltv_1",
  "ltv_2", "ltv_3", "ltv_4", "ltv_5", "ltv_6", "ltv_7",
] as unknown[];

export interface DrillDownData {
  summaryContext: string;
}

export async function fetchDrillDownData(): Promise<DrillDownData> {
  const dayFilter = {
    granularity: "日期" as const,
    time_range: "Last 7 days" as const,
  };

  const orderDesc = [["SUM(ad_real_cost)", false]];

  const [q1, q2, q3, qTeam] = await Promise.all([
    api.post("/chart/data", {
      datasource: DATASOURCE,
      queries: [{
        metrics: BASE_METRICS,
        columns: ["主游戏", "渠道商", "日期"],
        ...dayFilter,
        orderby: orderDesc,
        row_limit: 500,
      }],
      result_format: "json",
      result_type: "full",
    }),
    api.post("/chart/data", {
      datasource: DATASOURCE,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"],
        columns: ["媒体", "日期"],
        ...dayFilter,
        orderby: orderDesc,
        row_limit: 200,
      }],
      result_format: "json",
      result_type: "full",
    }),
    api.post("/chart/data", {
      datasource: DATASOURCE,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"],
        columns: ["平台", "日期"],
        ...dayFilter,
        orderby: orderDesc,
        row_limit: 200,
      }],
      result_format: "json",
      result_type: "full",
    }),
    api.post("/chart/data", {
      datasource: DATASOURCE,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"],
        columns: ["团队", "渠道商", "日期"],
        ...dayFilter,
        orderby: orderDesc,
        row_limit: 200,
      }],
      result_format: "json",
      result_type: "full",
    }),
  ]);

  const r1 = parseResult(q1);
  const r2 = parseResult(q2);
  const r3 = parseResult(q3);
  const rTeam = parseResult(qTeam);

  normalizeDates(rTeam.rows);

  const sections: string[] = [
    "数据范围: 近7天 | 数据中的 日期 列即为日期", "",
  ];

  sections.push("#### 1. 项目+渠道维度明细", "");
  sections.push(toMarkdownTable(r1.cols, r1.rows, 500));
  sections.push("");

  sections.push("#### 2. 媒体维度明细", "");
  sections.push(toMarkdownTable(r2.cols, r2.rows, 200));
  sections.push("");

  sections.push("#### 3. 平台维度明细", "");
  sections.push(toMarkdownTable(r3.cols, r3.rows, 200));
  sections.push("");

  sections.push("#### 4. 团队+渠道维度明细", "");
  sections.push(toMarkdownTable(rTeam.cols, rTeam.rows, 500));

  return { summaryContext: sections.join("\n") };
}
