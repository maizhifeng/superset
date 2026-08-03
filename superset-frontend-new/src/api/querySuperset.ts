/**
 * 动态 Superset 查询工具
 *
 * 供 LLM 通过 function calling 按需查询广告投放数据集（id=26）。
 * 提供白名单约束的安全查询能力，返回 Markdown 表格。
 *
 * 与 weeklyReport / drillDown 不同，此模块不做任何后处理聚合，
 * 只负责将 LLM 的结构化请求转发给 Superset 并格式化返回。
 */

import api from "@/api";

/** 数据集 ID（广告投放数据表），所有查询固定使用此数据源 */
const DATASOURCE = { id: 26, type: "table" as const };

/** 通用行数据类型 */
interface Row {
  [key: string]: unknown;
}

// ─── 白名单定义 ────────────────────────────────────────────

/** 允许查询的维度列名（数据集中的实际字段名） */
export const ALLOWED_COLUMNS = [
  "日期",
  "媒体",
  "平台",
  "渠道商",
  "主游戏",
  "团队",
] as const;

export type AllowedColumn = (typeof ALLOWED_COLUMNS)[number];

/** 允许查询的指标 */
export const ALLOWED_METRICS = [
  "SUM(消耗)",
  "SUM(返点后消耗)",
  "SUM(新增进入)",
  "cpa",
  "roi_1",
  "roi_2",
  "roi_3",
  "roi_4",
  "roi_5",
  "roi_6",
  "roi_7",
  "ltv_1",
  "ltv_2",
  "ltv_3",
  "ltv_4",
  "ltv_5",
  "ltv_6",
  "ltv_7",
] as const;

export type AllowedMetric = (typeof ALLOWED_METRICS)[number];

/** 允许的时间范围 */
export const ALLOWED_TIME_RANGES = [
  "Last 7 days",
  "Last 14 days",
  "Last 30 days",
  "Last 90 days",
] as const;

export type AllowedTimeRange = (typeof ALLOWED_TIME_RANGES)[number];

// ─── 查询参数 ──────────────────────────────────────────────

export interface QuerySupersetParams {
  /** 分组维度列名 */
  columns: AllowedColumn[];
  /** 查询指标 */
  metrics: AllowedMetric[];
  /** 时间范围，默认 "Last 14 days" */
  time_range?: AllowedTimeRange;
  /** 额外的列级过滤条件，如 { "平台": "iOS" } */
  filters?: Record<string, string | number>;
  /** 排序规则，如 [["SUM(消耗)", false]]，默认按消耗降序 */
  orderby?: [AllowedMetric, boolean][];
  /** 最大返回行数，默认 100，上限 1000 */
  row_limit?: number;
}

// ─── 参数校验 ──────────────────────────────────────────────

class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ValidationError";
  }
}

function validateParams(p: QuerySupersetParams): void {
  for (const col of p.columns) {
    if (!ALLOWED_COLUMNS.includes(col)) {
      throw new ValidationError(`不允许的列: "${col}"`);
    }
  }
  for (const m of p.metrics) {
    if (!ALLOWED_METRICS.includes(m)) {
      throw new ValidationError(`不允许的指标: "${m}"`);
    }
  }
  if (p.time_range && !ALLOWED_TIME_RANGES.includes(p.time_range)) {
    throw new ValidationError(`不允许的时间范围: "${p.time_range}"`);
  }
  const limit = p.row_limit ?? 100;
  if (limit < 1 || limit > 1000) {
    throw new ValidationError("row_limit 必须在 1~1000 之间");
  }
}

// ─── 指标格式转换 ──────────────────────────────────────────

/**
 * 将指标名字符串转为 Superset 能识别的格式。
 * SUM(...) 转为 SIMPLE 表达式，其余按原文字符串传入。
 */
function buildMetricEntry(m: AllowedMetric): unknown {
  const sumMatch = m.match(/^SUM\((.+)\)$/);
  if (sumMatch) {
    return {
      expressionType: "SIMPLE" as const,
      column: { column_name: sumMatch[1] },
      aggregate: "SUM" as const,
      label: m,
    };
  }
  if (m === "cpa") {
    return {
      expressionType: "SQL" as const,
      sqlExpression:
        'CAST(SUM("返点后消耗") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)',
      label: "cpa",
    };
  }
  return m;
}

// ─── 过滤条件转换 ──────────────────────────────────────────

/**
 * 将简单的 { column: value } 过滤条件转为 Superset 的 adhoc_filters 格式。
 * 目前只支持等值比较（==），后续可按需扩展。
 */
function buildFilters(
  filters: Record<string, string | number> | undefined,
): unknown[] {
  if (!filters || Object.keys(filters).length === 0) return [];
  return Object.entries(filters).map(([col, val]) => ({
    expressionType: "SIMPLE" as const,
    subject: col,
    operator: "==" as const,
    comparator: String(val),
  }));
}

// ─── 结果格式化 ────────────────────────────────────────────

function fmt(v: unknown, decimals = 2): string {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(decimals);
  }
  return String(v);
}

function toMarkdownTable(cols: string[], rows: Row[], maxRows: number): string {
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
        return fmt(v);
      })
      .join(" | "),
  );
  return [header, sep, ...body].join("\n");
}

// ─── 核心查询函数 ──────────────────────────────────────────

/**
 * 执行一次受约束的 Superset 查询，返回 Markdown 表格字符串。
 *
 * 安全限制：
 * - 仅查询数据集 id=26
 * - 列名必须属于 ALLOWED_COLUMNS
 * - 指标必须属于 ALLOWED_METRICS
 * - 时间范围必须属于 ALLOWED_TIME_RANGES
 * - row_limit 不超过 1000
 * - 不支持原生 SQL 或任意 datasource 切换
 *
 * @param params - 结构化查询参数
 * @returns Markdown 格式的表格字符串（含表头和分隔行）
 * @throws ValidationError 参数校验失败时抛出
 */
export async function executeQuery(
  params: QuerySupersetParams,
): Promise<string> {
  validateParams(params);

  const rowLimit = params.row_limit ?? 100;
  const timeRange = params.time_range ?? "Last 14 days";

  let resp;
  try {
    const hasDateCol = params.columns.includes("日期");
    resp = await api.post("/chart/data", {
      datasource: DATASOURCE,
      result_format: "json" as const,
      result_type: "full" as const,
      queries: [
        {
          ...(hasDateCol || timeRange ? { granularity: "日期" as const } : {}),
          time_range: timeRange,
          metrics: params.metrics.map(buildMetricEntry),
          columns: params.columns,
          adhoc_filters: buildFilters(params.filters),
          orderby: params.orderby ?? [["SUM(消耗)", false]],
          row_limit: rowLimit,
        },
      ],
    });
  } catch (e: unknown) {
    const detail =
      (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ??
      (e as Error).message ??
      "未知错误";
    throw new Error(`Superset 查询失败: ${detail}`);
  }

  const result = (
    resp as { data?: { result?: { data?: Row[]; colnames?: string[] }[] } }
  )?.data?.result?.[0];

  const rows = result?.data ?? [];
  const cols = result?.colnames ?? [];

  if (cols.length === 0) {
    return "（查询未返回数据）";
  }

  return toMarkdownTable(cols, rows, rowLimit);
}
