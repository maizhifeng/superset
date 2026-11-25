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
import rison from "rison";
import { beforeEach, expect, test, vi } from "vitest";
import api from "@/api";
import { useHomeStats } from "@/hooks/useHomeStats";

vi.mock("@/api", () => ({
  default: { get: vi.fn() },
}));

function queryOf(url: string): { page_size: number } {
  const encoded = new URL(url, "http://localhost").searchParams.get("q") ?? "";
  return rison.decode<{ page_size: number }>(encoded);
}

function networkError() {
  return Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
}

function mockResponses(
  options: { failCharts?: boolean; failRecent?: boolean } = {},
) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    const { page_size } = queryOf(url);
    if (options.failCharts && url.startsWith("/chart/") && page_size === 1) {
      return Promise.reject(networkError());
    }
    if (options.failRecent && url.startsWith("/dataset/") && page_size === 6) {
      return Promise.reject(new Error("recent unavailable"));
    }
    const counts: Record<string, number> = {
      "/dashboard/": 3,
      "/chart/": 0,
      "/dataset/": 2,
      "/saved_query/": 4,
      "/database/": 1,
    };
    const endpoint = Object.keys(counts).find((key) => url.startsWith(key));
    return Promise.resolve({
      data: {
        result: endpoint && page_size === 1 ? [{ id: 1 }] : [],
        count: endpoint ? counts[endpoint] : 0,
      },
    });
  });
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

test("keeps a successful zero distinct from a failed count", async () => {
  mockResponses({ failCharts: true });
  const { result } = renderHook(() => useHomeStats());

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.dashboards).toBe(3);
  expect(result.current.charts).toBe(0);
  expect(result.current.errors.charts).toBe("网络异常，请检查网络连接后重试");
  expect(result.current.errors.dashboards).toBeUndefined();
});

test("reports recent-list failures without blocking other statistics", async () => {
  mockResponses({ failRecent: true });
  const { result } = renderHook(() => useHomeStats());

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.datasets).toBe(2);
  expect(result.current.recentDatasets).toEqual([]);
  expect(result.current.errors.recentDatasets).toBe("recent unavailable");
  expect(result.current.errors.datasets).toBeUndefined();
});

test("retries failed requests and clears their errors", async () => {
  mockResponses({ failCharts: true });
  const { result } = renderHook(() => useHomeStats());

  await waitFor(() => expect(result.current.errors.charts).toBeTruthy());

  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockResolvedValue({
    data: { result: [], count: 0 },
  });
  act(() => {
    result.current.retry();
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.errors).toEqual({});
  expect(api.get).toHaveBeenCalledTimes(8);
});

test("returns no errors when every request succeeds with zero", async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { result: [], count: 0 },
  });
  const { result } = renderHook(() => useHomeStats());

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.errors).toEqual({});
  expect(result.current.charts).toBe(0);
});
