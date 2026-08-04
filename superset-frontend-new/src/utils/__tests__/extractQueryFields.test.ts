import { test, expect } from "vitest";
import {
  buildQueryObject,
  extractQueryFields,
} from "@/utils/query/extractQueryFields";

test("pivot query keeps groupby empty and merges all dims into columns", () => {
  const query = buildQueryObject(
    {
      viz_type: "pivot_table_v2",
      groupbyRows: ["媒体"],
      groupbyColumns: ["平台"],
      metrics: ["count"],
    },
    "pivot_table_v2",
  );
  expect(query.groupby).toEqual([]);
  expect(query.columns).toEqual(["媒体", "平台"]);
});

test("pivot query dedups dims when a dim is used in both rows and columns", () => {
  const query = buildQueryObject(
    {
      viz_type: "pivot_table_v2",
      groupbyRows: ["媒体", "团队"],
      groupbyColumns: ["平台", "媒体"],
      metrics: ["count"],
    },
    "pivot_table_v2",
  );
  expect(query.columns).toEqual(["媒体", "团队", "平台"]);
});

test("non-pivot query keeps groupby and columns separate", () => {
  const query = buildQueryObject(
    {
      viz_type: "bar",
      groupby: ["媒体"],
      columns: ["平台"],
      metrics: ["count"],
    },
    "bar",
  );
  expect(query.groupby).toEqual(["媒体"]);
  expect(query.columns).toEqual(["平台"]);
});

test("pivot query falls back to legacy groupby/columns form data", () => {
  const fields = extractQueryFields(
    {
      viz_type: "pivot_table_v2",
      groupby: ["媒体"],
      columns: ["平台"],
      metrics: ["count"],
    },
    "pivot_table_v2",
  );
  expect(fields.groupby).toEqual([]);
  expect(fields.columns).toEqual(["媒体", "平台"]);
});
