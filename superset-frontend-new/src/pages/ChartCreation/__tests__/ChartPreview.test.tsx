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
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ChartPreview from "@/pages/ChartCreation/ChartPreview";

const echartsState = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock("echarts-for-react/lib/core", () => ({
  default: () => {
    if (echartsState.shouldThrow) throw new Error("canvas boom");
    return <div>chart canvas</div>;
  },
}));

vi.mock("@/pages/ChartCreation/useChartEditor", () => ({
  DEFAULT_PIVOT_CONFIG: {
    aggregateFunction: "Sum",
    transposePivot: false,
    combineMetric: true,
    rowTotals: false,
    colTotals: true,
    metricsLayout: "COLUMNS",
  },
}));

const baseProps = {
  datasourceId: "1",
  resolvedType: "table",
  hasValidType: true,
  metrics: ["amount"],
  pivotMetricKeys: ["amount"],
  groupby: [],
  groupbyColumns: [],
  chartTotalsRows: null,
  chartSubtotalRows: null,
  loadingData: false,
  chartLibReady: true,
  option: null,
  bigNumberValue: null,
};

afterEach(() => {
  echartsState.shouldThrow = false;
  vi.useRealTimers();
});

test("shows a query error with a working retry action", () => {
  const onRetry = vi.fn();
  render(
    <ChartPreview
      {...baseProps}
      chartData={{ error: "网络异常，请检查网络连接后重试", onRetry }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "网络异常，请检查网络连接后重试",
  );
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("renders an empty result as an empty state rather than an error", () => {
  render(<ChartPreview {...baseProps} chartData={{ data: [] }} />);

  expect(screen.getByText("无数据")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("contains an ECharts render failure and retries the canvas", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  echartsState.shouldThrow = true;
  try {
    render(
      <ChartPreview
        {...baseProps}
        resolvedType="bar"
        chartData={{ data: [{ amount: 1 }] }}
        option={{}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("图表预览渲染失败");
    echartsState.shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(screen.getByText("chart canvas")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  } finally {
    consoleError.mockRestore();
  }
});

test("replaces a stalled preview spinner with a bounded retry error", () => {
  vi.useFakeTimers();
  render(<ChartPreview {...baseProps} resolvedType="bar" chartData={null} />);

  act(() => {
    vi.advanceTimersByTime(1600);
  });

  expect(screen.getByRole("alert")).toHaveTextContent("图表预览加载超时");
  expect(screen.getByRole("button", { name: "重新加载" })).toBeInTheDocument();
});
