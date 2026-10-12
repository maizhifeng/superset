import type { VisualFilterOp } from "./types";

/** Generic column categories driving filter operators and value inputs. */
export type ColumnCategory =
  "string" | "number" | "temporal" | "boolean" | "other";

const TEMPORAL_RE = /(timestamp|datetime|smalldatetime|date|time)/;
const BOOLEAN_RE = /bool/;
const NUMBER_RE =
  /(int|float|double|decimal|numeric|real|money|number|serial|bigserial|dec)/;
const STRING_RE = /(char|text|string|varchar|nvarchar|clob|uuid|json|enum)/;

export function classifyColumn(
  type?: string | null,
  longType?: string | null,
): ColumnCategory {
  const value = `${type ?? ""} ${longType ?? ""}`.toLowerCase();
  if (!value.trim()) return "other";
  if (/interval/.test(value)) return "other";
  if (BOOLEAN_RE.test(value)) return "boolean";
  if (TEMPORAL_RE.test(value)) return "temporal";
  if (NUMBER_RE.test(value)) return "number";
  if (STRING_RE.test(value)) return "string";
  return "other";
}

export interface OperatorDef {
  value: VisualFilterOp;
  label: string;
  /** number of literal inputs; "n" = list of values. */
  arity: 0 | 1 | 2 | "n";
}

const IS_NULL: OperatorDef = { value: "is_null", label: "为空", arity: 0 };
const NOT_NULL: OperatorDef = { value: "not_null", label: "不为空", arity: 0 };

const STRING_OPS: OperatorDef[] = [
  { value: "eq", label: "等于", arity: 1 },
  { value: "neq", label: "不等于", arity: 1 },
  { value: "contains", label: "包含", arity: 1 },
  { value: "not_contains", label: "不包含", arity: 1 },
  { value: "starts_with", label: "开头是", arity: 1 },
  { value: "ends_with", label: "结尾是", arity: 1 },
  { value: "in", label: "属于", arity: "n" },
  { value: "not_in", label: "不属于", arity: "n" },
  IS_NULL,
  NOT_NULL,
];

const NUMBER_OPS: OperatorDef[] = [
  { value: "eq", label: "等于", arity: 1 },
  { value: "neq", label: "不等于", arity: 1 },
  { value: "gt", label: "大于", arity: 1 },
  { value: "gte", label: "大于等于", arity: 1 },
  { value: "lt", label: "小于", arity: 1 },
  { value: "lte", label: "小于等于", arity: 1 },
  { value: "between", label: "介于", arity: 2 },
  { value: "in", label: "属于", arity: "n" },
  { value: "not_in", label: "不属于", arity: "n" },
  IS_NULL,
  NOT_NULL,
];

const TEMPORAL_OPS: OperatorDef[] = [
  { value: "date_on", label: "当天", arity: 1 },
  { value: "date_before", label: "早于", arity: 1 },
  { value: "date_after", label: "晚于", arity: 1 },
  { value: "date_between", label: "介于", arity: 2 },
  IS_NULL,
  NOT_NULL,
];

const BOOLEAN_OPS: OperatorDef[] = [
  { value: "is_true", label: "为真", arity: 0 },
  { value: "is_false", label: "为假", arity: 0 },
  IS_NULL,
  NOT_NULL,
];

const OTHER_OPS: OperatorDef[] = [
  { value: "eq", label: "等于", arity: 1 },
  { value: "neq", label: "不等于", arity: 1 },
  { value: "in", label: "属于", arity: "n" },
  { value: "not_in", label: "不属于", arity: "n" },
  IS_NULL,
  NOT_NULL,
];

/** HAVING operates on aggregated numeric results only. */
export const METRIC_OPS: OperatorDef[] = [
  { value: "eq", label: "等于", arity: 1 },
  { value: "neq", label: "不等于", arity: 1 },
  { value: "gt", label: "大于", arity: 1 },
  { value: "gte", label: "大于等于", arity: 1 },
  { value: "lt", label: "小于", arity: 1 },
  { value: "lte", label: "小于等于", arity: 1 },
  { value: "between", label: "介于", arity: 2 },
];

export function operatorsForCategory(category: ColumnCategory): OperatorDef[] {
  switch (category) {
    case "string":
      return STRING_OPS;
    case "number":
      return NUMBER_OPS;
    case "temporal":
      return TEMPORAL_OPS;
    case "boolean":
      return BOOLEAN_OPS;
    default:
      return OTHER_OPS;
  }
}

export function operatorDef(
  category: ColumnCategory,
  op: VisualFilterOp,
): OperatorDef | undefined {
  return operatorsForCategory(category).find((o) => o.value === op);
}

export function operatorLabel(op: VisualFilterOp): string {
  const all = [
    ...STRING_OPS,
    ...NUMBER_OPS,
    ...TEMPORAL_OPS,
    ...BOOLEAN_OPS,
    ...OTHER_OPS,
  ];
  return all.find((o) => o.value === op)?.label ?? op;
}

const NUMBER_LITERAL_RE = /^-?\d+(\.\d+)?$/;

/** Quotes a SQL string literal, doubling embedded single quotes. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Escapes LIKE wildcards in a user-supplied fragment and returns the pattern
 * body (without the surrounding quotes).
 */
export function likePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Formats a filter value for SQL; null means the value is invalid/empty. */
export function formatLiteral(
  value: string | number | null | undefined,
  category: ColumnCategory | "metric",
): string | null {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string" && value.trim() === "") return null;
  if (category === "number" || category === "metric") {
    const text = String(value).trim();
    return NUMBER_LITERAL_RE.test(text) ? text : null;
  }
  if (category === "boolean") {
    const text = String(value).trim().toLowerCase();
    if (text === "true" || text === "1") return "TRUE";
    if (text === "false" || text === "0") return "FALSE";
    return null;
  }
  return quoteLiteral(String(value));
}

/** Splits a comma/space separated multi-value input into trimmed values. */
export function parseListValues(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Formats a date with a day offset, used by temporal range operators. */
export function addDays(date: string, days: number): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return date;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
