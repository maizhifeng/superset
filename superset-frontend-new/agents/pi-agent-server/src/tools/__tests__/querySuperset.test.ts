import { describe, test, expect } from "vitest";
import { buildMetricEntry, buildFilters, toMarkdownTable } from "../querySuperset.js";

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

  test("returns known saved metrics as strings", () => {
    expect(buildMetricEntry("cpa")).toBe("cpa");
    expect(buildMetricEntry("roi_1")).toBe("roi_1");
    expect(buildMetricEntry("ltv_1")).toBe("ltv_1");
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
    expect(result[0]).toMatchObject({ subject: "渠道商", comparator: "微信小游戏" });
    expect(result[1]).toMatchObject({ subject: "team_id", comparator: "5" });
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
