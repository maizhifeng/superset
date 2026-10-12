import type {
  VisualExpression,
  VisualFilterCondition,
  VisualGroupBy,
  VisualJoin,
  VisualMetric,
  VisualQueryModel,
  VisualStage,
  VisualStageView,
  VisualRef,
  VisualSort,
  VisualHavingCondition,
  VisualOutputColumn,
  VisualDateUnit,
} from "./types";
import { DEFAULT_LIMIT, sameRef, uniqueStageName } from "./types";

let idCounter = 0;

export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function refsInFilter(filter: VisualFilterCondition): VisualRef {
  return filter.ref;
}

/** Drops anything referencing a join/expression that no longer exists. */
function pruneRefs(model: VisualStageView): VisualStageView {
  const joinIds = new Set(model.joins.map((j) => j.id));
  const expressionIds = new Set(model.expressions.map((e) => e.id));
  const refAlive = (ref: VisualRef): boolean =>
    ref.kind === "column"
      ? ref.joinId === undefined || joinIds.has(ref.joinId)
      : expressionIds.has(ref.expressionId);
  return {
    ...model,
    columns: model.columns.filter((c) => refAlive(c.source)),
    filters: model.filters.filter((f) => refAlive(refsInFilter(f))),
    groupBy: model.groupBy.filter((g) => refAlive(g.ref)),
    metrics: model.metrics.filter((m) => !m.ref || refAlive(m.ref)),
    sorts: model.sorts.filter(
      (s) => s.ref.kind === "metric" || refAlive(s.ref),
    ),
  };
}

function emptyHaving(having: VisualHavingCondition[]): VisualHavingCondition[] {
  return having;
}

/** Sets the base table and resets every dependent part of the query. */
export function setBaseTable(
  model: VisualStageView,
  table: string,
): VisualStageView {
  return {
    v: 1,
    databaseId: model.databaseId,
    schema: model.schema,
    table,
    joins: [],
    columns: [],
    expressions: [],
    filters: [],
    groupBy: [],
    metrics: [],
    having: [],
    sorts: [],
    limit: model.limit,
  };
}

/** Synchronizes context (database/schema) when the page selection changes. */
export function setContext(
  model: VisualStageView,
  databaseId: number,
  schema: string,
): VisualStageView {
  if (model.databaseId === databaseId && model.schema === schema) return model;
  return { ...model, databaseId, schema };
}

export function addJoin(
  model: VisualStageView,
  join: VisualJoin,
): VisualStageView {
  return { ...model, joins: [...model.joins, join] };
}

export function updateJoin(
  model: VisualStageView,
  joinId: string,
  patch: Partial<VisualJoin>,
): VisualStageView {
  return {
    ...model,
    joins: model.joins.map((j) => (j.id === joinId ? { ...j, ...patch } : j)),
  };
}

export function removeJoin(
  model: VisualStageView,
  joinId: string,
): VisualStageView {
  return pruneRefs({
    ...model,
    joins: model.joins.filter((j) => j.id !== joinId),
  });
}

export function setOutputColumns(
  model: VisualStageView,
  columns: VisualOutputColumn[],
): VisualStageView {
  return { ...model, columns };
}

export function addOutputColumn(
  model: VisualStageView,
  ref: VisualRef,
): VisualStageView {
  if (model.columns.some((c) => sameRef(c.source, ref))) return model;
  return { ...model, columns: [...model.columns, { source: ref }] };
}

export function removeOutputColumn(
  model: VisualStageView,
  index: number,
): VisualStageView {
  return { ...model, columns: model.columns.filter((_, i) => i !== index) };
}

export function updateOutputColumn(
  model: VisualStageView,
  index: number,
  patch: Partial<VisualOutputColumn>,
): VisualStageView {
  return {
    ...model,
    columns: model.columns.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    ),
  };
}

export function moveOutputColumn(
  model: VisualStageView,
  index: number,
  delta: -1 | 1,
): VisualStageView {
  const target = index + delta;
  if (target < 0 || target >= model.columns.length) return model;
  const columns = [...model.columns];
  [columns[index], columns[target]] = [columns[target], columns[index]];
  return { ...model, columns };
}

