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
import { useSavedQueryFavorites } from "@/store/savedQueryFavorites";
import { FavoriteSavedQueries } from "../components/Favorites";

const apiGet = vi.hoisted(() =>
  vi.fn<
    (
      url: string,
      options: { signal: AbortSignal },
    ) => Promise<{
      data: { result?: { label?: string; sql?: string } };
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
  useSavedQueryFavorites.setState({ ids: [7] });
});

test("opens a favorite query with its SQL and removes it without navigation", async () => {
  apiGet.mockResolvedValue({
    data: { result: { label: "保存的查询", sql: "select 1" } },
  });
  render(
    <MemoryRouter>
      <FavoriteSavedQueries />
    </MemoryRouter>,
  );

  fireEvent.click(
    await screen.findByRole("button", { name: "打开查询 保存的查询" }),
  );
  expect(mockNavigate).toHaveBeenCalledWith("/sqllab", {
    state: { initialSql: "select 1" },
  });

  mockNavigate.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "移除收藏 保存的查询" }));

  expect(mockNavigate).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByText("收藏的查询")).not.toBeInTheDocument(),
  );
});
