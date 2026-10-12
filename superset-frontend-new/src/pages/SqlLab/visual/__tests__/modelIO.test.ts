import { test, expect } from "vitest";
import {
  embedModel,
  extractModel,
  hasVisualComment,
  isModelSqlUnmodified,
  stripVisualComment,
  validateModel,
} from "@/pages/SqlLab/visual/modelIO";
import {
  emptyModel,
  emptyStage,
  type VisualQueryModel,
} from "@/pages/SqlLab/visual/types";

function sampleModel(): VisualQueryModel {
  return {
    ...emptyModel(3, "public"),
    stages: [
      {
        ...emptyStage("stage_1", {
          kind: "table",
          schema: "public",
          table: "orders",
        }),
        columns: [{ source: { kind: "column", column: "id" }, alias: "编号" }],
        filters: [
          {
            id: "f1",
            connector: "and",
            ref: { kind: "column", column: "status" },
            op: "eq",
            values: ["paid"],
          },
        ],
      },
    ],
  };
}

test("embedModel round-trips through extractModel and stripVisualComment", () => {
  const body = 'SELECT\n  "orders"."id"\nFROM "public"."orders"\nLIMIT 1000';
  const model = sampleModel();
  const embedded = embedModel(body, model);
  expect(embedded.startsWith("-- superset-viz: {")).toBe(true);
  expect(hasVisualComment(embedded)).toBe(true);

  const extracted = extractModel(embedded);
  expect(extracted).not.toBeNull();
  expect(extracted!.model.stages).toHaveLength(1);
  expect(extracted!.model.stages[0].source).toEqual({
    kind: "table",
    schema: "public",
    table: "orders",
  });
  expect(extracted!.model.stages[0].filters[0].values).toEqual(["paid"]);
  expect(extracted!.body).toBe(body);

  expect(stripVisualComment(embedded)).toBe(body);
});

test("embedModel replaces a previous comment instead of stacking it", () => {
  const body = "SELECT 1";
  const first = embedModel(body, sampleModel());
  const renamed: VisualQueryModel = {
    ...sampleModel(),
    stages: [
      {
        ...sampleModel().stages[0],
        source: { kind: "table", schema: "public", table: "customers" },
      },
    ],
  };
  const second = embedModel(first, renamed);
  expect(second.match(/-- superset-viz:/g)).toHaveLength(1);
  expect(
    (extractModel(second)?.model.stages[0].source as { table: string }).table,
  ).toBe("customers");
});

test("extractModel rejects malformed or incompatible payloads", () => {
  expect(extractModel("SELECT 1")).toBeNull();
  expect(extractModel("-- superset-viz: not-json\nSELECT 1")).toBeNull();
  expect(
    extractModel('-- superset-viz: {"v":2,"table":"orders"}\nSELECT 1'),
  ).toBeNull();
  expect(
    extractModel('-- superset-viz: {"v":1,"table":""}\nSELECT 1'),
  ).toBeNull();
});

test("validateModel migrates legacy flat models into a single stage", () => {
  const model = validateModel({
    v: 1,
    databaseId: "7",
    schema: "public",
    table: "orders",
    joins: [],
    columns: [{ source: { kind: "column", column: "id" } }],
    limit: 500,
  });
  expect(model).not.toBeNull();
  expect(model!.stages).toHaveLength(1);
  expect(model!.stages[0].name).toBe("stage_1");
  expect(model!.stages[0].source).toEqual({
    kind: "table",
    schema: "public",
    table: "orders",
  });
  expect(model!.stages[0].limit).toBe(500);
  expect(model!.stages[0].columns).toHaveLength(1);
});

test("validateModel fills defaults and keeps multi-stage sources", () => {
  const model = validateModel({
    v: 1,
    table: "orders",
    databaseId: "7",
    schema: "public",
    stages: [
      {
        name: "stage_1",
        source: { kind: "table", schema: "public", table: "orders" },
      },
      { name: "stage_2", source: { kind: "stage", stageId: "stage_1_0" } },
    ],
  });
  expect(model).not.toBeNull();
  expect(model!.stages[1].source).toEqual({
    kind: "stage",
    stageId: "stage_1_0",
  });
  expect(model!.stages[1].limit).toBeGreaterThan(0);
  expect(
    validateModel({ v: 1, table: "orders", limit: -5 })!.stages[0].limit,
  ).toBe(1000);
});

test("isModelSqlUnmodified ignores whitespace and case but detects edits", () => {
  const generated = 'SELECT "orders"."id"\nFROM "public"."orders"\nLIMIT 1000';
  const embedded = embedModel(generated, sampleModel());
  expect(isModelSqlUnmodified(embedded, generated)).toBe(true);
  expect(
    isModelSqlUnmodified(embedded, generated.toUpperCase().replace(/\n/g, " ")),
  ).toBe(true);
  const edited = embedModel(
    'SELECT "orders"."amount"\nFROM "public"."orders"\nLIMIT 1000',
    sampleModel(),
  );
  expect(isModelSqlUnmodified(edited, generated)).toBe(false);
});

test("isModelSqlUnmodified tolerates dialect quoting differences", () => {
  const model = sampleModel();
  const mysqlSql = "SELECT `orders`.`id` FROM `public`.`orders` LIMIT 1000";
  const embedded = embedModel(mysqlSql, model);
  // The same model generated with ANSI quotes must not count as modified.
  const ansiSql = 'SELECT "orders"."id" FROM "public"."orders" LIMIT 1000';
  expect(isModelSqlUnmodified(embedded, ansiSql)).toBe(true);
});
