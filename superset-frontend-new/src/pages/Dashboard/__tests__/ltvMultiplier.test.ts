import { test, expect } from "vitest";
import {
  normalizedMetricName,
  parseLtvIndex,
  findLtvBaseColumn,
  formatLtvMultiplier,
} from "@/pages/Dashboard/ltvMultiplier";

const LTV_COLUMNS = ["ltv_1", "ltv_2", "ltv_3", "ltv_4", "roi_1"];

test("normalizedMetricName strips aggregate prefixes", () => {
  expect(normalizedMetricName("SUM(ltv_1)")).toBe("ltv_1");
  expect(normalizedMetricName("AVG(ltv_2)")).toBe("ltv_2");
  expect(normalizedMetricName("ltv_3")).toBe("ltv_3");
  expect(normalizedMetricName("roi_1")).toBe("roi_1");
});

test("parseLtvIndex returns the day index for ltv columns only", () => {
  expect(parseLtvIndex("ltv_1")).toBe(1);
  expect(parseLtvIndex("ltv_90")).toBe(90);
  expect(parseLtvIndex("SUM(ltv_3)")).toBe(3);
  expect(parseLtvIndex("roi_1")).toBeNull();
  expect(parseLtvIndex("ad_real_cost")).toBeNull();
});

test("findLtvBaseColumn resolves ltv_1 for first mode", () => {
  expect(findLtvBaseColumn(LTV_COLUMNS, "ltv_4", "first")).toBe("ltv_1");
  expect(findLtvBaseColumn(LTV_COLUMNS, "SUM(ltv_4)", "first")).toBe("ltv_1");
});

test("findLtvBaseColumn resolves the previous day for prev mode", () => {
  expect(findLtvBaseColumn(LTV_COLUMNS, "ltv_4", "prev")).toBe("ltv_3");
  expect(findLtvBaseColumn(LTV_COLUMNS, "ltv_2", "prev")).toBe("ltv_1");
  expect(findLtvBaseColumn(LTV_COLUMNS, "ltv_1", "prev")).toBeNull();
});

test("findLtvBaseColumn returns null for non-ltv or raw mode", () => {
  expect(findLtvBaseColumn(LTV_COLUMNS, "ltv_4", "raw")).toBeNull();
  expect(findLtvBaseColumn(LTV_COLUMNS, "roi_1", "first")).toBeNull();
  expect(findLtvBaseColumn([], "ltv_4", "first")).toBeNull();
});

test("formatLtvMultiplier returns null in raw mode and for non-ltv columns", () => {
  const row = { ltv_1: 10, ltv_2: 20, roi_1: 0.5 };
  expect(formatLtvMultiplier("ltv_2", row, LTV_COLUMNS, "raw")).toBeNull();
  expect(formatLtvMultiplier("roi_1", row, LTV_COLUMNS, "first")).toBeNull();
});

test("first mode converts every ltv value against ltv_1", () => {
  const row = { ltv_1: 10, ltv_2: 23.4, ltv_3: 15 };
  expect(formatLtvMultiplier("ltv_1", row, LTV_COLUMNS, "first")).toBe("1.00");
  expect(formatLtvMultiplier("ltv_2", row, LTV_COLUMNS, "first")).toBe("2.34");
  expect(formatLtvMultiplier("ltv_3", row, LTV_COLUMNS, "first")).toBe("1.50");
});

test("prev mode converts each ltv value against the previous day", () => {
  const row = { ltv_1: 10, ltv_2: 23.4, ltv_3: 11.7 };
  expect(formatLtvMultiplier("ltv_2", row, LTV_COLUMNS, "prev")).toBe("2.34");
  expect(formatLtvMultiplier("ltv_3", row, LTV_COLUMNS, "prev")).toBe("0.50");
});

test("ltv_1 shows 1.00 in both multiplier modes", () => {
  const row = { ltv_1: 10 };
  expect(formatLtvMultiplier("ltv_1", row, LTV_COLUMNS, "first")).toBe("1.00");
  expect(formatLtvMultiplier("ltv_1", row, LTV_COLUMNS, "prev")).toBe("1.00");
});

test("missing values render as placeholder", () => {
  const row = { ltv_1: 10 };
  expect(formatLtvMultiplier("ltv_2", row, LTV_COLUMNS, "first")).toBe("—");
  expect(formatLtvMultiplier("ltv_1", {}, LTV_COLUMNS, "prev")).toBe("—");
});

test("zero or non-numeric base renders as placeholder", () => {
  expect(
    formatLtvMultiplier("ltv_2", { ltv_1: 0, ltv_2: 5 }, LTV_COLUMNS, "first"),
  ).toBe("—");
  expect(
    formatLtvMultiplier(
      "ltv_2",
      { ltv_1: "10", ltv_2: 5 },
      LTV_COLUMNS,
      "first",
    ),
  ).toBe("—");
});

test("missing base column renders as placeholder", () => {
  const row = { ltv_2: 5 };
  expect(formatLtvMultiplier("ltv_2", row, ["ltv_2"], "first")).toBe("—");
});

test("aggregate-prefixed columns resolve bases from plain columns", () => {
  const columns = ["SUM(ltv_1)", "SUM(ltv_2)"];
  const row = { "SUM(ltv_1)": 10, "SUM(ltv_2)": 35 };
  expect(formatLtvMultiplier("SUM(ltv_2)", row, columns, "first")).toBe("3.50");
  expect(formatLtvMultiplier("SUM(ltv_2)", row, columns, "prev")).toBe("3.50");
});
