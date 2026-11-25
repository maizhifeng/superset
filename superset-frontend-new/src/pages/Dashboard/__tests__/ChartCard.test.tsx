/*
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

import {
  forwardRef,
  useImperativeHandle,
  type ComponentProps,
  type ReactNode,
} from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { test, expect, vi, beforeEach } from "vitest";
import ChartCard from "@/pages/Dashboard/ChartCard";

vi.mock("@/hooks/useEChartsType", () => ({ useEChartsType: () => true }));
vi.mock("@/utils/echarts", () => ({
  buildEChartsOption: () => ({ series: [] }),
  getECharts: () => ({}),
}));
vi.mock("echarts-for-react/lib/core", () => ({
  default: forwardRef<
    { getEchartsInstance: () => unknown },
    { role?: string; "aria-label"?: string; children?: ReactNode }
  >(({ role, "aria-label": ariaLabel }, ref) => {
    useImperativeHandle(ref, () => ({
      getEchartsInstance: () => ({
        getDataURL: () => "data:image/png;base64,",
      }),
    }));
    return <div role={role} aria-label={ariaLabel} />;
  }),
}));

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const baseProps: ComponentProps<typeof ChartCard> = {
  chartId: 7,
  sliceName: "销售图表",
  vizType: "bar",
  containerWidth: 800,
  onRefresh: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onToggleCompare: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

test("renders an accessible chart error and retries", () => {
  const onRefresh = vi.fn();
  render(
    <ChartCard
      {...baseProps}
      error="查询执行失败"
      data={{ colnames: ["地区"], coltypes: [1], data: [{ 地区: "华东" }] }}
      onRefresh={onRefresh}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("查询执行失败");
  userEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(onRefresh).toHaveBeenCalledWith(7);
});

test("provides a chart text summary and visible data table alternative", () => {
  render(
    <ChartCard
      {...baseProps}
      data={{
        colnames: ["地区", "销售额"],
        coltypes: [1, 0],
        data: [
          { 地区: "华东", 销售额: 10 },
          { 地区: "华北", 销售额: 20 },
        ],
      }}
    />,
  );

  expect(
    screen.getByRole("img", { name: /销售图表，共 2 行/ }),
  ).toBeInTheDocument();
  userEvent.click(screen.getByRole("button", { name: "查看数据表" }));
  expect(
    screen.getByRole("columnheader", { name: "地区" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "华东" })).toBeInTheDocument();
});
