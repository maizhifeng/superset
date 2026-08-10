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
  expect(grid.colHeaders).toEqual([
    ["iOS", "Android"],
    ["消耗", "消耗"],
  ]);
  expect(grid.rowHeaders).toEqual([["US", "CN"]]);
  expect(grid.values).toEqual([
    [100, 200],
    [300, 400],
  ]);
});

test("aggregates multiple rows per cell with Sum", () => {
  const grid = buildPivotGrid({
    data: [...rows, { 国家: "US", 平台: "iOS", "SUM(消耗)": 50 }],
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
  expect(grid.rowLabels).toEqual([
    "US · 消耗",
    "US · count",
    "CN · 消耗",
    "CN · count",
  ]);
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
  expect(grid.rowLabels).toEqual([
    "iOS · 游戏A",
    "iOS · 游戏B",
    "Android · 游戏A",
  ]);
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
  expect(grid.rowLabels).toEqual([
    "Android · 游戏A",
    "iOS · 游戏A",
    "iOS · 游戏B",
  ]);
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
  expect(grid.colHeaders).toEqual([
    ["iOS", "iOS"],
    ["消耗", "付费"],
  ]);
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
    data: [{ 国家: "US", "SUM(消耗)": 100, count: 2 }],
    groupbyRows: ["国家"],
    metrics: ["SUM(消耗)", "count"],
    metricsLayout: "ROWS",
  });
  expect(grid.rowHeaders).toEqual([
    ["US", "US"],
    ["消耗", "count"],
  ]);
  expect(grid.rowLabels).toEqual(["US · 消耗", "US · count"]);
});

test("wide data path aggregates day-granularity rows client-side", () => {
  const grid = buildPivotGrid({
    wideData: {
      rows: [
        {
          国家: "US",
          平台: "iOS",
          "SUM(消耗)": 10,
          消耗: 10,
          新增: 2,
          cpa__num: 10,
          cpa__den: 2,
        },
        {
          国家: "US",
          平台: "iOS",
          "SUM(消耗)": 5,
          消耗: 5,
          新增: 1,
          cpa__num: 5,
          cpa__den: 1,
        },
        {
          国家: "US",
          平台: "Android",
          "SUM(消耗)": 7,
          消耗: 7,
          新增: 1,
          cpa__num: 7,
          cpa__den: 1,
        },
        {
          国家: "CN",
          平台: "iOS",
          "SUM(消耗)": 20,
          消耗: 20,
          新增: 4,
          cpa__num: 20,
          cpa__den: 4,
        },
      ],
      components: {
        "SUM(消耗)": { agg: "sum" },
        cpa: { agg: "ratio", num: "cpa__num", den: "cpa__den" },
      },
    },
    groupbyRows: ["国家"],
    groupbyColumns: ["平台"],
    metrics: ["SUM(消耗)", "cpa"],
    aggregateFunction: "Sum",
  });
  expect(grid.rowLabels).toEqual(["US", "CN"]);
  expect(grid.colHeaders).toEqual([
    ["iOS", "iOS", "Android", "Android"],
    ["消耗", "cpa", "消耗", "cpa"],
  ]);
  expect(grid.values).toEqual([
    [15, 5, 7, 7],
    [20, 5, null, null],
  ]);
});

test("wide data path computes totals and subtotals from wide rows", () => {
  const grid = buildPivotGrid({
    wideData: {
      rows: [
        {
          平台: "iOS",
          主游戏: "游戏A",
          "SUM(消耗)": 10,
          消耗: 10,
          新增: 2,
          cpa__num: 10,
          cpa__den: 2,
        },
        {
          平台: "iOS",
          主游戏: "游戏B",
          "SUM(消耗)": 20,
          消耗: 20,
          新增: 5,
          cpa__num: 20,
          cpa__den: 5,
        },
        {
          平台: "Android",
          主游戏: "游戏A",
          "SUM(消耗)": 30,
          消耗: 30,
          新增: 3,
          cpa__num: 30,
          cpa__den: 3,
        },
      ],
      components: {
        "SUM(消耗)": { agg: "sum" },
        cpa: { agg: "ratio", num: "cpa__num", den: "cpa__den" },
      },
    },
    groupbyRows: ["平台", "主游戏"],
    groupbyColumns: [],
    metrics: ["SUM(消耗)", "cpa"],
    aggregateFunction: "Sum",
  });
  // totals: sums across all rows
  expect(grid.totalRows).toEqual([{ "SUM(消耗)": 60, cpa: 6 }]);
  // subtotal level 0: grouped by 平台
  expect(grid.subtotalRows).toHaveLength(1);
  expect(grid.subtotalRows![0]).toEqual([
    { 平台: "iOS", "SUM(消耗)": 30, cpa: 4.285714285714286 },
    { 平台: "Android", "SUM(消耗)": 30, cpa: 10 },
  ]);
});

