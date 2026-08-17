import { test, expect } from "vitest";
import { autoSuggestChartType } from "@/pages/ChartCreation/useChartEditor";

const cols = (time = true) =>
  [
    { column_name: "date", type: "TIMESTAMP" },
    { column_name: "platform", type: "VARCHAR" },
    { column_name: "clicks", type: "INTEGER" },
  ].filter((c) => (time ? true : c.column_name !== "date"));

test("no metrics defaults to a pivot table", () => {
  expect(autoSuggestChartType([], cols(), [])).toEqual({
    vizType: "pivot_table_v2",
    groupby: [],
  });
});

test("four or more metrics suggest a pivot table", () => {
  expect(
    autoSuggestChartType(["a", "b", "c", "d"], cols(), []),
  ).toEqual({ vizType: "pivot_table_v2", groupby: [] });
});

test("two groupby dimensions suggest a pivot table", () => {
  expect(
    autoSuggestChartType(["a"], cols(), ["x", "y"]),
  ).toEqual({ vizType: "pivot_table_v2", groupby: ["x", "y"] });
});

test("single metric and no groupby suggests a big number", () => {
  expect(autoSuggestChartType(["a"], cols(), [])).toEqual({
    vizType: "big_number",
    groupby: [],
  });
});

test("two metrics and no groupby suggests a line chart", () => {
  expect(autoSuggestChartType(["a", "b"], cols(), [])).toEqual({
    vizType: "line",
    groupby: [],
  });
});

test("single metric + time dimension suggests a line chart", () => {
  expect(autoSuggestChartType(["a"], cols(), ["date"])).toEqual({
    vizType: "line",
    groupby: ["date"],
  });
});

test("single metric + non-time dimension suggests a pie chart", () => {
  expect(
    autoSuggestChartType(["a"], cols(), ["platform"]),
  ).toEqual({ vizType: "pie", groupby: ["platform"] });
});

test("multiple metrics + non-time dimension suggests a bar chart", () => {
  expect(
    autoSuggestChartType(["a", "b"], cols(), ["platform"]),
  ).toEqual({ vizType: "bar", groupby: ["platform"] });
});
