import { test, expect } from "vitest";
import type { TableMetadata } from "@/types/api";
import {
  buildSql,
  validateModelForRun,
} from "@/pages/SqlLab/visual/sqlBuilder";
import {
  emptyModel,
  emptyStage,
  type VisualQueryModel,
  type VisualStage,
} from "@/pages/SqlLab/visual/types";

const testMetas: Record<string, TableMetadata> = {
  "public:orders": {
    name: "orders",
    columns: [
      { name: "id", type: "INTEGER" },
      { name: "status", type: "VARCHAR(20)" },
      { name: "amount", type: "DECIMAL(10,2)" },
      { name: "qty", type: "INTEGER" },
      { name: "created_at", type: "TIMESTAMP" },
      { name: "customer_id", type: "INTEGER" },
    ],
  },
  "public:customers": {
    name: "customers",
    columns: [
      { name: "id", type: "INTEGER" },
      { name: "name", type: "VARCHAR(100)" },
    ],
    foreignKeys: [
      {
        column_names: ["id"],
        referred_table: "orders",
        referred_columns: ["customer_id"],
      },
    ],
  },
  "other:customers": {
    name: "customers",
    columns: [
      { name: "id", type: "INTEGER" },
      { name: "tier", type: "VARCHAR(20)" },
    ],
  },
};

function makeStage(
  overrides: Partial<VisualStage> = {},
  table = "orders",
): VisualStage {
  return {
    ...emptyStage("stage_1", { kind: "table", schema: "public", table }),
    ...overrides,
  };
}

function buildQueryModel(
  overrides: Partial<VisualStage> = {},
): VisualQueryModel {
  const stage = makeStage(overrides);
  return { ...emptyModel(1, "public"), stages: [stage] };
}

test("returns an empty string when no base table is selected", () => {
  expect(buildSql(emptyModel(1, "public"), "postgresql", testMetas)).toBe("");
});

