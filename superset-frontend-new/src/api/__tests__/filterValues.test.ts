import { test, expect } from "vitest";
import { filterValuesQuery } from "@/api/filterValues";

test("filterValuesQuery quotes column names containing brackets", () => {
  // JS rison 会把 主游戏[ID] 原样输出，Python 解析器读不了，必须带引号
  expect(
    filterValuesQuery([
      { col: "主游戏[ID]", op: "IN", val: ["冒险岛 [203]"] },
    ]),
  ).toBe(
    "(filters:!((col:'主游戏[ID]',op:'IN',val:!('冒险岛 [203]'))),page:0,page_size:10000)",
  );
});

test("filterValuesQuery supports several predicates and custom page size", () => {
  expect(
    filterValuesQuery(
      [
        { col: "日期", op: ">=", val: "2024/03/13" },
        { col: "日期", op: "<", val: "2024/04/12" },
      ],
      100,
    ),
  ).toBe(
    "(filters:!((col:'日期',op:'>=',val:!('2024/03/13')),(col:'日期',op:'<',val:!('2024/04/12'))),page:0,page_size:100)",
  );
});

test("filterValuesQuery escapes single quotes rison-style", () => {
  expect(filterValuesQuery([{ col: "媒体", op: "IN", val: "L'Oreal" }])).toBe(
    "(filters:!((col:'媒体',op:'IN',val:!('L!'Oreal'))),page:0,page_size:10000)",
  );
});

test("filterValuesQuery emits an empty filter list when nothing is filtered", () => {
  expect(filterValuesQuery([])).toBe("(filters:!(),page:0,page_size:10000)");
});
