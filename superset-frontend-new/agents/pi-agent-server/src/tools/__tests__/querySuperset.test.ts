import { describe, test, expect } from "vitest";
import {
  buildMetricEntry,
  buildFilters,
  toMarkdownTable,
  parseAndCacheSchema,
  parseRowLimit,
  parseOrderby,
} from "../querySuperset.js";

describe("parseRowLimit", () => {
  test("defaults to 1000 so detail queries are not silently truncated", () => {
    expect(parseRowLimit(undefined)).toBe(1000);
    expect(parseRowLimit(null)).toBe(1000);
    expect(parseRowLimit("100" as never)).toBe(1000);
  });

  test("clamps explicit limits to the 1-1000 range", () => {
    expect(parseRowLimit(500)).toBe(500);
    expect(parseRowLimit(0)).toBe(1);
    expect(parseRowLimit(5000)).toBe(1000);
    expect(parseRowLimit(123.6)).toBe(124);
  });
});

describe("parseAndCacheSchema", () => {
  test("distinguishes dimension columns from numeric columns", () => {
    const schema = parseAndCacheSchema({
      result: {
        columns: [
          { column_name: "日期", groupby: true, type_generic: 2 },
          { column_name: "主游戏", groupby: true, type_generic: 1 },
          { column_name: "渠道商", groupby: true, type_generic: 1 },
          { column_name: "消耗", groupby: true, type_generic: 0 },
          { column_name: "新增进入", groupby: true, type_generic: 0 },
          { column_name: "主游戏[ID]", groupby: true, type_generic: 0 },
        ],
        metrics: [{ metric_name: "cpa" }, { metric_name: "roi_1" }],
      },
    });

    expect(schema).toContain("可用维度列: 日期, 主游戏, 渠道商");
    expect(schema).toContain(
      "可用数值列（可直接 SUM() 作为指标）: 消耗, 新增进入",
    );
    expect(schema).toContain("可用指标: cpa, roi_1");
    expect(schema).not.toContain("主游戏[ID]");
    expect(schema).not.toContain("消耗[ID]");
  });

  test("numeric SUM metric passes the valid metric names whitelist", () => {
    parseAndCacheSchema({
      result: {
        columns: [
          { column_name: "日期", groupby: true, type_generic: 2 },
          { column_name: "返点后消耗", groupby: true, type_generic: 0 },
        ],
        metrics: [],
      },
    });

    const entry = buildMetricEntry("SUM(返点后消耗)");
    expect(entry).toEqual({
      expressionType: "SIMPLE",
      column: { column_name: "返点后消耗" },
      aggregate: "SUM",
      label: "SUM(返点后消耗)",
    });
  });

  test("omits numeric section when no numeric columns exist", () => {
    const schema = parseAndCacheSchema({
      result: {
        columns: [{ column_name: "主游戏", groupby: true, type_generic: 1 }],
        metrics: [],
      },
    });
    expect(schema).not.toContain("可用数值列");
  });
});

describe("buildMetricEntry", () => {
  test("converts SUM(...) to simple aggregate expression", () => {
    const result = buildMetricEntry("SUM(返点后消耗)");
    expect(result).toEqual({
      expressionType: "SIMPLE",
      column: { column_name: "返点后消耗" },
      aggregate: "SUM",
      label: "SUM(返点后消耗)",
    });
  });

  test("returns schema metrics as strings", () => {
    parseAndCacheSchema({
      result: {
        columns: [{ column_name: "日期", groupby: true, type_generic: 2 }],
        metrics: [{ metric_name: "cpa" }, { metric_name: "roi_1" }],
      },
    });
    expect(buildMetricEntry("cpa")).toBe("cpa");
    expect(buildMetricEntry("roi_1")).toBe("roi_1");
  });

  test("wraps unknown metrics in SUM() aggregation", () => {
    const result = buildMetricEntry("返点后消耗") as any;
    expect(result.expressionType).toBe("SIMPLE");
    expect(result.column.column_name).toBe("返点后消耗");
    expect(result.aggregate).toBe("SUM");
    expect(result.label).toBe("SUM(返点后消耗)");

    const result2 = buildMetricEntry("新增进入") as any;
    expect(result2.label).toBe("SUM(新增进入)");
  });
});

describe("buildFilters", () => {
  test("returns empty array for undefined", () => {
    expect(buildFilters(undefined)).toEqual([]);
  });

  test("returns empty array for empty object", () => {
    expect(buildFilters({})).toEqual([]);
  });

  test("builds single filter", () => {
    const result = buildFilters({ 主游戏: "三国：天命再临" });
    expect(result).toEqual([
      {
        expressionType: "SIMPLE",
        subject: "主游戏",
        operator: "==",
        comparator: "三国：天命再临",
      },
    ]);
  });

  test("builds multiple filters with number value", () => {
    const result = buildFilters({ 渠道商: "微信小游戏", team_id: 5 });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      subject: "渠道商",
      comparator: "微信小游戏",
    });
    expect(result[1]).toMatchObject({ subject: "team_id", comparator: "5" });
  });

  test("builds IN filter for array values", () => {
    const result = buildFilters({ 主游戏: ["三国", "西游"] });
    expect(result).toEqual([
      {
        expressionType: "SIMPLE",
        subject: "主游戏",
        operator: "IN",
        comparator: ["三国", "西游"],
      },
    ]);
  });
});

