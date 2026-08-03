import { test, expect } from "vitest";
import { buildSiblingFilters } from "@/components/DashboardFilter/filterValuesCache";
import type {
  FilterConfig,
  FilterState,
} from "@/components/DashboardFilter/types";

const mkFilter = (
  id: string,
  datasetId: number,
  column: string,
): FilterConfig => ({
  id,
  name: column,
  filterType: "filter_select",
  datasetId,
  column,
});

test("buildSiblingFilters ignores self and other datasets", () => {
  const filters: FilterConfig[] = [
    mkFilter("f1", 7, "country"),
    mkFilter("f2", 7, "channel"),
    mkFilter("f3", 99, "other"),
  ];
  const state: FilterState = {
    f2: { value: ["a", "b"] },
    f3: { value: ["x"] },
  };
  const result = buildSiblingFilters(filters[0], filters, state);
  // Only f2 is a sibling on the same dataset with a value; f3 is another dataset.
  expect(result).toEqual([{ col: "channel", op: "in", val: ["a", "b"] }]);
});

test("buildSiblingFilters skips empty values and non-select types", () => {
  const filters: FilterConfig[] = [
    mkFilter("f1", 7, "country"),
    { ...mkFilter("f2", 7, "channel"), filterType: "text" },
    mkFilter("f3", 7, "platform"),
  ];
  const state: FilterState = {
    f2: { value: "ignored" },
    f3: { value: [] },
  };
  const result = buildSiblingFilters(filters[0], filters, state);
  expect(result).toEqual([]);
});

test("buildSiblingFilters wraps single values in an array", () => {
  const filters: FilterConfig[] = [
    mkFilter("f1", 7, "country"),
    mkFilter("f2", 7, "channel"),
  ];
  const state: FilterState = { f2: { value: "solo" } };
  const result = buildSiblingFilters(filters[0], filters, state);
  expect(result).toEqual([{ col: "channel", op: "in", val: ["solo"] }]);
});
