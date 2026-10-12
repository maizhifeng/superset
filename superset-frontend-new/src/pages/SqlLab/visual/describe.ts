import { DATE_UNIT_LABELS, JOIN_TYPE_LABELS } from "./dialects";
import { operatorLabel } from "./operators";
import { defaultMetricLabel } from "./sqlBuilder";
import type {
  VisualFilterCondition,
  VisualHavingCondition,
  VisualJoin,
  VisualMetric,
  VisualStageView,
  VisualRef,
  VisualSortRef,
} from "./types";

export function tableNameForRef(
  model: VisualStageView,
  ref: VisualRef,
): string {
  if (ref.kind === "expression") return "";
  if (!ref.joinId) return model.table;
  const join = model.joins.find((j) => j.id === ref.joinId);
  if (!join) return "?";
  const schema = join.schema ?? model.schema;
  return schema && schema !== model.schema
    ? `${schema}.${join.table}`
    : join.table;
}

export function describeRef(model: VisualStageView, ref: VisualRef): string {
  if (ref.kind === "expression") {
    const expression = model.expressions.find((e) => e.id === ref.expressionId);
    return `ƒ ${expression?.name?.trim() || "表达式"}`;
  }
  const table = tableNameForRef(model, ref);
  return table ? `${table}.${ref.column || "?"}` : ref.column || "?";
}

function describeValues(values: (string | number | null)[]): string {
  const list = values.filter(
    (v) => v !== null && v !== undefined && String(v) !== "",
  );
  return list.map((v) => String(v)).join(" ~ ");
}

export function describeFilter(
  model: VisualStageView,
  filter: VisualFilterCondition | VisualHavingCondition,
): string {
  if ("metricId" in filter) {
    const metric = model.metrics.find((m) => m.id === filter.metricId);
    const label = metric
      ? metric.label.trim() || defaultMetricLabel(metric)
      : "指标";
    return `${label} ${operatorLabel(filter.op)} ${describeValues(filter.values)}`.trim();
  }
  return `${describeRef(model, filter.ref)} ${operatorLabel(filter.op)} ${describeValues(
    filter.values,
  )}`.trim();
}

const METRIC_FN_LABELS: Record<string, string> = {
  count: "COUNT(*)",
  count_distinct: "DISTINCT 计数",
  sum: "SUM",
  avg: "AVG",
  min: "MIN",
  max: "MAX",
  custom: "自定义",
};

export function describeMetric(
  model: VisualStageView,
  metric: VisualMetric,
): string {
  const label = metric.label.trim() || defaultMetricLabel(metric);
  if (metric.kind === "custom") return `${label} = ${metric.customSql ?? ""}`;
  if (metric.kind === "count") return `${label} = COUNT(*)`;
  const fn = METRIC_FN_LABELS[metric.kind] ?? metric.kind;
  const ref = metric.ref ? describeRef(model, metric.ref) : "?";
  return `${label} = ${fn}(${ref})`;
}

export function describeJoin(model: VisualStageView, join: VisualJoin): string {
  const typeLabel = JOIN_TYPE_LABELS[join.type] ?? join.type;
  const schema = join.schema ?? model.schema;
  const tableLabel =
    schema && schema !== model.schema ? `${schema}.${join.table}` : join.table;
  const keys = join.keys
    .map(
      (key) =>
        `${describeRef(model, key.left)} = ${describeRef(model, key.right)}`,
    )
    .join(" AND ");
  return `${typeLabel} ${tableLabel}${keys ? ` ON ${keys}` : ""}`;
}

export function describeSortRef(
  model: VisualStageView,
  ref: VisualSortRef,
): string {
  if (ref.kind === "metric") {
    const metric = model.metrics.find((m) => m.id === ref.metricId);
    if (!metric) return "指标";
    return metric.label.trim() || defaultMetricLabel(metric);
  }
  return describeRef(model, ref);
}

export function describeGroupBy(
  model: VisualStageView,
  ref: VisualRef,
  dateUnit?: string,
): string {
  const suffix =
    dateUnit && dateUnit in DATE_UNIT_LABELS
      ? `（${DATE_UNIT_LABELS[dateUnit as keyof typeof DATE_UNIT_LABELS]}）`
      : "";
  return `${describeRef(model, ref)}${suffix}`;
}
