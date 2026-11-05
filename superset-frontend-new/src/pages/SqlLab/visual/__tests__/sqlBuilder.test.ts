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

test("builds a simple single-table select without table prefixes", () => {
  const model = buildQueryModel({
    columns: [
      { source: { kind: "column", column: "id" } },
      { source: { kind: "column", column: "status" } },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain("SELECT\n  id,\n  status");
  expect(sql).toContain("FROM orders");
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
  expect(sql).toContain('amount / NULLIF(qty, 0) AS "客单价"');
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
  expect(sql).toContain(`status = 'O''Brien'`);
  expect(sql).toContain(`status LIKE '%50\\%%' ESCAPE '\\'`);
  expect(sql).toContain("amount BETWEEN 10 AND 99.5");
  expect(sql).toContain("OR id IN (1, 2, 3)");
  expect(sql).toContain("customer_id IS NULL");
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
    `(created_at >= '2024-01-01' AND created_at < '2024-02-01')`,
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
    "LEFT JOIN customers ON orders.customer_id = customers.id AND orders.id = customers.id",
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
  expect(sql).toContain("LEFT JOIN other.customers");
  expect(sql).toContain("orders.customer_id = customers.id");
  // 跨模式关联表的列类型来自 other:customers（字符串列按字符串字面量生成）。
  expect(sql).toContain("customers.tier = 'gold'");
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
  expect(sql).toContain("INNER JOIN orders AS orders_2");
  expect(sql).toContain("orders.id = orders_2.id");
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
  // 分组列与输出列同名：不再生成 `orders.status AS status`。
  expect(sql).toContain("SELECT\n  status,");
  expect(sql).toContain('COUNT(*) AS "计数"');
  expect(sql).toContain('SUM(amount) AS "总金额"');
  expect(sql).toContain("GROUP BY\n  status");
  expect(sql).toContain("HAVING\n  COUNT(*) > 10");
  expect(sql).toContain('ORDER BY\n  "总金额" DESC,\n  status ASC');
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
    "DATE_TRUNC('month', created_at) AS created_at",
  );
  // MySQL / BigQuery 不把所选模式设为会话默认，模式前缀保留。
  expect(buildSql(model, "mysql", testMetas)).toContain(
    "DATE_FORMAT(created_at,'%Y-%m-01') AS created_at",
  );
  expect(buildSql(model, "bigquery", testMetas)).toContain(
    "DATE_TRUNC(created_at, MONTH) AS created_at",
  );
  // Unsupported engines fall back to the raw column.
  const fallback = buildSql(model, "druid", testMetas);
  expect(fallback).toContain("created_at AS created_at");
  expect(fallback).not.toContain("DATE_TRUNC");
});

test("schema prefix is only omitted for engines that apply the selected schema", () => {
  const model = buildQueryModel({
    columns: [{ source: { kind: "column", column: "id" } }],
  });
  // PostgreSQL 系引擎执行时会 SET search_path，可安全省略模式前缀。
  expect(buildSql(model, "postgresql", testMetas)).toContain("FROM orders");
  // MySQL / MSSQL / 未知引擎保留模式前缀（安全标识符本身不再加引号）。
  expect(buildSql(model, "mysql", testMetas)).toContain("FROM public.orders");
  expect(buildSql(model, "mssql", testMetas)).toContain("FROM public.orders");
  expect(buildSql(model, undefined, testMetas)).toContain("FROM public.orders");
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
    "status = TRUE",
  );
  expect(buildSql(withFilter, "mssql", testMetas)).toContain("status = 1");
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
  expect(sql).toContain("WITH\n  stage_1 AS (");
  expect(sql).toContain("GROUP BY\n    status");
  expect(sql).toContain('SUM(amount) AS "总金额"');
  // 阶段 2 从 CTE 读取，并再关联物理表。
  expect(sql).toContain("FROM stage_1");
  expect(sql).toContain("LEFT JOIN customers");
  expect(sql).toContain("stage_1.status = customers.name");
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

test("custom metrics keep the expression as-is and use the label as alias", () => {
  const model = buildQueryModel({
    metrics: [
      {
        id: "m1",
        kind: "custom",
        label: "enter_dt",
        customSql: "min(to_date(device_enter_date::text, 'YYYYMMDD'))",
      },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain(
    "min(to_date(device_enter_date::text, 'YYYYMMDD')) AS enter_dt",
  );
});

test("aggregates over an expression use the expression name", () => {
  const model = buildQueryModel({
    expressions: [
      {
        id: "e1",
        name: "enter_dt",
        sql: "to_date(device_enter_date::text, 'YYYYMMDD')",
      },
    ],
    metrics: [
      {
        id: "m1",
        kind: "min",
        label: "",
        ref: { kind: "expression", expressionId: "e1" },
      },
    ],
    sorts: [{ ref: { kind: "metric", metricId: "m1" }, desc: true }],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain(
    `MIN(to_date(device_enter_date::text, 'YYYYMMDD')) AS "最小_表达式"`,
  );
  expect(sql).toContain('ORDER BY\n  "最小_表达式" DESC');
});

test("sorting by a custom metric uses its label", () => {
  const model = buildQueryModel({
    metrics: [
      {
        id: "m1",
        kind: "custom",
        label: "enter_dt",
        customSql: "min(to_date(device_enter_date::text, 'YYYYMMDD'))",
      },
    ],
    sorts: [{ ref: { kind: "metric", metricId: "m1" }, desc: true }],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain("ORDER BY\n  enter_dt DESC");
});

test("custom metrics and expressions reject a trailing AS alias with a hint", () => {
  expect(
    validateModelForRun(
      buildQueryModel({
        metrics: [
          {
            id: "m1",
            kind: "custom",
            label: "",
            customSql: "min(x) AS enter_dt",
          },
        ],
      }),
    ),
  ).toContain("「显示名」请另填（不要写 AS 别名）");
  expect(
    validateModelForRun(
      buildQueryModel({
        expressions: [{ id: "e1", name: "", sql: "x + 1 AS total" }],
      }),
    ),
  ).toContain("「名称」请另填（不要写 AS 别名）");
  // 结尾的 CAST(... AS type) 不是输出别名，不应误判。
  expect(
    validateModelForRun(
      buildQueryModel({
        metrics: [
          {
            id: "m1",
            kind: "custom",
            label: "x",
            customSql: "sum(cast(amount as int))",
          },
        ],
      }),
    ),
  ).toBeNull();
});

test("empty custom metric expression is rejected for run", () => {
  expect(
    validateModelForRun(
      buildQueryModel({
        metrics: [{ id: "m1", kind: "custom", label: "", customSql: "" }],
      }),
    ),
  ).toContain("自定义指标缺少表达式");
});

test("independent stages can be combined by a downstream stage joining both", () => {
  // 阶段 1/2 相互独立（各自从物理表聚合），阶段 3 以阶段 1 为来源并关联阶段 2。
  const stage1: VisualStage = {
    ...makeStage({
      groupBy: [{ ref: { kind: "column", column: "status" } }],
      metrics: [{ id: "m1", kind: "count", label: "订单数" }],
    }),
  };
  const stage2: VisualStage = {
    ...emptyStage("stage_2", {
      kind: "table",
      schema: "public",
      table: "customers",
    }),
    groupBy: [{ ref: { kind: "column", column: "name" } }],
    metrics: [{ id: "m2", kind: "count", label: "客户数" }],
  };
  const stage3: VisualStage = {
    ...emptyStage("stage_3", { kind: "stage", stageId: stage1.id }),
    joins: [
      {
        id: "j1",
        type: "left",
        table: "",
        schema: "",
        stageId: stage2.id,
        keys: [
          {
            left: { kind: "column", column: "status" },
            right: { kind: "column", joinId: "j1", column: "name" },
          },
        ],
      },
    ],
    columns: [
      { source: { kind: "column", column: "status" } },
      { source: { kind: "column", joinId: "j1", column: "name" } },
    ],
    limit: 20,
  };
  const model: VisualQueryModel = {
    ...emptyModel(1, "public"),
    stages: [stage1, stage2, stage3],
  };
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain("WITH\n  stage_1 AS (");
  expect(sql).toContain("stage_2 AS (");
  // 阶段 3 同时引用两个独立阶段：来自阶段 1，关联阶段 2 的 CTE。
  expect(sql).toContain("FROM stage_1");
  expect(sql).toContain("LEFT JOIN stage_2");
  expect(sql).toContain("stage_1.status = stage_2.name");
  expect(sql).toContain("LIMIT 20");
  expect(validateModelForRun(model)).toBeNull();
});

test("stages not referenced by the final output stage are not emitted", () => {
  const stage1 = makeStage({
    columns: [{ source: { kind: "column", column: "id" } }],
  });
  // 独立分支：没有被最终输出阶段引用，不应生成 CTE。
  const draft: VisualStage = {
    ...emptyStage("stage_2", {
      kind: "table",
      schema: "public",
      table: "customers",
    }),
    columns: [{ source: { kind: "column", column: "id" } }],
  };
  const stage3: VisualStage = {
    ...emptyStage("stage_3", { kind: "stage", stageId: stage1.id }),
    columns: [{ source: { kind: "column", column: "id" } }],
    limit: 10,
  };
  const model: VisualQueryModel = {
    ...emptyModel(1, "public"),
    stages: [stage1, draft, stage3],
  };
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain("stage_1 AS (");
  expect(sql).not.toContain("stage_2 AS (");
  expect(sql).toContain("FROM stage_1");
  expect(sql).toContain("LIMIT 10");
});

test("a trailing draft stage does not replace the final output", () => {
  const stage1 = makeStage({
    columns: [{ source: { kind: "column", column: "id" } }],
  });
  const draft: VisualStage = emptyStage("stage_2", {
    kind: "table",
    schema: "public",
    table: "",
  });
  const model: VisualQueryModel = {
    ...emptyModel(1, "public"),
    stages: [stage1, draft],
  };
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain("FROM orders");
  expect(sql).not.toContain("WITH");
  // 未配置的草稿阶段不阻塞运行。
  expect(validateModelForRun(model)).toBeNull();
});

test("stage joins validate the referenced upstream stage", () => {
  const stage1 = makeStage();
  const stage2: VisualStage = {
    ...emptyStage("stage_2", {
      kind: "table",
      schema: "public",
      table: "customers",
    }),
  };
  const stage3: VisualStage = {
    ...emptyStage("stage_3", { kind: "stage", stageId: stage1.id }),
    joins: [
      {
        id: "j1",
        type: "left",
        table: "",
        schema: "",
        stageId: "missing",
        keys: [],
      },
    ],
  };
  const model: VisualQueryModel = {
    ...emptyModel(1, "public"),
    stages: [stage1, stage2, stage3],
  };
  expect(validateModelForRun(model)).toContain("关联的上游阶段不存在");
});

test("does not generate partial SQL when an upstream CTE is not configured", () => {
  const stage1: VisualStage = emptyStage("stage_1", {
    kind: "table",
    schema: "public",
    table: "",
  });
  const stage2: VisualStage = {
    ...emptyStage("stage_2", { kind: "stage", stageId: stage1.id }),
    columns: [{ source: { kind: "column", column: "id" } }],
  };
  const model: VisualQueryModel = {
    ...emptyModel(1, "public"),
    stages: [stage1, stage2],
  };
  expect(buildSql(model, "postgresql", testMetas)).toBe("");
});

test("custom expression output columns and metrics have no redundant parentheses", () => {
  const model = buildQueryModel({
    expressions: [{ id: "e1", name: "客单价", sql: "amount / NULLIF(qty, 0)" }],
    columns: [{ source: { kind: "expression", expressionId: "e1" } }],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('amount / NULLIF(qty, 0) AS "客单价"');
  expect(sql).not.toContain("(amount / NULLIF(qty, 0)) AS");
});

test("filters on custom expressions keep the grouping parentheses", () => {
  const model = buildQueryModel({
    expressions: [{ id: "e1", name: "客单价", sql: "amount / NULLIF(qty, 0)" }],
    filters: [
      {
        id: "f1",
        connector: "and",
        ref: { kind: "expression", expressionId: "e1" },
        op: "gt",
        values: ["10"],
      },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain("WHERE\n  (amount / NULLIF(qty, 0)) > '10'");
});

test("custom metrics in SELECT and HAVING are not wrapped in redundant parentheses", () => {
  const model = buildQueryModel({
    metrics: [
      {
        id: "m1",
        kind: "custom",
        label: "净额",
        customSql: "sum(amount) - count(*)",
      },
    ],
    having: [
      { id: "h1", connector: "and", metricId: "m1", op: "gt", values: ["10"] },
    ],
  });
  const sql = buildSql(model, "postgresql", testMetas);
  expect(sql).toContain('sum(amount) - count(*) AS "净额"');
  expect(sql).toContain("HAVING\n  sum(amount) - count(*) > 10");
  expect(sql).not.toContain("(sum(amount) - count(*))");
});

test("reserved or unusual identifiers keep engine-specific quotes", () => {
  const weirdMetas: Record<string, TableMetadata> = {
    "public:weird": {
      name: "weird",
      columns: [
        { name: "order", type: "INTEGER" },
        { name: "MixedCase", type: "INTEGER" },
        { name: "a b", type: "INTEGER" },
      ],
    },
  };
  const model: VisualQueryModel = {
    ...emptyModel(1, "public"),
    stages: [
      makeStage(
        {
          columns: [
            { source: { kind: "column", column: "order" } },
            { source: { kind: "column", column: "MixedCase" } },
            { source: { kind: "column", column: "a b" } },
          ],
        },
        "weird",
      ),
    ],
  };
  const postgres = buildSql(model, "postgresql", weirdMetas);
  expect(postgres).toContain('"order"');
  expect(postgres).toContain('"MixedCase"');
  expect(postgres).toContain('"a b"');
  const mysql = buildSql(model, "mysql", weirdMetas);
  expect(mysql).toContain("`order`");
  expect(mysql).toContain("`MixedCase`");
  const mssql = buildSql(model, "mssql", weirdMetas);
  expect(mssql).toContain("[order]");
});

test("numeric filter literals stay unquoted with the real metadata cache key", () => {
  const dbMetas: Record<string, TableMetadata> = {
    "1:public:orders": testMetas["public:orders"],
  };
  const model = buildQueryModel({
    filters: [
      {
        id: "f1",
        connector: "and",
        ref: { kind: "column", column: "amount" },
        op: "gte",
        values: ["10"],
      },
      {
        id: "f2",
        connector: "and",
        ref: { kind: "column", column: "status" },
        op: "eq",
        values: ["paid"],
      },
    ],
  });
  const sql = buildSql(model, "postgresql", dbMetas);
  expect(sql).toContain("amount >= 10");
  expect(sql).toContain("status = 'paid'");
});