test("wide data path honours transposePivot and metricsLayout ROWS", () => {
  const grid = buildPivotGrid({
    wideData: {
      rows: [
        {
          国家: "US",
          平台: "iOS",
          "SUM(消耗)": 10,
          消耗: 10,
          新增: 2,
          cpa__num: 10,
          cpa__den: 2,
        },
        {
          国家: "CN",
          平台: "iOS",
          "SUM(消耗)": 20,
          消耗: 20,
          新增: 4,
          cpa__num: 20,
          cpa__den: 4,
        },
      ],
      components: {
        "SUM(消耗)": { agg: "sum" },
        cpa: { agg: "ratio", num: "cpa__num", den: "cpa__den" },
      },
    },
    groupbyRows: ["国家"],
    groupbyColumns: ["平台"],
    metrics: ["SUM(消耗)", "cpa"],
    transposePivot: true,
    metricsLayout: "ROWS",
  });
  expect(grid.rowLabels).toEqual(["iOS · 消耗", "iOS · cpa"]);
  expect(grid.colLabels).toEqual(["US", "CN"]);
  expect(grid.values).toEqual([
    [10, 20],
    [5, 5],
  ]);
});

test("pct95 keeps top row combos by cumulative value, dropping zero rows", () => {
  const grid = buildPivotGrid({
    wideData: {
      rows: [
        { 平台: "mobile", "SUM(新增)": 480 },
        { 平台: "mini_game", "SUM(新增)": 500 },
        { 平台: "oversea", "SUM(新增)": 20 },
        { 平台: "zero1", "SUM(新增)": 0 },
        { 平台: "zero2", "SUM(新增)": 0 },
      ],
      components: { "SUM(新增)": { agg: "sum" } },
    },
    groupbyRows: ["平台"],
    metrics: ["SUM(新增)"],
    pct95: { enabled: true, metric: "SUM(新增)", threshold: 0.95 },
  });
  // total = 1000, 95% = 950 → mini_game (500) + mobile (480) = 980, zeros dropped
  expect(grid.rowLabels).toEqual(["mobile", "mini_game"]);
  expect(grid.values).toEqual([[480], [500]]);
});

test("pct95 keeps the last non-zero row when values are sparse", () => {
  const grid = buildPivotGrid({
    wideData: {
      rows: [
        { 平台: "a", "SUM(新增)": 10 },
        { 平台: "b", "SUM(新增)": 0 },
        { 平台: "c", "SUM(新增)": 0 },
      ],
      components: { "SUM(新增)": { agg: "sum" } },
    },
    groupbyRows: ["平台"],
    metrics: ["SUM(新增)"],
    pct95: { enabled: true, metric: "SUM(新增)", threshold: 0.95 },
  });
  expect(grid.rowLabels).toEqual(["a"]);
});

test("pct95 with all-zero metric keeps every row", () => {
  const grid = buildPivotGrid({
    wideData: {
      rows: [
        { 平台: "a", "SUM(新增)": 0 },
        { 平台: "b", "SUM(新增)": 0 },
      ],
      components: { "SUM(新增)": { agg: "sum" } },
    },
    groupbyRows: ["平台"],
    metrics: ["SUM(新增)"],
    pct95: { enabled: true, metric: "SUM(新增)", threshold: 0.95 },
  });
  expect(grid.rowLabels).toEqual(["a", "b"]);
});

test("pct95 splits on a ratio metric re-aggregated across column combos", () => {
  const grid = buildPivotGrid({
    wideData: {
      rows: [
        { 平台: "mobile", 日期: "d1", cpa__num: 100, cpa__den: 1 },
        { 平台: "mobile", 日期: "d2", cpa__num: 100, cpa__den: 1 },
        { 平台: "mini_game", 日期: "d1", cpa__num: 10, cpa__den: 2 },
        { 平台: "mini_game", 日期: "d2", cpa__num: 10, cpa__den: 2 },
      ],
      components: { cpa: { agg: "ratio", num: "cpa__num", den: "cpa__den" } },
    },
    groupbyRows: ["平台"],
    groupbyColumns: ["日期"],
    metrics: ["cpa"],
    pct95: { enabled: true, metric: "cpa", threshold: 0.95 },
  });
  // mobile cpa = 200/2 = 100, mini_game cpa = 20/4 = 5; total 105, 95% = 99.75
  expect(grid.rowLabels).toEqual(["mobile"]);
});

test("pct95 applies to the narrow data path too", () => {
  const grid = buildPivotGrid({
    data: [
      { 平台: "mobile", "SUM(新增)": 480 },
      { 平台: "mini_game", "SUM(新增)": 500 },
      { 平台: "oversea", "SUM(新增)": 20 },
      { 平台: "zero", "SUM(新增)": 0 },
    ],
    groupbyRows: ["平台"],
    metrics: ["SUM(新增)"],
    pct95: { enabled: true, metric: "SUM(新增)", threshold: 0.95 },
  });
  expect(grid.rowLabels).toEqual(["mobile", "mini_game"]);
});

test("pct95 disabled leaves all rows intact", () => {
  const grid = buildPivotGrid({
    wideData: {
      rows: [
        { 平台: "a", "SUM(新增)": 10 },
        { 平台: "b", "SUM(新增)": 0 },
      ],
      components: { "SUM(新增)": { agg: "sum" } },
    },
    groupbyRows: ["平台"],
    metrics: ["SUM(新增)"],
    pct95: undefined,
  });
  expect(grid.rowLabels).toEqual(["a", "b"]);
});
