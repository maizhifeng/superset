import { test, expect } from "vitest";
import {
  buildPivotGrid,
  aggregateValues,
  displayMetricName,
} from "@/utils/pivot";

const rows = [
  { 国家: "US", 平台: "iOS", "SUM(消耗)": 100 },
  { 国家: "US", 平台: "Android", "SUM(消耗)": 200 },
  { 国家: "CN", 平台: "iOS", "SUM(消耗)": 300 },
  { 国家: "CN", 平台: "Android", "SUM(消耗)": 400 },
];

test("builds a basic row x column pivot grid", () => {
  const grid = buildPivotGrid({
    data: rows,
    groupbyRows: ["国家"],
    groupbyColumns: ["平台"],
    metrics: ["SUM(消耗)"],
  });
  expect(grid.rowLabels).toEqual(["US", "CN"]);
  expect(grid.colLabels).toEqual(["SUM(消耗)", "SUM(消耗)"]);
  expect(grid.colHeaders).toEqual([["iOS", "Android"], ["消耗", "消耗"]]);
  expect(grid.rowHeaders).toEqual([["US", "CN"]]);
  expect(grid.values).toEqual([
    [100, 200],
    [300, 400],
  ]);
});

test("aggregates multiple rows per cell with Sum", () => {
  const grid = buildPivotGrid({
    data: [
      ...rows,
      { 国家: "US", 平台: "iOS", "SUM(消耗)": 50 },
    ],
    groupbyRows: ["国家"],
    groupbyColumns: ["平台"],
    metrics: ["SUM(消耗)"],
    aggregateFunction: "Sum",
  });
  expect(grid.values[0]).toEqual([150, 200]);
});

test("supports transposePivot", () => {
  const grid = buildPivotGrid({
    data: rows,
    groupbyRows: ["国家"],
    groupbyColumns: ["平台"],
    metrics: ["SUM(消耗)"],
    transposePivot: true,
  });
  expect(grid.rowLabels).toEqual(["iOS", "Android"]);
  expect(grid.colLabels).toEqual(["SUM(消耗)", "SUM(消耗)"]);
});

test("supports metricsLayout ROWS", () => {
  const grid = buildPivotGrid({
    data: [
      { 国家: "US", 平台: "iOS", "SUM(消耗)": 100, count: 2 },
      { 国家: "CN", 平台: "iOS", "SUM(消耗)": 300, count: 3 },
    ],
    groupbyRows: ["国家"],
    groupbyColumns: ["平台"],
    metrics: ["SUM(消耗)", "count"],
    metricsLayout: "ROWS",
  });
  expect(grid.rowLabels).toEqual(["US · 消耗", "US · count", "CN · 消耗", "CN · count"]);
  expect(grid.colLabels).toEqual(["iOS"]);
  expect(grid.values).toEqual([[100], [2], [300], [3]]);
});

test("supports multiple metrics as column level", () => {
  const grid = buildPivotGrid({
    data: [
      { 国家: "US", "SUM(消耗)": 100, count: 2 },
      { 国家: "CN", "SUM(消耗)": 300, count: 3 },
    ],
    groupbyRows: ["国家"],
    metrics: ["SUM(消耗)", "count"],
  });
  expect(grid.colHeaders).toEqual([["消耗", "count"]]);
  expect(grid.values).toEqual([
    [100, 2],
    [300, 3],
  ]);
});

test("aggregateValues supports fraction of total", () => {
  const grid = buildPivotGrid({
    data: rows,
    groupbyRows: ["国家"],
    groupbyColumns: ["平台"],
    metrics: ["SUM(消耗)"],
    aggregateFunction: "Sum as Fraction of Total",
  });
  expect(grid.values).toEqual([
    [0.1, 0.2],
    [0.3, 0.4],
  ]);
});

test("only existing dimension combinations are shown, no Cartesian product", () => {
  const grid = buildPivotGrid({
    data: [
      { 平台: "iOS", 主游戏: "游戏A", "SUM(消耗)": 100 },
      { 平台: "iOS", 主游戏: "游戏B", "SUM(消耗)": 200 },
      { 平台: "Android", 主游戏: "游戏A", "SUM(消耗)": 300 },
      // (Android, 游戏B) intentionally missing — must not appear
    ],
    groupbyRows: ["平台", "主游戏"],
    metrics: ["SUM(消耗)"],
  });
  expect(grid.rowLabels).toEqual(["iOS · 游戏A", "iOS · 游戏B", "Android · 游戏A"]);
  expect(grid.values).toEqual([[100], [200], [300]]);
});

test("row combos keep hierarchical order for grouping", () => {
  const grid = buildPivotGrid({
    data: [
      { 平台: "Android", 主游戏: "游戏A", "SUM(消耗)": 1 },
      { 平台: "iOS", 主游戏: "游戏B", "SUM(消耗)": 2 },
      { 平台: "iOS", 主游戏: "游戏A", "SUM(消耗)": 3 },
    ],
    groupbyRows: ["平台", "主游戏"],
    metrics: ["SUM(消耗)"],
  });
  expect(grid.rowLabels).toEqual(["Android · 游戏A", "iOS · 游戏A", "iOS · 游戏B"]);
});

test("aggregateValues supports median", () => {
  expect(aggregateValues([3, 1, 2], "Median")).toBe(2);
  expect(aggregateValues([1, 2, 3, 4], "Median")).toBe(2.5);
});

test("metric headers use original names without aggregation prefix", () => {
  const grid = buildPivotGrid({
    data: [
      { 国家: "US", 平台: "iOS", "SUM(消耗)": 100, "AVG(付费)": 5 },
      { 国家: "CN", 平台: "iOS", "SUM(消耗)": 300, "AVG(付费)": 7 },
    ],
    groupbyRows: ["国家"],
    groupbyColumns: ["平台"],
    metrics: ["SUM(消耗)", "AVG(付费)"],
  });
  expect(grid.colHeaders).toEqual([["iOS", "iOS"], ["消耗", "付费"]]);
  expect(grid.rowLabels).toEqual(["US", "CN"]);
});

test("displayMetricName strips aggregation prefixes", () => {
  expect(displayMetricName("SUM(user_count)")).toBe("user_count");
  expect(displayMetricName("AVG(arpu)")).toBe("arpu");
  expect(displayMetricName("COUNT(*)")).toBe("*");
  expect(displayMetricName("arppu")).toBe("arppu");
  expect(displayMetricName("SUM(a(b))")).toBe("a(b)");
});

test("metricsLayout ROWS strips metric display names in row headers", () => {
  const grid = buildPivotGrid({
    data: [
      { 国家: "US", "SUM(消耗)": 100, count: 2 },
    ],
    groupbyRows: ["国家"],
    metrics: ["SUM(消耗)", "count"],
    metricsLayout: "ROWS",
  });
  expect(grid.rowHeaders).toEqual([["US", "US"], ["消耗", "count"]]);
  expect(grid.rowLabels).toEqual(["US · 消耗", "US · count"]);
});
