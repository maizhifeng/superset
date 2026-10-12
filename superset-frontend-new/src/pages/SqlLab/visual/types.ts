/**
 * Structured model behind the visual SQL builder. The model is embedded as a
 * compact JSON comment in the generated SQL so saved queries can be reopened
 * in visual mode (see modelIO.ts).
 *
 * A model is a pipeline of stages; every stage renders as a CTE (except the
 * last one, which becomes the final SELECT). Each stage keeps the same inner
 * structure the builder always had (source, joins, columns, filters, ...).
 */

export type VisualMode = "visual" | "sql";

export interface VisualColumnRef {
  kind: "column";
  /** Base source when omitted, otherwise the id of the join that owns it. */
  joinId?: string;
  column: string;
}

export interface VisualExpressionRef {
  kind: "expression";
  expressionId: string;
}

export type VisualRef = VisualColumnRef | VisualExpressionRef;

export interface VisualExpression {
  id: string;
  name: string;
  sql: string;
}

export type VisualJoinType = "inner" | "left" | "right" | "full";

export interface VisualJoinKey {
  left: VisualColumnRef;
  right: VisualColumnRef;
}

export interface VisualJoin {
  id: string;
  type: VisualJoinType;
  table: string;
  /** 关联表所在模式；未设置时与查询默认模式一致（允许同库跨模式关联）。 */
  schema?: string;
  keys: VisualJoinKey[];
}

export interface VisualOutputColumn {
  source: VisualRef;
  alias?: string;
}

export type VisualDateUnit = "day" | "week" | "month" | "quarter" | "year";

export interface VisualGroupBy {
  ref: VisualRef;
  dateUnit?: VisualDateUnit;
}

export type VisualMetricKind =
  "count" | "count_distinct" | "sum" | "avg" | "min" | "max" | "custom";

export interface VisualMetric {
  id: string;
  kind: VisualMetricKind;
  ref?: VisualRef;
  customSql?: string;
  label: string;
}

export type VisualFilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_null"
  | "not_null"
  | "in"
  | "not_in"
  | "between"
  | "date_on"
  | "date_before"
  | "date_after"
  | "date_between"
  | "is_true"
  | "is_false";

export interface VisualFilterCondition {
  id: string;
  connector: "and" | "or";
  ref: VisualRef;
  op: VisualFilterOp;
  values: (string | number | null)[];
}

export interface VisualHavingCondition {
  id: string;
  connector: "and" | "or";
  metricId: string;
  op: VisualFilterOp;
  values: (string | number | null)[];
}

export interface VisualMetricSortRef {
  kind: "metric";
  metricId: string;
}

export type VisualSortRef = VisualRef | VisualMetricSortRef;

export interface VisualSort {
  ref: VisualSortRef;
  desc: boolean;
}

/** 阶段来源：物理表，或上游阶段的输出（CTE）。 */
export type VisualStageSource =
  | { kind: "table"; schema: string; table: string }
  | { kind: "stage"; stageId: string };

export interface VisualStage {
  id: string;
  /** CTE 名称（最后一个阶段不生成 CTE，名称仅作展示）。 */
  name: string;
  source: VisualStageSource;
  joins: VisualJoin[];
  columns: VisualOutputColumn[];
  expressions: VisualExpression[];
  filters: VisualFilterCondition[];
  groupBy: VisualGroupBy[];
  metrics: VisualMetric[];
  having: VisualHavingCondition[];
  sorts: VisualSort[];
  limit: number;
}

export interface VisualQueryModel {
  v: 1;
  databaseId: number;
  /** 默认模式（物理表与关联表的兜底模式）。 */
  schema: string;
  stages: VisualStage[];
}

/**
 * 单阶段的扁平视图，与旧版模型字段一致；内层步骤组件与生成器都基于它工作，
 * 阶段来源为 CTE 时 schema 为空串、table 为上游 CTE 名称。
 */
export interface VisualStageView {
  v: 1;
  databaseId: number;
  schema: string;
  table: string;
  joins: VisualJoin[];
  columns: VisualOutputColumn[];
  expressions: VisualExpression[];
  filters: VisualFilterCondition[];
  groupBy: VisualGroupBy[];
  metrics: VisualMetric[];
  having: VisualHavingCondition[];
  sorts: VisualSort[];
  limit: number;
}

export const DEFAULT_LIMIT = 1000;

