/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { ComponentProps } from "react";
import type { QueryResult } from "@/types/api";
import { CompareModalResults } from "@/pages/Dashboard/CompareModalResults";
import { COL, type SelectedGame } from "@/pages/Dashboard/compareModalModel";

const game: SelectedGame = {
  papp_id: "1",
  region: "domestic",
  papp_name: "游戏A",
  上线时间: "2024/01/01",
};

const columns: QueryResult["columns"] = [
  { name: COL.papp_name, type: "VARCHAR" },
  { name: "日期", type: "VARCHAR", displayName: "日期" },
  { name: "消耗", type: "INTEGER", displayName: "消耗" },
  { name: "ltv_1", type: "FLOAT", displayName: "ltv_1" },
  { name: "ltv_2", type: "FLOAT", displayName: "ltv_2" },
];

function makeProps(
  overrides: Partial<ComponentProps<typeof CompareModalResults>> = {},
): ComponentProps<typeof CompareModalResults> {
  return {
    queryResult: {
      status: "success",
      columns,
      data: [
        {
          id: "p_0",
          treePath: ["游戏A"],
          主游戏: "游戏A",
          日期: "",
          消耗: 300,
          ltv_1: 1,
          ltv_2: 2,
        },
        {
          id: "c_1",
          treePath: ["游戏A", "01/01"],
          主游戏: "游戏A",
          日期: "01/01",
          消耗: 100,
          ltv_1: 1,
          ltv_2: 2,
        },
        {
          id: "c_2",
          treePath: ["游戏A", "01/02"],
          主游戏: "游戏A",
          日期: "01/02",
          消耗: 200,
          ltv_1: 1,
          ltv_2: 2,
        },
      ],
    },
    intraSecondaryResult: null,
    intraSecondaryAggRef: { current: null },
    queryFilterSnapshotRef: {
      current: {
        games: [game],
        cchNames: [],
        channels: [],
        anchors: ["上线时间"],
      },
    },
    sectionAggregateCacheRef: { current: {} },
    metricFormatMap: {},
    ltvMode: "raw",
    hoveredCell: null,
    onHoveredCellChange: () => undefined,
    resolveDateRange: () => ({ start: "2024/01/01", end: "2024/01/31" }),
    scrollRefs: { current: new Map() },
    syncDisabled: { current: false },
    ...overrides,
  };
}