test("builds a simple single-table select with qualified identifiers", () => {
  const model = buildQueryModel({
    columns: [
      { source: { kind: "column", column: "id" } },
      { source: { kind: "column", column: "status" } },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('SELECT\n  "orders"."id",\n  "orders"."status"');
  expect(sql).toContain('FROM "public"."orders"');
  expect(sql).toContain("LIMIT 1000");
  expect(sql).not.toContain(";");
});

test("selects * when no output columns are chosen", () => {
  const sql = buildSql(buildQueryModel(), "postgresql", testMetas);
  expect(sql).toContain("SELECT\n  *\nFROM");
});

test("quotes aliases and de-duplicates labels", () => {
  const model = buildQueryModel({
    columns: [
      { source: { kind: "column", column: "id" }, alias: "编号" },
      { source: { kind: "column", column: "amount" }, alias: "编号" },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('AS "编号"');
  expect(sql).toContain('AS "编号_2"');
});

test("inlines custom expressions and uses the expression name as default alias", () => {
  const model = buildQueryModel({
    expressions: [{ id: "e1", name: "客单价", sql: "amount / NULLIF(qty, 0)" }],
    columns: [{ source: { kind: "expression", expressionId: "e1" } }],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('(amount / NULLIF(qty, 0)) AS "客单价"');
});

test("filters use type-aware literals and escaping", () => {
  const model = buildQueryModel({
    filters: [
      {
        id: "f1",
        connector: "and",
        ref: { kind: "column", column: "status" },
        op: "eq",
        values: ["O'Brien"],
      },
      {
        id: "f2",
        connector: "and",
        ref: { kind: "column", column: "status" },
        op: "contains",
        values: ["50%"],
      },
      {
        id: "f3",
        connector: "and",
        ref: { kind: "column", column: "amount" },
        op: "between",
        values: ["10", "99.5"],
      },
      {
        id: "f4",
        connector: "or",
        ref: { kind: "column", column: "id" },
        op: "in",
        values: ["1, 2, 3"],
      },
      {
        id: "f5",
        connector: "and",
        ref: { kind: "column", column: "customer_id" },
        op: "is_null",
        values: [],
      },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain(`"orders"."status" = 'O''Brien'`);
  expect(sql).toContain(`"orders"."status" LIKE '%50\\%%' ESCAPE '\\'`);
  expect(sql).toContain(`"orders"."amount" BETWEEN 10 AND 99.5`);
  expect(sql).toContain(`OR "orders"."id" IN (1, 2, 3)`);
  expect(sql).toContain(`"orders"."customer_id" IS NULL`);
});

test("temporal filters build range conditions", () => {
  const model = buildQueryModel({
    filters: [
      {
        id: "f1",
        connector: "and",
        ref: { kind: "column", column: "created_at" },
        op: "date_between",
        values: ["2024-01-01", "2024-01-31"],
      },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain(
    `("orders"."created_at" >= '2024-01-01' AND "orders"."created_at" < '2024-02-01')`,
  );
});

test("joins qualify both sides and support multiple key pairs", () => {
  const model = buildQueryModel({
    joins: [
      {
        id: "j1",
        type: "left",
        table: "customers",
        keys: [
          {
            left: { kind: "column", column: "customer_id" },
            right: { kind: "column", joinId: "j1", column: "id" },
          },
          {
            left: { kind: "column", column: "id" },
            right: { kind: "column", joinId: "j1", column: "id" },
          },
        ],
      },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain(
    'LEFT JOIN "public"."customers" ON "orders"."customer_id" = "customers"."id" AND "orders"."id" = "customers"."id"',
  );
});

test("joins can target a different schema in the same database", () => {
  const model = buildQueryModel({
    joins: [
      {
        id: "j1",
        type: "left",
        table: "customers",
        schema: "other",
        keys: [
          {
            left: { kind: "column", column: "customer_id" },
            right: { kind: "column", joinId: "j1", column: "id" },
          },
        ],
      },
    ],
    filters: [
      {
        id: "f1",
        connector: "and",
        ref: { kind: "column", joinId: "j1", column: "tier" },
        op: "eq",
        values: ["gold"],
      },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('LEFT JOIN "other"."customers"');
  expect(sql).toContain('"orders"."customer_id" = "customers"."id"');
  // 跨模式关联表的列类型来自 other:customers（字符串列按字符串字面量生成）。
  expect(sql).toContain(`"customers"."tier" = 'gold'`);
});

test("duplicate table names get suffixed aliases", () => {
  const model = buildQueryModel({
    joins: [
      {
        id: "j1",
        type: "inner",
        table: "orders",
        keys: [
          {
            left: { kind: "column", column: "id" },
            right: { kind: "column", column: "id", joinId: "j1" },
          },
        ],
      },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('INNER JOIN "public"."orders" AS "orders_2"');
  expect(sql).toContain('"orders"."id" = "orders_2"."id"');
});

test("aggregates with group by, metrics, having and metric sorting", () => {
  const model = buildQueryModel({
    groupBy: [{ ref: { kind: "column", column: "status" } }],
    metrics: [
      { id: "m1", kind: "count", label: "" },
      {
        id: "m2",
        kind: "sum",
        label: "总金额",
        ref: { kind: "column", column: "amount" },
      },
    ],
    having: [
      { id: "h1", connector: "and", metricId: "m1", op: "gt", values: ["10"] },
    ],
    sorts: [
      { ref: { kind: "metric", metricId: "m2" }, desc: true },
      { ref: { kind: "column", column: "status" }, desc: false },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('"orders"."status" AS "status"');
  expect(sql).toContain('COUNT(*) AS "计数"');
  expect(sql).toContain('SUM("orders"."amount") AS "总金额"');
  expect(sql).toContain('GROUP BY\n  "orders"."status"');
  expect(sql).toContain("HAVING\n  COUNT(*) > 10");
  expect(sql).toContain('ORDER BY\n  "总金额" DESC,\n  "status" ASC');
});

test("date unit truncation follows the backend dialect", () => {
  const model = buildQueryModel({
    groupBy: [
      {
        ref: { kind: "column", column: "created_at" },
        dateUnit: "month",
      },
    ],
    metrics: [{ id: "m1", kind: "count", label: "" }],
  });
  expect(buildSql(model, "postgresql", testMetas)).toContain(
    `DATE_TRUNC('month', "orders"."created_at") AS "created_at"`,
  );
  expect(buildSql(model, "mysql", testMetas)).toContain(
    "DATE_FORMAT(`orders`.`created_at`,'%Y-%m-01') AS `created_at`",
  );
  expect(buildSql(model, "bigquery", testMetas)).toContain(
    "DATE_TRUNC(`orders`.`created_at`, MONTH) AS `created_at`",
  );
  // Unsupported engines fall back to the raw column.
  const fallback = buildSql(model, "druid", testMetas);
  expect(fallback).toContain('"orders"."created_at" AS "created_at"');
  expect(fallback).not.toContain("DATE_TRUNC");
});

test("identifier quoting follows the backend (backticks, brackets)", () => {
  const model = buildQueryModel({
    columns: [{ source: { kind: "column", column: "id" } }],
  });
  expect(buildSql(model, "mysql", testMetas)).toContain("`public`.`orders`");
  expect(buildSql(model, "mssql", testMetas)).toContain("[public].[orders]");
  expect(buildSql(model, undefined, testMetas)).toContain('"public"."orders"');
});

test("boolean filters respect engines without TRUE/FALSE keywords", () => {
  const withFilter = buildQueryModel({
    filters: [
      {
        id: "f1",
        connector: "and",
        ref: { kind: "column", column: "status" },
        op: "is_true",
        values: [],
      },
    ],
  });
  expect(buildSql(withFilter, "postgresql", testMetas)).toContain(
    '"orders"."status" = TRUE',
  );
  expect(buildSql(withFilter, "mssql", testMetas)).toContain(
    "[orders].[status] = 1",
  );
});

test("limit is clamped to a sane range", () => {
  expect(
    buildSql(buildQueryModel({ limit: 0 }), "postgresql", testMetas),
  ).toContain("LIMIT 1");
  expect(
    buildSql(buildQueryModel({ limit: 999999 }), "postgresql", testMetas),
  ).toContain("LIMIT 100000");
});

test("validateModelForRun reports the first blocking reason", () => {
  expect(validateModelForRun(emptyModel(1, "public"))).toBe("请先选择数据源");
  expect(
    validateModelForRun(
      buildQueryModel({
        joins: [{ id: "j1", type: "left", table: "customers", keys: [] }],
      }),
    ),
  ).toContain("缺少关联键");
  expect(
    validateModelForRun(
      buildQueryModel({
        filters: [
          {
            id: "f1",
            connector: "and",
            ref: { kind: "column", column: "status" },
            op: "eq",
            values: [""],
          },
        ],
      }),
    ),
  ).toContain("缺少取值");
  expect(
    validateModelForRun(
      buildQueryModel({
        metrics: [{ id: "m1", kind: "sum", label: "" }],
      }),
    ),
  ).toContain("指标缺少字段");
  expect(validateModelForRun(buildQueryModel())).toBeNull();
});

test("multi-stage models render CTEs, aggregating before joining", () => {
  const stage1 = makeStage({
    groupBy: [{ ref: { kind: "column", column: "status" } }],
    metrics: [
      {
        id: "m1",
        kind: "sum",
        label: "总金额",
        ref: { kind: "column", column: "amount" },
      },
    ],
  });
  const stage2: VisualStage = {
    ...emptyStage("stage_2", { kind: "stage", stageId: stage1.id }),
    joins: [
      {
        id: "j1",
        type: "left",
        table: "customers",
        keys: [
          {
            left: { kind: "column", column: "status" },
            right: { kind: "column", joinId: "j1", column: "name" },
          },
        ],
      },
    ],
    columns: [{ source: { kind: "column", joinId: "j1", column: "name" } }],
    limit: 50,
  };
  const model: VisualQueryModel = {
    ...emptyModel(1, "public"),
    stages: [stage1, stage2],
  };
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('WITH\n  "stage_1" AS (');
  expect(sql).toContain('GROUP BY\n    "orders"."status"');
  expect(sql).toContain('SUM("orders"."amount") AS "总金额"');
  // 阶段 2 从 CTE 读取，并再关联物理表。
  expect(sql).toContain('FROM "stage_1"');
  expect(sql).toContain('LEFT JOIN "public"."customers"');
  expect(sql).toContain('"stage_1"."status" = "customers"."name"');
  expect(sql).toContain("LIMIT 50");
  // 中间 CTE 不生成 LIMIT/ORDER BY。
  expect(sql.match(/LIMIT/g)).toHaveLength(1);
});

test("downstream stages must reference an earlier stage", () => {
  const stage1 = makeStage();
  const stage2: VisualStage = {
    ...emptyStage("stage_2", { kind: "stage", stageId: stage1.id }),
  };
  const model: VisualQueryModel = {
    ...emptyModel(1, "public"),
    stages: [stage1, stage2],
  };
  expect(validateModelForRun(model)).toBeNull();

  const broken: VisualQueryModel = {
    ...model,
    stages: [
      stage1,
      { ...stage2, source: { kind: "stage", stageId: "missing" } },
    ],
  };
  expect(validateModelForRun(broken)).toContain("阶段 2：上游阶段不存在");
});
