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

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { test, expect, vi, beforeEach } from "vitest";
import SearchOverlay from "@/components/AppLayout/SearchOverlay";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/api", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { result: [] } }) },
}));

vi.mock("@/store/recentDashboards", () => {
  const items: number[] = [];
  return {
    useRecentDashboards: (selector: (state: { items: number[] }) => unknown) =>
      selector({ items }),
  };
});

vi.mock("@/store/recentCharts", () => {
  const items: number[] = [];
  return {
    useRecentCharts: (selector: (state: { items: number[] }) => unknown) =>
      selector({ items }),
  };
});

vi.mock("@/store/authStore", () => {
  const user = { username: "admin" };
  return {
    useAuthStore: (
      selector: (state: { user: { username: string } }) => unknown,
    ) => selector({ user }),
  };
});

vi.mock("@/utils/recentSql", () => ({ readRecentSqlQueries: () => [] }));

function Harness() {
  const [query, setQuery] = useState("");
  return (
    <SearchOverlay
      open
      query={query}
      onQueryChange={setQuery}
      onClose={vi.fn()}
    />
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
});

test("exposes combobox semantics and opens system admin with the keyboard", async () => {
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );

  const combobox = screen.getByRole("combobox", { name: "全局搜索" });
  expect(combobox).toHaveAttribute("aria-expanded", "true");
  expect(combobox).toHaveAttribute(
    "aria-controls",
    screen.getByRole("listbox").id,
  );

  userEvent.type(combobox, "系统");
  const option = await screen.findByRole("option", { name: /系统管理/ });
  fireEvent.keyDown(combobox, { key: "ArrowDown" });
  expect(combobox).toHaveAttribute("aria-activedescendant", option.id);
  expect(option).toHaveAttribute("aria-selected", "true");

  fireEvent.keyDown(combobox, { key: "Enter" });
  expect(mockNavigate).toHaveBeenCalledWith("/system/admin");
});
