import { render, screen, fireEvent } from "@testing-library/react";
import { test, expect, vi } from "vitest";
import VisualQueryBuilder from "@/pages/SqlLab/visual/components/VisualQueryBuilder";
import type { BuilderContext } from "@/pages/SqlLab/visual/components/builderContext";
import {
  emptyModel,
  emptyStage,
  stageView,
  type VisualQueryModel,
  type VisualStage,
} from "@/pages/SqlLab/visual/types";

function makeStage(overrides: Partial<VisualStage> = {}): VisualStage {
  return {
    ...emptyStage("stage_1", {
      kind: "table",
      schema: "public",
      table: "orders",
    }),
    ...overrides,
  };
}

function makeModel(stages?: VisualStage[]): VisualQueryModel {
  return { ...emptyModel(1, "public"), stages: stages ?? [makeStage()] };
}

function makeCtx(model: VisualQueryModel, index = 0): BuilderContext {
  const stages = model.stages;
  const stage = stages[index];
  const view = stageView(model, stage);
  return {
    model: view,
    onChange: vi.fn(),
    backend: "postgresql",
    tableList: [{ value: "orders", type: "table" }],
    schemas: ["public"],
    contextSchema: "public",
    columnsForTable: (table) =>
      table === "orders"
        ? [
            { name: "id", category: "number" },
            { name: "status", category: "string" },
          ]
        : table === "stage_1"
          ? [{ name: "status", category: "other" }]
          : [],
    refCategory: () => "string",
    metaForTable: () => undefined,
    fetchTableMeta: () => Promise.resolve(null),
    fetchTableListForSchema: () => Promise.resolve([]),
    isLoadingMeta: false,
    metaError: null,
    retryMeta: () => {},
    dateUnitSupported: true,
    stageId: stage.id,
    stageName: stage.name,
    stageIndex: index + 1,
    stageCount: stages.length,
    isLastStage: index === stages.length - 1,
    upstreamStages: stages
      .slice(0, index)
      .map((s, i) => ({ id: s.id, name: s.name, index: i + 1 })),
    onSelectUpstream: vi.fn(),
    sourceStageId:
      stage.source.kind === "stage" ? stage.source.stageId : undefined,
  };
}

function renderBuilder(
  model: VisualQueryModel,
  props: Partial<Parameters<typeof VisualQueryBuilder>[0]> = {},
) {
  const ctxs = model.stages.map((_, index) => makeCtx(model, index));
  const utils = render(
    <VisualQueryBuilder
      stages={model.stages}
      ctxs={ctxs}
      databaseId={1}
      schema="public"
      databases={[{ id: 1, database_name: "testdb" }]}
      schemas={["public"]}
      schemasLoading={false}
      onDatabaseChange={vi.fn()}
      onSchemaChange={vi.fn()}
      formattedSql=""
      onAddStage={vi.fn()}
      onRemoveStage={vi.fn()}
      onRenameStage={vi.fn()}
      {...props}
    />,
  );
  return { ...utils, ctxs };
}

test("renders one stage container with the six builder steps", () => {
  renderBuilder(makeModel());
  expect(screen.getByText(/阶段 1 · 最终输出/)).toBeInTheDocument();
  expect(screen.getByText("数据源")).toBeInTheDocument();
  expect(screen.getByText("关联表")).toBeInTheDocument();
  expect(screen.getByText("字段")).toBeInTheDocument();
  expect(screen.getByText("筛选")).toBeInTheDocument();
  expect(screen.getByText("汇总")).toBeInTheDocument();
  expect(screen.getByText("排序与限制")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "添加阶段（CTE）" })).toBeEnabled();
});

test("adding a filter updates the stage through its onChange", () => {
  const model = makeModel();
  const { ctxs } = renderBuilder(model);
  fireEvent.click(screen.getByText("筛选"));
  fireEvent.click(screen.getByRole("button", { name: /添加筛选/ }));
  const onChange = ctxs[0].onChange as ReturnType<typeof vi.fn>;
  expect(onChange).toHaveBeenCalledTimes(1);
  const next = onChange.mock.calls[0][0] as { filters: unknown[] };
  expect(next.filters).toHaveLength(1);
});

test("aggregated stages disable the columns step with a hint", () => {
  renderBuilder(
    makeModel([
      makeStage({ metrics: [{ id: "m1", kind: "count", label: "" }] }),
    ]),
  );
  expect(
    screen.getByText("汇总模式下由分组与指标决定输出"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText("字段"));
  expect(screen.queryByText("添加表达式")).not.toBeInTheDocument();
});

test("downstream stages render as CTE containers and use the upstream source", () => {
  const model = makeModel();
  const stage2 = {
    ...emptyStage("stage_2", {
      kind: "stage" as const,
      stageId: model.stages[0].id,
    }),
  };
  renderBuilder(makeModel([model.stages[0], stage2]));
  expect(screen.getByText(/阶段 1 · CTE/)).toBeInTheDocument();
  expect(screen.getByText(/阶段 2 · 最终输出/)).toBeInTheDocument();
  // 下游阶段的数据源显示上游选择（数据源步骤默认展开）。
  expect(screen.getAllByText("数据来源（上游阶段）").length).toBeGreaterThan(0);
  // 排序与限制仅最后阶段可用。
  expect(screen.getByText("仅最后一个阶段生成排序与限制")).toBeInTheDocument();
});

test("shows the generated SQL panel next to the steps", () => {
  renderBuilder(makeModel(), { formattedSql: "SELECT 1 FROM orders" });
  expect(screen.getByText("生成的 SQL")).toBeInTheDocument();
  expect(screen.getByText("SELECT 1 FROM orders")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /复制/ })).toBeEnabled();
});

test("steps are disabled without a source", () => {
  const emptyStageModel = makeModel([
    {
      ...emptyStage("stage_1", { kind: "table", schema: "public", table: "" }),
    },
  ]);
  renderBuilder(emptyStageModel);
  // 数据源之外的步骤摘要显示“请先选择数据源”。
  expect(screen.getAllByText("请先选择数据源").length).toBeGreaterThan(1);
});