describe("toMarkdownTable", () => {
  const cols = ["渠道商", "消耗", "新增"];
  const rows = [
    { 渠道商: "微信小游戏", 消耗: 1000, 新增: 500 },
    { 渠道商: "天拓手游", 消耗: 800, 新增: 300 },
  ];

  test("formats header with pipe separators", () => {
    const result = toMarkdownTable(cols, rows, 100);
    const lines = result.split("\n");
    expect(lines[0]).toBe("渠道商 | 消耗 | 新增");
  });

  test("formats separator line", () => {
    const result = toMarkdownTable(cols, rows, 100);
    const lines = result.split("\n");
    expect(lines[1]).toBe("--- | --- | ---");
  });

  test("formats data rows", () => {
    const result = toMarkdownTable(cols, rows, 100);
    const lines = result.split("\n");
    expect(lines[2]).toContain("微信小游戏");
    expect(lines[2]).toContain("1000");
    expect(lines[2]).toContain("500");
    expect(lines[3]).toContain("天拓手游");
  });

  test("limits rows to maxRows", () => {
    const manyRows = Array.from({ length: 20 }, (_, i) => ({
      渠道商: `渠道${i}`,
      消耗: i * 100,
      新增: i * 50,
    }));
    const result = toMarkdownTable(cols, manyRows, 5);
    const lines = result.split("\n");
    expect(lines.length - 2).toBe(5);
  });

  test("formats date timestamps as month/day", () => {
    const dateCols = ["日期", "消耗"];
    const dateRows = [{ 日期: 1704067200000, 消耗: 100 }];
    const result = toMarkdownTable(dateCols, dateRows, 100);
    expect(result).toContain("1/1");
  });

  test("handles null values", () => {
    const nullRows = [{ 渠道商: "测试", 消耗: null, 新增: undefined as any }];
    const result = toMarkdownTable(cols, nullRows, 100);
    expect(result).toContain("-");
  });

  test("rounds float numbers to 2 decimal places", () => {
    const floatRows = [{ 渠道商: "测试", 消耗: 100.456, 新增: 200.789 }];
    const result = toMarkdownTable(cols, floatRows, 100);
    expect(result).toContain("100.46");
    expect(result).toContain("200.79");
  });

  test("displays integers without decimals", () => {
    const intRows = [{ 渠道商: "测试", 消耗: 100, 新增: 200 }];
    const result = toMarkdownTable(cols, intRows, 100);
    expect(result).toContain("100");
    expect(result).not.toContain("100.");
  });

  test("returns empty table for no rows", () => {
    const result = toMarkdownTable(cols, [], 100);
    const lines = result.split("\n");
    expect(lines[0]).toBe("渠道商 | 消耗 | 新增");
    expect(lines[1]).toBe("--- | --- | ---");
    expect(lines).toHaveLength(2);
  });
});

describe("toMarkdownTable truncation notice", () => {
  const cols = ["渠道商", "消耗"];
  const rows = [
    { 渠道商: "A", 消耗: 60 },
    { 渠道商: "B", 消耗: 30 },
    { 渠道商: "C", 消耗: 10 },
  ];

  test("reports total rows, kept rows and missing percentage", () => {
    const result = toMarkdownTable(cols, rows, 100, 2);
    expect(result).toContain("共 5 行");
    expect(result).toContain("仅展示按首个指标累计占比前 95% 的主要项（3 行）");
    expect(result).toContain("另有 2 行（40%）未显示");
    expect(result).toContain("show_all=true");
  });

  test("omits notice when nothing is truncated", () => {
    const result = toMarkdownTable(cols, rows, 100, 0);
    expect(result).not.toContain("未显示");
  });
});

describe("parseOrderby", () => {
  test("parses standard array form", () => {
    expect(parseOrderby([["SUM(消耗)", false]])).toEqual([["消耗", false]]);
  });

  test("parses arrow string form", () => {
    expect(parseOrderby("日期↓")).toEqual([["日期", false]]);
    expect(parseOrderby("日期↑")).toEqual([["日期", true]]);
  });

  test("parses desc/asc and chinese suffixes", () => {
    expect(parseOrderby("消耗 desc")).toEqual([["消耗", false]]);
    expect(parseOrderby("消耗 降序")).toEqual([["消耗", false]]);
    expect(parseOrderby("消耗 升序")).toEqual([["消耗", true]]);
  });

  test("returns empty for invalid input", () => {
    expect(parseOrderby(undefined)).toEqual([]);
    expect(parseOrderby("")).toEqual([]);
    expect(parseOrderby(123 as never)).toEqual([]);
  });
});

describe("schema-driven metric validation", () => {
  test("all schema metrics are exposed and accepted", () => {
    const schema = parseAndCacheSchema({
      result: {
        columns: [{ column_name: "日期", groupby: true, type_generic: 2 }],
        metrics: [
          { metric_name: "ltv_1" },
          { metric_name: "ltv_14" },
          { metric_name: "ltv_21" },
          { metric_name: "cpa" },
        ],
      },
    });
    expect(schema).toContain("可用指标: ltv_1, ltv_14, ltv_21, cpa");
    // Schema metrics pass verbatim
    expect(buildMetricEntry("ltv_14")).toBe("ltv_14");
    expect(buildMetricEntry("cpa")).toBe("cpa");
  });
});