export function emptyStage(
  name: string,
  source: VisualStageSource,
): VisualStage {
  return {
    id: `${name}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    source,
    joins: [],
    columns: [],
    expressions: [],
    filters: [],
    groupBy: [],
    metrics: [],
    having: [],
    sorts: [],
    limit: DEFAULT_LIMIT,
  };
}

export function emptyModel(
  databaseId: number,
  schema: string,
): VisualQueryModel {
  return {
    v: 1,
    databaseId,
    schema,
    stages: [emptyStage("stage_1", { kind: "table", schema, table: "" })],
  };
}

/** 为新的下游阶段生成唯一名称。 */
export function uniqueStageName(
  model: VisualQueryModel,
  base = "stage",
): string {
  const used = new Set(model.stages.map((s) => s.name));
  let candidate = `${base}_${model.stages.length + 1}`;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${model.stages.length + 1}_${i}`;
    i += 1;
  }
  return candidate;
}

export function stageById(
  model: VisualQueryModel,
  stageId: string,
): VisualStage | undefined {
  return model.stages.find((s) => s.id === stageId);
}

/** 阶段索引（1-based 展示用）。 */
export function stageIndex(model: VisualQueryModel, stageId: string): number {
  return model.stages.findIndex((s) => s.id === stageId) + 1;
}

export function isLastStage(model: VisualQueryModel, stageId: string): boolean {
  return (
    model.stages.length > 0 &&
    model.stages[model.stages.length - 1].id === stageId
  );
}

/** 把某个阶段展开为旧扁平视图，供内层步骤组件与 SQL 生成器复用。 */
export function stageView(
  model: VisualQueryModel,
  stage: VisualStage,
): VisualStageView {
  const source = stage.source;
  const sourceIsTable = source.kind === "table";
  const upstream =
    source.kind === "stage"
      ? model.stages.find((s) => s.id === source.stageId)
      : undefined;
  return {
    v: 1,
    databaseId: model.databaseId,
    schema: sourceIsTable ? source.schema : "",
    table: sourceIsTable ? source.table : (upstream?.name ?? ""),
    joins: stage.joins,
    columns: stage.columns,
    expressions: stage.expressions,
    filters: stage.filters,
    groupBy: stage.groupBy,
    metrics: stage.metrics,
    having: stage.having,
    sorts: stage.sorts,
    limit: stage.limit,
  };
}

/** 用编辑后的扁平视图生成新的阶段（保留来源类型，表格来源时同步表名/模式）。 */
export function stageFromView(
  stage: VisualStage,
  view: VisualStageView,
): VisualStage {
  return {
    ...stage,
    source:
      stage.source.kind === "table"
        ? { kind: "table", schema: view.schema, table: view.table }
        : stage.source,
    joins: view.joins,
    columns: view.columns,
    expressions: view.expressions,
    filters: view.filters,
    groupBy: view.groupBy,
    metrics: view.metrics,
    having: view.having,
    sorts: view.sorts,
    limit: view.limit,
  };
}

export function isAggregated(view: VisualStageView): boolean {
  return view.groupBy.length > 0 || view.metrics.length > 0;
}

export function refKey(ref: VisualRef | VisualMetricSortRef): string {
  if (ref.kind === "metric") return `metric:${ref.metricId}`;
  if (ref.kind === "expression") return `expr:${ref.expressionId}`;
  return `col:${ref.joinId ?? "base"}:${ref.column}`;
}

export function sameRef(
  a: VisualRef | VisualMetricSortRef,
  b: VisualRef | VisualMetricSortRef,
): boolean {
  return refKey(a) === refKey(b);
}

export function columnRef(column: string, joinId?: string): VisualColumnRef {
  return joinId
    ? { kind: "column", joinId, column }
    : { kind: "column", column };
}

/** Cache key for table metadata shared between SqlLab and the builder. */
export function tableMetaKey(
  databaseId: number | "",
  schema: string,
  table: string,
): string {
  return `${databaseId}:${schema}:${table}`;
}

/** Resolves the { schema, table } a ref/join lives in (joins may span schemas). */
export function tableScope(
  view: VisualStageView,
  joinId?: string,
): { schema: string; table: string } {
  if (!joinId) return { schema: view.schema, table: view.table };
  const join = view.joins.find((j) => j.id === joinId);
  return {
    schema: join?.schema ?? view.schema,
    table: join?.table ?? "",
  };
}
