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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { useRecentCharts } from "@/store/recentCharts";
import {
  RecentQueries,
  RecentlyViewedCharts,
} from "../components/RecentShortcuts";
import {
  RECENT_QUERY_STORAGE_KEY,
  readRecentQueries,
} from "../utils/homeFormatting";

const apiGet = vi.hoisted(() =>
  vi.fn<
    (
      url: string,
      options: { signal: AbortSignal },
    ) => Promise<{
      data: { result?: { slice_name?: string } };
    }>
  >(),
);

vi.mock("@/api", () => ({
  default: { get: apiGet },
}));

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  apiGet.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
  useRecentCharts.setState({ items: [] });
});

test("reopens the original recent SQL and clears its stored history", () => {
  localStorage.setItem(
    RECENT_QUERY_STORAGE_KEY,
    JSON.stringify(["select\n\n1"]),
  );
  render(
    <MemoryRouter>
      <RecentQueries />
    </MemoryRouter>,
  );

  fireEvent.keyDown(
    screen.getByRole("button", { name: "重新运行查询 select 1" }),
    { key: "Enter" },
  );
  expect(mockNavigate).toHaveBeenCalledWith("/sqllab", {
    state: { initialSql: "select\n\n1" },
  });

  fireEvent.click(screen.getByRole("button", { name: "清除查询记录" }));

  expect(screen.queryByText("最近的查询")).not.toBeInTheDocument();
  expect(localStorage.getItem(RECENT_QUERY_STORAGE_KEY)).toBeNull();
});

test("opens a recently viewed chart with the keyboard and clears the list", async () => {
  useRecentCharts.setState({ items: [{ id: 4, viewedAt: 1 }] });
  apiGet.mockResolvedValue({ data: { result: {} } });
  render(
    <MemoryRouter>
      <RecentlyViewedCharts />
    </MemoryRouter>,
  );

  const item = await screen.findByRole("button", {
    name: "打开图表 图表 4",
  });
  fireEvent.keyDown(item, { key: " " });
  expect(mockNavigate).toHaveBeenCalledWith("/explore?slice_id=4");

  fireEvent.click(screen.getByRole("button", { name: "清空" }));

  await waitFor(() =>
    expect(screen.queryByText("最近打开的图表")).not.toBeInTheDocument(),
  );
  expect(useRecentCharts.getState().items).toEqual([]);
});

test("ignores malformed recent SQL storage", () => {
  localStorage.setItem(RECENT_QUERY_STORAGE_KEY, "not-json");
  render(
    <MemoryRouter>
      <RecentQueries />
    </MemoryRouter>,
  );

  expect(
    readRecentQueries(localStorage.getItem(RECENT_QUERY_STORAGE_KEY)),
  ).toEqual([]);
  expect(screen.queryByText("最近的查询")).not.toBeInTheDocument();
});
