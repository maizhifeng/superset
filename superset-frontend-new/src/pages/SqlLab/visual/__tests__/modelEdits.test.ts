import { test, expect } from "vitest";
import {
  addExpression,
  addFilter,
  addGroupBy,
  addHaving,
  addMetric,
  addOutputColumn,
  addStage,
  applyStageView,
  isStageReferenced,
  moveOutputColumn,
  removeExpression,
  removeJoin,
  removeMetric,
  removeStage,
  renameStage,
  setBaseTable,
  setStageSource,
  setStageTableSource,
  updateFilter,
} from "@/pages/SqlLab/visual/modelEdits";
import {
  emptyModel,
  emptyStage,
  stageView,
  type VisualQueryModel,
  type VisualStageView,
} from "@/pages/SqlLab/visual/types";

function makeView(overrides: Partial<VisualStageView> = {}): VisualStageView {
  const model = emptyModel(1, "public");
  const stage = emptyStage("stage_1", {
    kind: "table",
    schema: "public",
    table: "orders",
  });
  return { ...stageView(model, stage), ...overrides };
}

test("setBaseTable resets dependent parts but keeps context and limit", () => {
  const model: VisualStageView = {
    ...makeView(),
    columns: [{ source: { kind: "column", column: "id" } }],
    filters: [
      {
        id: "f1",
        connector: "and",
        ref: { kind: "column", column: "status" },
        op: "eq",
        values: ["paid"],
      },
    ],
    groupBy: [{ ref: { kind: "column", column: "status" } }],
    metrics: [{ id: "m1", kind: "count", label: "" }],
    limit: 500,
  };
  const next = setBaseTable(model, "payments");
  expect(next.table).toBe("payments");
  expect(next.schema).toBe("public");
  expect(next.databaseId).toBe(1);
  expect(next.limit).toBe(500);
  expect(next.columns).toEqual([]);
  expect(next.filters).toEqual([]);
  expect(next.groupBy).toEqual([]);
  expect(next.metrics).toEqual([]);
});

test("removeJoin prunes refs pointing at the removed join", () => {
  const join = {
    id: "j1",
    type: "left" as const,
    table: "customers",
    keys: [
      {
        left: { kind: "column" as const, column: "customer_id" },
        right: { kind: "column" as const, joinId: "j1", column: "id" },
      },
    ],
  };
  let model = makeView({ joins: [join] });
  model = addOutputColumn(model, {
    kind: "column",
    joinId: "j1",
    column: "name",
  });
  model = addOutputColumn(model, { kind: "column", column: "id" });
  model = addGroupBy(model, { kind: "column", joinId: "j1", column: "name" });
  let withFilter = addFilter(model);
  const filterId = withFilter.filters[0].id;
  withFilter = updateFilter(withFilter, filterId, {
    ref: { kind: "column", joinId: "j1", column: "name" },
    op: "eq",
    values: ["x"],
  });

  const next = removeJoin(withFilter, "j1");
  expect(next.joins).toEqual([]);
  expect(next.columns).toHaveLength(1);
  expect(next.columns[0].source).toEqual({ kind: "column", column: "id" });
  expect(next.groupBy).toEqual([]);
  expect(next.filters).toEqual([]);
});

test("removeExpression prunes columns and filters referencing it", () => {
  let model = addExpression(makeView(), {
    id: "e1",
    name: "客单价",
    sql: "amount / qty",
  });
  model = addOutputColumn(model, { kind: "expression", expressionId: "e1" });
  let withFilter = addFilter(model);
  withFilter = updateFilter(withFilter, withFilter.filters[0].id, {
    ref: { kind: "expression", expressionId: "e1" },
    op: "gt",
    values: ["1"],
  });

  const next = removeExpression(withFilter, "e1");
  expect(next.expressions).toEqual([]);
  expect(next.columns).toEqual([]);
  expect(next.filters).toEqual([]);
});

test("removeMetric cleans HAVING and metric sorts", () => {
  let model = addMetric(makeView());
  const metricId = model.metrics[0].id;
  model = addHaving(model);
  model = {
    ...model,
    sorts: [{ ref: { kind: "metric", metricId }, desc: true }],
  };
  const next = removeMetric(model, metricId);
  expect(next.metrics).toEqual([]);
  expect(next.having).toEqual([]);
  expect(next.sorts).toEqual([]);
});

test("output columns de-duplicate and support reordering", () => {
  let model = addOutputColumn(makeView(), { kind: "column", column: "id" });
  model = addOutputColumn(model, { kind: "column", column: "id" });
  expect(model.columns).toHaveLength(1);

  model = addOutputColumn(model, { kind: "column", column: "status" });
  const moved = moveOutputColumn(model, 1, -1);
  expect(
    moved.columns.map((c) => (c.source as { column: string }).column),
  ).toEqual(["status", "id"]);
  expect(moveOutputColumn(model, 0, -1)).toBe(model);
});

