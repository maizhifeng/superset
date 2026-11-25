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

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { HOME_ITEM_SOURCES, useHomeItems } from "../hooks/useHomeItems";

const apiGet = vi.hoisted(() =>
  vi.fn<
    (
      url: string,
      options: { signal: AbortSignal },
    ) => Promise<{
      data: {
        result?: Record<string, string | undefined> & { sql?: string };
      };
    }>
  >(),
);

vi.mock("@/api", () => ({
  default: { get: apiGet },
}));

beforeEach(() => {
  apiGet.mockReset();
});

test("hydrates items in id order and falls back when a title is missing", async () => {
  apiGet.mockImplementation((url) => {
    const id = Number(url.split("/").pop());
    return Promise.resolve({
      data: { result: id === 2 ? {} : { slice_name: `图表 ${id}` } },
    });
  });
  const ids = [3, 2];

  const { result } = renderHook(() =>
    useHomeItems(ids, HOME_ITEM_SOURCES.chart),
  );

  await waitFor(() =>
    expect(result.current).toEqual([
      { id: 3, title: "图表 3" },
      { id: 2, title: "图表 2" },
    ]),
  );
  expect(apiGet).toHaveBeenNthCalledWith(1, "/chart/3", {
    signal: expect.any(AbortSignal),
  });
  expect(apiGet).toHaveBeenNthCalledWith(2, "/chart/2", {
    signal: expect.any(AbortSignal),
  });
});

test("omits items whose requests fail", async () => {
  apiGet
    .mockResolvedValueOnce({ data: { result: { slice_name: "可用图表" } } })
    .mockRejectedValueOnce(new Error("not found"));
  const ids = [1, 2];

  const { result } = renderHook(() =>
    useHomeItems(ids, HOME_ITEM_SOURCES.chart),
  );

  await waitFor(() =>
    expect(result.current).toEqual([{ id: 1, title: "可用图表" }]),
  );
});

test("keeps saved query SQL for navigation", async () => {
  apiGet.mockResolvedValue({
    data: { result: { label: "保存的查询", sql: "select 1" } },
  });
  const ids = [7];

  const { result } = renderHook(() =>
    useHomeItems(ids, HOME_ITEM_SOURCES.savedQuery),
  );

  await waitFor(() =>
    expect(result.current).toEqual([
      { id: 7, title: "保存的查询", sql: "select 1" },
    ]),
  );
});

test("clears hydrated items when the id list becomes empty", async () => {
  apiGet.mockResolvedValue({
    data: { result: { dashboard_title: "仪表板" } },
  });
  const { result, rerender } = renderHook(
    ({ ids }: { ids: number[] }) =>
      useHomeItems(ids, HOME_ITEM_SOURCES.dashboard),
    { initialProps: { ids: [5] } },
  );

  await waitFor(() =>
    expect(result.current).toEqual([{ id: 5, title: "仪表板" }]),
  );

  rerender({ ids: [] });

  await waitFor(() => expect(result.current).toEqual([]));
});

test("aborts in-flight item requests on unmount", () => {
  let requestSignal: AbortSignal | undefined;
  apiGet.mockImplementation((_url, options) => {
    requestSignal = options.signal;
    return new Promise<never>(() => undefined);
  });
  const ids = [1];
  const { unmount } = renderHook(() =>
    useHomeItems(ids, HOME_ITEM_SOURCES.chart),
  );

  expect(requestSignal?.aborted).toBe(false);

  unmount();

  expect(requestSignal?.aborted).toBe(true);
});