export function addExpression(
  model: VisualStageView,
  expression: VisualExpression,
): VisualStageView {
  return { ...model, expressions: [...model.expressions, expression] };
}

export function updateExpression(
  model: VisualStageView,
  id: string,
  patch: Partial<VisualExpression>,
): VisualStageView {
  return {
    ...model,
    expressions: model.expressions.map((e) =>
      e.id === id ? { ...e, ...patch } : e,
    ),
  };
}

export function removeExpression(
  model: VisualStageView,
  id: string,
): VisualStageView {
  return pruneRefs({
    ...model,
    expressions: model.expressions.filter((e) => e.id !== id),
  });
}

export function addFilter(model: VisualStageView): VisualStageView {
  const filter: VisualFilterCondition = {
    id: newId("filter"),
    connector: "and",
    ref: { kind: "column", column: "" },
    op: "eq",
    values: [""],
  };
  return { ...model, filters: [...model.filters, filter] };
}

export function updateFilter(
  model: VisualStageView,
  id: string,
  patch: Partial<VisualFilterCondition>,
): VisualStageView {
  return {
    ...model,
    filters: model.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  };
}

export function removeFilter(
  model: VisualStageView,
  id: string,
): VisualStageView {
  return { ...model, filters: model.filters.filter((f) => f.id !== id) };
}

export function addGroupBy(
  model: VisualStageView,
  ref: VisualRef,
  dateUnit?: VisualDateUnit,
): VisualStageView {
  if (
    model.groupBy.some((g) => sameRef(g.ref, ref) && g.dateUnit === dateUnit)
  ) {
    return model;
  }
  return { ...model, groupBy: [...model.groupBy, { ref, dateUnit }] };
}

export function updateGroupBy(
  model: VisualStageView,
  index: number,
  patch: Partial<VisualGroupBy>,
): VisualStageView {
  return {
    ...model,
    groupBy: model.groupBy.map((g, i) =>
      i === index ? { ...g, ...patch } : g,
    ),
  };
}

export function removeGroupBy(
  model: VisualStageView,
  index: number,
): VisualStageView {
  const removed = model.groupBy[index];
  const groupBy = model.groupBy.filter((_, i) => i !== index);
  const sorts = removed
    ? model.sorts.filter((s) => !sameRef(s.ref, removed.ref))
    : model.sorts;
  return { ...model, groupBy, sorts };
}

export function addMetric(model: VisualStageView): VisualStageView {
  const metric: VisualMetric = {
    id: newId("metric"),
    kind: "count",
    label: "",
  };
  return { ...model, metrics: [...model.metrics, metric] };
}

export function updateMetric(
  model: VisualStageView,
  id: string,
  patch: Partial<VisualMetric>,
): VisualStageView {
  return {
    ...model,
    metrics: model.metrics.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  };
}

export function removeMetric(
  model: VisualStageView,
  id: string,
): VisualStageView {
  return {
    ...model,
    metrics: model.metrics.filter((m) => m.id !== id),
    having: model.having.filter((h) => h.metricId !== id),
    sorts: model.sorts.filter(
      (s) => !(s.ref.kind === "metric" && s.ref.metricId === id),
    ),
  };
}

export function addHaving(model: VisualStageView): VisualStageView {
  const firstMetric = model.metrics[0];
  const having: VisualHavingCondition = {
    id: newId("having"),
    connector: "and",
    metricId: firstMetric?.id ?? "",
    op: "gt",
    values: [""],
  };
  return { ...model, having: [...emptyHaving(model.having), having] };
}

export function updateHaving(
  model: VisualStageView,
  id: string,
  patch: Partial<VisualHavingCondition>,
): VisualStageView {
  return {
    ...model,
    having: model.having.map((h) => (h.id === id ? { ...h, ...patch } : h)),
  };
}

export function removeHaving(
  model: VisualStageView,
  id: string,
): VisualStageView {
  return { ...model, having: model.having.filter((h) => h.id !== id) };
}

