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

import type { ComponentProps, ReactNode } from "react";
import { test, expect, vi, beforeEach } from "vitest";
import { screen, render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import type { ChartData } from "@/types/api";
import type { DashboardChartData } from "@/pages/Dashboard/dashboardChartDataContext";
import type { ChartLayoutItem } from "@/utils/dashboard/layout";

const theme = createTheme();
function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
function renderWithProviders(ui: ReactNode) {
  return render(ui, { wrapper: Wrapper });
}

vi.mock("@/pages/Dashboard/ChartCard", () => ({
  default: vi.fn(({ chartId, error }: { chartId: number; error?: string }) => (
    <div data-testid={`chart-card-${chartId}`}>
      Chart {chartId}
      {error ? `：${error}` : ""}
    </div>
  )),
}));

import DashboardGrid from "@/pages/Dashboard/DashboardGrid";

beforeEach(() => {
  vi.clearAllMocks();
});

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const baseProps: ComponentProps<typeof DashboardGrid> = {
  containerWidth: 1200,
  layoutItems: [],
  chartData: {
    chartMeta: {},
    chartData: {},
    chartLoading: {},
  },
  saving: false,
  containerRef: { current: null },
  onSizeChange: vi.fn(),
  onRefresh: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onAddChart: vi.fn(),
  onToggleCompare: vi.fn(),
  onOpenCompareBigScreen: vi.fn(),
};

const chartDataFor = (
  chartMeta: Record<number, ChartData>,
  extras: Partial<DashboardChartData> = {},
): DashboardChartData => ({
  chartMeta,
  chartData: {},
  chartLoading: {},
  totalRows: {},
  ...extras,
});

const layoutItems: ChartLayoutItem[] = [
  { i: "CHART-1", chartId: 1, w: 6, h: 14 },
  { i: "CHART-2", chartId: 2, w: 6, h: 14 },
];

test("renders empty state when no items", () => {
  renderWithProviders(<DashboardGrid {...baseProps} />);
  expect(screen.getByText("此仪表板暂无图表")).toBeInTheDocument();
  expect(screen.getByText("添加图表")).toBeInTheDocument();
});

test("renders grid with chart cards when items exist", () => {
  const chartMeta: Record<number, ChartData> = {
    1: { id: 1, slice_name: "Chart 1", viz_type: "line" },
    2: { id: 2, slice_name: "Chart 2", viz_type: "bar" },
  };

  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      layoutItems={layoutItems}
      chartData={chartDataFor(chartMeta)}
    />,
  );

  expect(screen.getByTestId("chart-card-1")).toBeInTheDocument();
  expect(screen.getByTestId("chart-card-2")).toBeInTheDocument();
});

test("passes per-chart errors to ChartCard", () => {
  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      layoutItems={[layoutItems[0]]}
      chartData={chartDataFor(
        { 1: { id: 1, slice_name: "Chart 1", viz_type: "line" } },
        { chartErrors: { 1: "查询超时" } },
      )}
    />,
  );

  expect(screen.getByTestId("chart-card-1")).toHaveTextContent("查询超时");
});

test("shows saving indicator when saving is true", () => {
  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      saving
      layoutItems={[layoutItems[0]]}
      chartData={chartDataFor({
        1: { id: 1, slice_name: "T", viz_type: "table" },
      })}
    />,
  );
  expect(screen.getByText("保存中...")).toBeInTheDocument();
});

test("renders single column on mobile", () => {
  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      containerWidth={500}
      layoutItems={[layoutItems[0]]}
      chartData={chartDataFor({
        1: { id: 1, slice_name: "T", viz_type: "table" },
      })}
    />,
  );

  expect(screen.getByTestId("chart-card-1")).toBeInTheDocument();
});