test("stage helpers: add / rename / source / remove / applyStageView", () => {
  const base = emptyModel(1, "public");
  const stage1 = base.stages[0];
  const withStage = addStage(base);
  expect(withStage.stages).toHaveLength(2);
  const stage2 = withStage.stages[1];
  // 新阶段默认独立（物理表来源），不再强制串在上一阶段之后。
  expect(stage2.source).toEqual({ kind: "table", schema: "public", table: "" });
  expect(stage2.name).toBe("stage_2");
  expect(isStageReferenced(withStage, stage1.id)).toBe(false);
  expect(isStageReferenced(withStage, stage2.id)).toBe(false);

  // 显式切换为上游阶段后形成依赖。
  const chained = setStageSource(withStage, stage2.id, stage1.id);
  expect(chained.stages[1].source).toEqual({
    kind: "stage",
    stageId: stage1.id,
  });
  expect(isStageReferenced(chained, stage1.id)).toBe(true);

  // 被引用的阶段不能删除，末尾阶段可以删除。
  expect(removeStage(chained, stage1.id).stages).toHaveLength(2);
  expect(removeStage(chained, stage2.id).stages).toHaveLength(1);

  const renamed = renameStage(chained, stage2.id, "订单聚合");
  expect(renamed.stages[1].name).toBe("订单聚合");
  // 与已有名称重复时自动加后缀。
  const dup = renameStage(renamed, stage2.id, "stage_1");
  expect(dup.stages[1].name).toBe("stage_1_2");

  // 只能引用更早的阶段。
  expect(setStageSource(chained, stage1.id, stage2.id)).toBe(chained);

  // 内层编辑回写：给阶段 2 加一个筛选。
  const view2 = stageView(chained, stage2);
  const edited = addFilter(view2);
  const applied = applyStageView(chained, stage2.id, edited);
  expect(applied.stages[1].filters).toHaveLength(1);
  expect(applied.stages[0]).toBe(chained.stages[0]);
});

test("stage source switch resets the stage configuration", () => {
  const model = addStage(emptyModel(1, "public"));
  const stage2 = model.stages[1];
  const configured = applyStageView(model, stage2.id, {
    ...stageView(model, stage2),
    joins: [
      {
        id: "j1",
        type: "left",
        table: "customers",
        keys: [
          {
            left: { kind: "column", column: "id" },
            right: { kind: "column", joinId: "j1", column: "id" },
          },
        ],
      },
    ],
    columns: [{ source: { kind: "column", column: "id" } }],
  });
  expect(configured.stages[1].joins).toHaveLength(1);

  const toStage = setStageSource(
    configured,
    stage2.id,
    model.stages[0].id,
    true,
  );
  expect(toStage.stages[1].source).toEqual({
    kind: "stage",
    stageId: model.stages[0].id,
  });
  expect(toStage.stages[1].joins).toEqual([]);
  expect(toStage.stages[1].columns).toEqual([]);

  const toTable = setStageTableSource(toStage, stage2.id, "public", "orders");
  expect(toTable.stages[1].source).toEqual({
    kind: "table",
    schema: "public",
    table: "orders",
  });
  expect(toTable.stages[1].joins).toEqual([]);
});

test("stages joined by a later stage cannot be removed", () => {
  const base = addStage(emptyModel(1, "public"));
  const stage3 = addStage(base);
  const [stage1, stage2, stage3Stage] = stage3.stages;
  const joined = applyStageView(stage3, stage3Stage.id, {
    ...stageView(stage3, stage3Stage),
    joins: [
      {
        id: "j1",
        type: "left",
        table: "",
        schema: "",
        stageId: stage2.id,
        keys: [
          {
            left: { kind: "column", column: "id" },
            right: { kind: "column", joinId: "j1", column: "id" },
          },
        ],
      },
    ],
  });
  expect(isStageReferenced(joined, stage2.id)).toBe(true);
  expect(isStageReferenced(joined, stage1.id)).toBe(false);
  expect(removeStage(joined, stage2.id).stages).toHaveLength(3);
  // 阶段关联只持久化 stageId，CTE 名称由模型解析。
  expect(joined.stages[2].joins[0]).toMatchObject({
    stageId: stage2.id,
    table: "",
  });
});

test("applyStageView keeps the pipeline source when editing downstream output", () => {
  const base = addStage(emptyModel(1, "public"));
  const model: VisualQueryModel = setStageSource(
    base,
    base.stages[1].id,
    base.stages[0].id,
  );
  const stage2 = model.stages[1];
  const view = stageView(model, stage2);
  expect(view.schema).toBe("");
  expect(view.table).toBe("stage_1");
  const edited = addOutputColumn(view, { kind: "column", column: "status" });
  const applied = applyStageView(model, stage2.id, edited);
  expect(applied.stages[1].source).toEqual({
    kind: "stage",
    stageId: model.stages[0].id,
  });
});