test("uses cached section aggregates, metric formatting, and LTV modes", () => {
  const props = makeProps({ ltvMode: "first" });
  props.sectionAggregateCacheRef.current = {
    游戏A: {
      主游戏: "游戏A",
      日期: "",
      消耗: 1234,
      ltv_1: 1,
      ltv_2: 2,
    },
  };
  render(<CompareModalResults {...props} />);

  expect(
    screen.getByRole("columnheader", { name: "主游戏" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("columnheader", { name: "日期" }),
  ).toBeInTheDocument();
  expect(screen.getByText("合计")).toBeInTheDocument();
  expect(screen.getByText("1,234")).toBeInTheDocument();
  expect(screen.getAllByText("1.00")).toHaveLength(3);
  expect(screen.getAllByText("2.00")).toHaveLength(3);
});

test("builds primary sections from the query-time filter snapshot", () => {
  const props = makeProps();
  props.queryFilterSnapshotRef.current = {
    games: [game],
    cchNames: ["渠道A [1]"],
    channels: [],
    anchors: ["上线时间"],
  };
  props.queryResult.columns = [
    { name: COL.papp_name, type: "VARCHAR" },
    { name: COL.cch_name, type: "VARCHAR" },
    { name: "消耗", type: "INTEGER" },
  ];
  props.queryResult.data = [
    { id: "p_0", treePath: ["游戏A"], 主游戏: "游戏A", 渠道商: "", 消耗: 30 },
    {
      id: "c_1",
      treePath: ["游戏A"],
      主游戏: "游戏A",
      渠道商: "渠道A",
      消耗: 10,
    },
    {
      id: "c_2",
      treePath: ["游戏A"],
      主游戏: "游戏A",
      渠道商: "渠道B",
      消耗: 20,
    },
  ];
  render(<CompareModalResults {...props} />);

  expect(screen.getByText("渠道A")).toBeInTheDocument();
  expect(screen.queryByText("渠道B")).not.toBeInTheDocument();
});

test("renders the intra-project secondary table with a manual aggregate", () => {
  const props = makeProps();
  props.queryFilterSnapshotRef.current = {
    games: [game],
    cchNames: ["渠道A [1]"],
    channels: [],
    anchors: ["上线时间"],
  };
  props.queryResult.columns = [
    { name: COL.papp_name, type: "VARCHAR" },
    { name: COL.cch_name, type: "VARCHAR" },
    { name: "日期", type: "VARCHAR", displayName: "日期" },
    { name: "消耗", type: "INTEGER" },
  ];
  props.queryResult.data = [
    {
      id: "p_0",
      treePath: ["游戏A"],
      主游戏: "游戏A",
      渠道商: "",
      日期: "",
      消耗: 10,
    },
    {
      id: "c_1",
      treePath: ["游戏A"],
      主游戏: "游戏A",
      渠道商: "渠道A",
      日期: "01/01",
      消耗: 10,
    },
  ];
  props.intraSecondaryResult = {
    columns: props.queryResult.columns,
    data: [{ 渠道商: "渠道B", 日期: "01/01", 消耗: 50 }],
  };
  render(<CompareModalResults {...props} />);

  const tables = screen.getAllByRole("table");
  expect(tables).toHaveLength(2);
  const secondary = within(tables[1]);
  expect(secondary.getByText("合计")).toBeInTheDocument();
  expect(secondary.getByText("渠道B")).toBeInTheDocument();
  expect(secondary.getByText("01/01")).toBeInTheDocument();
  expect(secondary.getAllByText("50")).toHaveLength(2);
});

test("sorts anchor sections by start date and synchronizes their scrolling", () => {
  const props = makeProps();
  props.queryFilterSnapshotRef.current = {
    games: [game],
    cchNames: [],
    channels: [],
    anchors: ["上线时间", "首测起始时间"],
  };
  props.resolveDateRange = (_game, _cchName, anchor = "上线时间") =>
    anchor === "首测起始时间"
      ? { start: "2023/12/01", end: "2023/12/31" }
      : { start: "2024/01/01", end: "2024/01/31" };
  props.queryResult.data = [
    {
      id: "p_0",
      treePath: ["游戏A"],
      __anchor: "上线时间",
      主游戏: "游戏A",
      日期: "上线汇总",
      消耗: 20,
      ltv_1: 1,
      ltv_2: 2,
    },
    {
      id: "c_1",
      treePath: ["游戏A"],
      __anchor: "上线时间",
      主游戏: "游戏A",
      日期: "01/01",
      消耗: 20,
      ltv_1: 1,
      ltv_2: 2,
    },
    {
      id: "p_2",
      treePath: ["游戏A"],
      __anchor: "首测起始时间",
      主游戏: "游戏A",
      日期: "首测汇总",
      消耗: 10,
      ltv_1: 1,
      ltv_2: 2,
    },
    {
      id: "c_3",
      treePath: ["游戏A"],
      __anchor: "首测起始时间",
      主游戏: "游戏A",
      日期: "12/01",
      消耗: 10,
      ltv_1: 1,
      ltv_2: 2,
    },
  ];
  props.sectionAggregateCacheRef.current = {
    "上线 · 游戏A": {
      主游戏: "游戏A",
      日期: "上线汇总",
      消耗: 20,
      ltv_1: 1,
      ltv_2: 2,
    },
    "首测 · 游戏A": {
      主游戏: "游戏A",
      日期: "首测汇总",
      消耗: 10,
      ltv_1: 1,
      ltv_2: 2,
    },
  };
  render(<CompareModalResults {...props} />);

  const tables = screen.getAllByRole("table");
  expect(within(tables[0]).getByText("12/01")).toBeInTheDocument();
  expect(within(tables[1]).getByText("01/01")).toBeInTheDocument();

  const firstSection = props.scrollRefs.current.get("_primary_sec0");
  const secondSection = props.scrollRefs.current.get("_primary_sec1");
  const horizontal = props.scrollRefs.current.get("_primary_hz");
  expect(firstSection).toBeDefined();
  expect(secondSection).toBeDefined();
  expect(horizontal).toBeDefined();
  if (!firstSection || !secondSection || !horizontal) return;

  expect(firstSection).not.toBe(secondSection);
  expect(firstSection).not.toBe(horizontal);
  expect(secondSection).not.toBe(horizontal);
  Object.defineProperty(firstSection, "scrollLeft", {
    value: 80,
    writable: true,
  });
  Object.defineProperty(firstSection, "scrollTop", {
    value: 120,
    writable: true,
  });
  Object.defineProperty(horizontal, "scrollTop", { value: 9, writable: true });
  expect(horizontal.scrollTop).toBe(9);
  fireEvent.scroll(firstSection);

  expect(secondSection.scrollLeft).toBe(80);
  expect(secondSection.scrollTop).toBe(120);
  expect(horizontal.scrollLeft).toBe(80);
  expect(horizontal.scrollTop).toBe(120);
});

test("renders the existing empty state", () => {
  const props = makeProps();
  props.queryResult.data = [];
  render(<CompareModalResults {...props} />);

  expect(screen.getByText("选定周期未找到数据")).toBeInTheDocument();
});
