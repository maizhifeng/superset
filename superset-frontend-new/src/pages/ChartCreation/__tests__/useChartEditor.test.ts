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
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import api, { getDataset, getMetricFormatMap } from "@/api";
import { useChartEditor } from "@/pages/ChartCreation/useChartEditor";

vi.mock("@/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  getDataset: vi.fn(),
  getMetricFormatMap: vi.fn(),
  QUERY_TIMEOUT_MS: 300_000,
}));

vi.mock("@/utils/echarts", () => ({
  buildEChartsOption: vi.fn(() => ({})),
  loadECharts: vi.fn(() => Promise.resolve()),
}));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    MemoryRouter,
    { initialEntries: ["/explore?datasource_id=1"] },
    children,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({
    data: { result: [{ id: 1, table_name: "sales" }] },
  });
  vi.mocked(getDataset).mockResolvedValue({
    columns: [{ column_name: "amount", type: "INTEGER" }],
    metrics: [
      {
        metric_name: "sum_amount",
        verbose_name: "Amount",
        expression: "SUM(amount)",
      },
    ],
  });
  vi.mocked(getMetricFormatMap).mockResolvedValue({});
});

test("attaches retry to a query error returned in the payload", async () => {
  vi.mocked(api.post).mockResolvedValueOnce({
    data: { result: [{ error: "query rejected" }] },
  });

  const { result } = renderHook(() => useChartEditor({}), { wrapper });

  await waitFor(
    () => expect(result.current.chartData?.error).toBe("query rejected"),
    { timeout: 3000 },
  );
  expect(result.current.chartData?.onRetry).toEqual(expect.any(Function));
});

test("exposes a preview query failure and retries the request", async () => {
  vi.mocked(api.post)
    .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
    .mockResolvedValueOnce({
      data: { result: [{ data: [{ sum_amount: 12 }] }] },
    });

  const { result } = renderHook(() => useChartEditor({}), { wrapper });

  await waitFor(() => expect(result.current.chartData?.error).toBeTruthy(), {
    timeout: 3000,
  });
  expect(result.current.chartData?.error).toBe(
    "网络异常，请检查网络连接后重试",
  );
  expect(api.post).toHaveBeenCalledTimes(1);

  act(() => {
    result.current.chartData?.onRetry?.();
  });

  await waitFor(
    () => expect(result.current.chartData?.data).toEqual([{ sum_amount: 12 }]),
    { timeout: 3000 },
  );
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(result.current.chartData?.error).toBeUndefined();
});
