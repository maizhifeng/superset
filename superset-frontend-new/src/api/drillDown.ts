/**
 * 广告投放钻取明细数据 API
 *
 * 与周报（weeklyReport）的聚合汇总不同，钻取模块直接返回近 7 天的原始明细数据，
 * 以便运营/投放团队按项目+渠道、媒体、平台、团队+渠道等维度下钻查看详情。
 *
 * 数据源：Superset 数据集 id=26（广告投放数据表）
 * 时间范围：最近 7 天
 * 输出格式：Markdown 表格，每段一个维度分片
 */

import api from "@/api";

/** Superset 数据集 ID */
const DATASOURCE = { id: 26, type: "table" as const };

/** 通用行数据类型 */
interface Row {
  [key: string]: unknown;
}

/**
 * 数值格式化
 * @param v - 原始值
 * @param decimals - 小数位数，默认 2 位
 */
function fmt(v: unknown, decimals = 2): string {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(decimals);
  }
  return String(v);
}

/**
 * 将时间戳转为 "M/d" 格式日期字符串（如 6/10）
 * 用于使日期列更可读
 */
function extractDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 将结果行中的日期时间戳统一转为可读格式
 * @param rows - 数据行列表（原地修改）
 */
function normalizeDates(rows: Row[]): void {
  for (const r of rows) {
    const ts = Number(r.日期);
    if (ts) r.日期 = extractDate(ts);
  }
}

/**
 * 将行数据转为 Markdown 表格字符串
 * @param cols - 列名列表
 * @param rows - 数据行
 * @param maxRows - 最大行数限制，默认 50
 */
function toMarkdownTable(cols: string[], rows: Row[], maxRows = 50): string {
  const header = cols.join(" | ");
  const sep = cols.map(() => "---").join(" | ");
  const display = rows.slice(0, maxRows);
  const body = display.map((r) =>
    cols.map((c) => fmt(r[c])).join(" | "),
  );
  return [header, sep, ...body].join("\n");
}

/**
 * 解析 Superset /chart/data 接口返回结果
 * @param resp - 接口原始响应
 * @returns提取后的行数据列表和列名列表
 */
function parseResult(resp: unknown) {
  const r = (resp as { data?: { result?: unknown[] } })?.data?.result?.[0] as
    | { data?: Row[]; colnames?: string[] }
    | undefined;
  return { rows: r?.data ?? [], cols: r?.colnames ?? [] };
}

/** 消耗指标（SUM 返点后消耗） */
const COST_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "返点后消耗" },
  aggregate: "SUM" as const,
  label: "SUM(ad_real_cost)",
};

/** 新增用户指标（SUM 新增进入） */
const USER_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "新增进入" },
  aggregate: "SUM" as const,
  label: "SUM(n_unum)",
};

/** 所有查询共享的指标列表：消耗 + 新增用户 + CPA + ROI1 + LTV1~LTV7 */
const BASE_METRICS = [
  COST_METRIC, USER_METRIC,
  "cpa", "roi_1", "ltv_1",
  "ltv_2", "ltv_3", "ltv_4", "ltv_5", "ltv_6", "ltv_7",
] as unknown[];

/** 钻取数据导出接口 */
export interface DrillDownData {
  /** 完整的 Markdown 格式钻取内容 */
  summaryContext: string;
}

/**
 * 获取近 7 天各维度明细数据
 *
 * 并发请求 4 个 Superset 查询，返回原始明细（不做周聚合），
 * 按 4 个维度分片展示：
 * 1. 项目+渠道：最细粒度，含完整 LTV1~LTV7
 * 2. 媒体：按媒体维度聚合
 * 3. 平台：按平台维度聚合
 * 4. 团队+渠道：按团队+渠道商维度聚合
 *
 * @returns包含 4 段 Markdown 表格的钻取内容
 */
export async function fetchDrillDownData(): Promise<DrillDownData> {
  /** 近 7 天时间过滤条件 */
  const dayFilter = {
    granularity: "日期" as const,
    time_range: "Last 7 days" as const,
  };

  /** 排序：按消耗降序 */
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

  // 将团队数据中的时间戳转为可读日期
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
