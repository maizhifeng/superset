/**
 * Structured model behind the visual SQL builder. The model is embedded as a
 * compact JSON comment in the generated SQL so saved queries can be reopened
 * in visual mode (see modelIO.ts).
 *
 * A model is a list of stages. A stage's data source is either a physical table
 * or the output of an earlier stage (rendered as a CTE); stages are independent
 * from each other and a later stage may reference several earlier stages at
 * once through joins. Only the final output stage produces the outer SELECT,
 * and only stages reachable from it are rendered as CTEs.
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
  /** 物理表名；关联目标为上游阶段时为空串（见 stageId）。 */
  table: string;
  /** 关联表所在模式；未设置时与查询默认模式一致（允许同库跨模式关联）。 */
  schema?: string;
  /** 关联目标为上游阶段（CTE）时的阶段 id；引用期间该阶段不允许删除。 */
  stageId?: string;
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

/** 关联目标是否为上游阶段（CTE）。 */
export function isStageJoin(join: VisualJoin): boolean {
  return typeof join.stageId === "string" && join.stageId !== "";
}

/** 关联目标名称：物理表名，或上游阶段的 CTE 名称。 */
export function joinTargetName(
  model: VisualQueryModel,
  join: VisualJoin,
): string {
  if (!isStageJoin(join)) return join.table;
  return stageById(model, join.stageId as string)?.name ?? "";
}

/** 阶段直接依赖的上游阶段 id（数据来源 + 关联的上游阶段）。 */
export function stageDependencyIds(stage: VisualStage): string[] {
  const ids = new Set<string>();
  if (stage.source.kind === "stage") ids.add(stage.source.stageId);
  for (const join of stage.joins) {
    if (isStageJoin(join)) ids.add(join.stageId as string);
  }
  return Array.from(ids);
}

/** 引用了指定阶段的后续阶段（数据来源或关联），用于删除保护与提示。 */
export function stageReferencedBy(
  model: VisualQueryModel,
  stageId: string,
): VisualStage[] {
  return model.stages.filter((stage) =>
    stageDependencyIds(stage).includes(stageId),
  );
}

/**
 * 最终输出阶段：列表中最后一个有数据来源的阶段。阶段之间不再强绑成链，
 * 因此可能同时存在多个独立的阶段分支，只有最终输出阶段会生成外层 SELECT。
 */
export function finalStageIndex(model: VisualQueryModel): number {
  const stages = model.stages ?? [];
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const source = stages[i].source;
    if (source.kind === "table") {
      if (source.table) return i;
    } else if (stageById(model, source.stageId)) {
      return i;
    }
  }
  return -1;
}

/** 最终输出阶段引用到的阶段集合（含自身）：只有这些阶段会参与生成的 SQL。 */
export function reachableStageIds(model: VisualQueryModel): Set<string> {
  const stages = model.stages ?? [];
  const finalIndex = finalStageIndex(model);
  const reachable = new Set<string>();
  if (finalIndex < 0) return reachable;
  const stack: VisualStage[] = [stages[finalIndex]];
  while (stack.length > 0) {
    const stage = stack.pop() as VisualStage;
    if (reachable.has(stage.id)) continue;
    reachable.add(stage.id);
    for (const dependencyId of stageDependencyIds(stage)) {
      const dependency = stageById(model, dependencyId);
      if (dependency && !reachable.has(dependency.id)) {
        stack.push(dependency);
      }
    }
  }
  return reachable;
}

/**
 * 阶段关联目标在扁平视图中的表名/模式：上游阶段渲染为 CTE 名称（模式为空），
 * 物理表沿用自身的表名与模式，供内层步骤组件当作“表”来选取字段。
 */
function viewJoins(model: VisualQueryModel, joins: VisualJoin[]): VisualJoin[] {
  return joins.map((join) => {
    if (!isStageJoin(join)) return join;
    return { ...join, table: joinTargetName(model, join), schema: "" };
  });
}

/**
 * 写回模型时清掉从上游阶段名解析出的冗余表名：阶段关联只持久化 stageId，
 * 重命名上游阶段后无需同步修改引用方。
 */
export function normalizeStageJoins(joins: VisualJoin[]): VisualJoin[] {
  return joins.map((join) =>
    isStageJoin(join) ? { ...join, table: "", schema: "" } : join,
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
    joins: viewJoins(model, stage.joins),
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
    joins: normalizeStageJoins(view.joins),
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