export function addSort(model: VisualStageView): VisualStageView {
  const ref: VisualSort["ref"] =
    model.metrics.length > 0
      ? { kind: "metric", metricId: model.metrics[0].id }
      : model.groupBy.length > 0
        ? model.groupBy[0].ref
        : model.columns.length > 0
          ? model.columns[0].source
          : { kind: "column", column: "" };
  return { ...model, sorts: [...model.sorts, { ref, desc: true }] };
}

export function updateSort(
  model: VisualStageView,
  index: number,
  patch: Partial<VisualSort>,
): VisualStageView {
  return {
    ...model,
    sorts: model.sorts.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  };
}

export function removeSort(
  model: VisualStageView,
  index: number,
): VisualStageView {
  return { ...model, sorts: model.sorts.filter((_, i) => i !== index) };
}

export function setLimit(
  model: VisualStageView,
  limit: number,
): VisualStageView {
  return { ...model, limit };
}

/* ------------------------------------------------------------------ */
/* 阶段（CTE）管理：外层容器编辑，内层仍然是上面这些扁平编辑函数。      */
/* ------------------------------------------------------------------ */

/** 是否被后续阶段引用（引用中的阶段不允许删除）。 */
export function isStageReferenced(
  model: VisualQueryModel,
  stageId: string,
): boolean {
  return model.stages.some(
    (s) => s.source.kind === "stage" && s.source.stageId === stageId,
  );
}

/** 在末尾追加一个以上一阶段为来源的新阶段。 */
export function addStage(model: VisualQueryModel): VisualQueryModel {
  const last = model.stages[model.stages.length - 1];
  const name = uniqueStageName(model);
  const stage: VisualStage = {
    id: `${name}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    source: last
      ? { kind: "stage", stageId: last.id }
      : { kind: "table", schema: model.schema, table: "" },
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
  return { ...model, stages: [...model.stages, stage] };
}

/** 删除阶段；若被后续阶段引用则原样返回。 */
export function removeStage(
  model: VisualQueryModel,
  stageId: string,
): VisualQueryModel {
  if (model.stages.length <= 1 || isStageReferenced(model, stageId)) {
    return model;
  }
  return { ...model, stages: model.stages.filter((s) => s.id !== stageId) };
}

/** 重命名阶段（CTE 名称），同名时自动去重后缀。 */
export function renameStage(
  model: VisualQueryModel,
  stageId: string,
  name: string,
): VisualQueryModel {
  const trimmed = name.trim() || "stage";
  const used = new Set(
    model.stages.filter((s) => s.id !== stageId).map((s) => s.name),
  );
  let candidate = trimmed;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${trimmed}_${i}`;
    i += 1;
  }
  return {
    ...model,
    stages: model.stages.map((s) =>
      s.id === stageId ? { ...s, name: candidate } : s,
    ),
  };
}

/** 修改阶段的来源（仅允许指向它之前的阶段）。 */
export function setStageSource(
  model: VisualQueryModel,
  stageId: string,
  sourceStageId: string,
): VisualQueryModel {
  const index = model.stages.findIndex((s) => s.id === stageId);
  const sourceIndex = model.stages.findIndex((s) => s.id === sourceStageId);
  if (index <= 0 || sourceIndex < 0 || sourceIndex >= index) return model;
  return {
    ...model,
    stages: model.stages.map((s) =>
      s.id === stageId
        ? { ...s, source: { kind: "stage", stageId: sourceStageId } }
        : s,
    ),
  };
}

/** 把内层编辑后的扁平视图写回对应阶段。 */
export function applyStageView(
  model: VisualQueryModel,
  stageId: string,
  view: VisualStageView,
): VisualQueryModel {
  return {
    ...model,
    stages: model.stages.map((s) => {
      if (s.id !== stageId) return s;
      return {
        ...s,
        source:
          s.source.kind === "table"
            ? { kind: "table", schema: view.schema, table: view.table }
            : s.source,
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
    }),
  };
}
