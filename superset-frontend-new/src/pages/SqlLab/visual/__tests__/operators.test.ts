import { test, expect } from "vitest";
import {
  addDays,
  classifyColumn,
  formatLiteral,
  likePattern,
  METRIC_OPS,
  operatorsForCategory,
  parseListValues,
} from "@/pages/SqlLab/visual/operators";

test("classifyColumn maps backend types to generic categories", () => {
  expect(classifyColumn("VARCHAR(255)")).toBe("string");
  expect(classifyColumn("TEXT")).toBe("string");
  expect(classifyColumn("uuid")).toBe("string");
  expect(classifyColumn("INTEGER")).toBe("number");
  expect(classifyColumn("DECIMAL(10,2)")).toBe("number");
  expect(classifyColumn("DOUBLE PRECISION")).toBe("number");
  expect(classifyColumn("DATE")).toBe("temporal");
  expect(classifyColumn("TIMESTAMP WITHOUT TIME ZONE")).toBe("temporal");
  expect(classifyColumn("DATETIME")).toBe("temporal");
  expect(classifyColumn("BOOLEAN")).toBe("boolean");
  expect(classifyColumn("INTERVAL")).toBe("other");
  expect(classifyColumn(undefined, undefined)).toBe("other");
});

test("classifyColumn prefers temporal over string and numeric substrings", () => {
  // "timestamp" contains "int"? No, but "datetime" contains "time" and
  // "date"; ensure the temporal branch wins over number/string.
  expect(classifyColumn("timestamp")).toBe("temporal");
  expect(classifyColumn(undefined, "datetime")).toBe("temporal");
});

test("operator catalogs match the column category", () => {
  const stringOps = operatorsForCategory("string").map((o) => o.value);
  expect(stringOps).toContain("contains");
  expect(stringOps).toContain("starts_with");
  expect(stringOps).not.toContain("between");

  const numberOps = operatorsForCategory("number").map((o) => o.value);
  expect(numberOps).toContain("between");
  expect(numberOps).toContain("gt");
  expect(numberOps).not.toContain("contains");

  const temporalOps = operatorsForCategory("temporal").map((o) => o.value);
  expect(temporalOps).toEqual(
    expect.arrayContaining([
      "date_on",
      "date_before",
      "date_after",
      "date_between",
    ]),
  );

  const booleanOps = operatorsForCategory("boolean").map((o) => o.value);
  expect(booleanOps).toContain("is_true");
  expect(booleanOps).toContain("is_false");

  for (const ops of [stringOps, numberOps, temporalOps, booleanOps]) {
    expect(ops).toContain("is_null");
    expect(ops).toContain("not_null");
  }

  expect(METRIC_OPS.map((o) => o.value)).toContain("between");
  expect(METRIC_OPS.map((o) => o.value)).not.toContain("in");
});

test("formatLiteral quotes strings and validates numbers", () => {
  expect(formatLiteral("O'Brien", "string")).toBe("'O''Brien'");
  expect(formatLiteral("42", "number")).toBe("42");
  expect(formatLiteral("4.5", "number")).toBe("4.5");
  expect(formatLiteral("-3", "metric")).toBe("-3");
  expect(formatLiteral("abc", "number")).toBeNull();
  expect(formatLiteral("", "string")).toBeNull();
  expect(formatLiteral(null, "string")).toBe("NULL");
  expect(formatLiteral("true", "boolean")).toBe("TRUE");
  expect(formatLiteral("0", "boolean")).toBe("FALSE");
});

test("likePattern escapes LIKE wildcards", () => {
  expect(likePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
});

test("parseListValues splits on ascii and full-width commas", () => {
  expect(parseListValues("1, 2，3")).toEqual(["1", "2", "3"]);
  expect(parseListValues(" ")).toEqual([]);
});

test("addDays handles month and year boundaries", () => {
  expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
  expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
  expect(addDays("not-a-date", 1)).toBe("not-a-date");
});
