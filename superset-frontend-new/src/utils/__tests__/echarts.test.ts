/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { test, expect } from "vitest";
import { buildEChartsOption } from "@/utils/echarts";
import type { ChartDataPayload } from "@/types/api";

const LONG_CJK_LABELS = [
  "冒险岛：枫之新篇",
  "三国：天命再临",
  "代号：武侠",
  "策定九州东南亚",
  "仙境传说：破晓",
  "代号：盗墓笔记",
  "策定九州越南",
  "僵尸三国",
  "三国群英传：策定九州",
  "代号：山海经",
  "代号：放置卡牌",
];

const DATE_LABELS = [
  "2026-10-11",
  "2026-10-10",
  "2026-10-12",
  "2026-10-14",
  "2026-10-09",
  "2026-10-03",
  "2026-10-02",
  "2026-10-13",
  "2026-10-04",
  "2026-10-18",
];

type CartesianOption = {
  grid: { right: number; bottom: number };
  xAxis: {
    data: string[];
    axisLabel: { rotate: number; fontSize: number; hideOverlap?: boolean };
  };
  series: { data: number[] }[];
};

function cartesianOption(data: ChartDataPayload): CartesianOption {
  return buildEChartsOption("bar", data) as unknown as CartesianOption;
}

function payload(labels: string[]): ChartDataPayload {
  return {
    colnames: ["项目", "新增进入"],
    coltypes: [1, 0],
    data: labels.map((label, i) => ({
      项目: label,
      新增进入: 1000 - i * 10,
    })),
  };
}

test("x-axis labels are told to hide overlaps instead of stacking", () => {
  const option = cartesianOption(payload(LONG_CJK_LABELS));
  expect(option.xAxis.axisLabel).toMatchObject({
    rotate: 45,
    fontSize: 10,
    hideOverlap: true,
  });
});

test("keeps right-padding room for the rotated last category label", () => {
  const option = cartesianOption(payload(DATE_LABELS));
  expect(option.grid.right).toBe(28);
});

test("adds bottom room only when long CJK labels would be clipped", () => {
  const cjkBottom = cartesianOption(payload(LONG_CJK_LABELS)).grid.bottom;
  const dateBottom = cartesianOption(payload(DATE_LABELS)).grid.bottom;

  // 45°-rotated 10-character CJK labels need ~75px of vertical drop plus the
  // 8px label margin; the legacy 7px-per-char estimate only reserved 57px and
  // the labels were cut by the plot bottom.
  expect(cjkBottom).toBeGreaterThanOrEqual(80);
  // Latin/date labels keep the previous layout so existing cards do not
  // shrink for no reason.
  expect(dateBottom).toBe(62);
});

test("does not change category labels or series data", () => {
  const data = payload(DATE_LABELS);
  const option = cartesianOption(data);
  expect(option.xAxis.data).toEqual(DATE_LABELS);
  expect(option.series).toHaveLength(1);
  expect(option.series[0].data).toEqual(
    DATE_LABELS.map((_, i) => 1000 - i * 10),
  );
});
