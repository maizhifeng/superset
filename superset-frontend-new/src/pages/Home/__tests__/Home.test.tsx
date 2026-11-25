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

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Home from "@/pages/Home";
import { test, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/useHomeStats", () => ({
  useHomeStats: () => ({
    dashboards: 1,
    charts: 1,
    datasets: 1,
    savedQueries: 1,
    databases: 1,
    recentDashboards: [
      {
        id: 9,
        dashboard_title: "最近仪表板",
        changed_on_utc: "2026-11-25T00:00:00Z",
      },
    ],
    recentDatasets: [],
    recentCharts: [],
    errors: {},
    loading: false,
    retry: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();

beforeEach(() => {
  mockNavigate.mockReset();
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

test("renders welcome title", () => {
  renderHome();
  expect(screen.getByText("欢迎使用 Starfly")).toBeInTheDocument();
});

test("renders all navigation sections", () => {
  renderHome();
  expect(screen.getByText("图表")).toBeInTheDocument();
  expect(screen.getByText("仪表板")).toBeInTheDocument();
  expect(screen.getByText("SQL 实验室")).toBeInTheDocument();
  expect(screen.getByText("数据库")).toBeInTheDocument();
  expect(screen.getByText("数据集")).toBeInTheDocument();
  expect(screen.getByText("查询历史")).toBeInTheDocument();
});

test("renders description text for each section", () => {
  renderHome();
  expect(screen.getByText("创建和管理图表")).toBeInTheDocument();
  expect(screen.getByText("将图表组织到仪表板中")).toBeInTheDocument();
});

test("navigates to chart list on Charts click", () => {
  renderHome();

  userEvent.click(screen.getByText("图表"));
  expect(mockNavigate).toHaveBeenCalledWith("/chart/list");
});

test("navigates to dashboard list on Dashboards click", () => {
  renderHome();

  userEvent.click(screen.getByText("仪表板"));
  expect(mockNavigate).toHaveBeenCalledWith("/dashboard/list");
});

test("opens a recent dashboard with Enter and Space", () => {
  renderHome();
  const item = screen.getByRole("button", { name: "打开仪表板 最近仪表板" });

  item.focus();
  fireEvent.keyDown(item, { key: "Enter" });
  fireEvent.keyDown(item, { key: " " });

  expect(mockNavigate).toHaveBeenNthCalledWith(1, "/dashboard/9");
  expect(mockNavigate).toHaveBeenNthCalledWith(2, "/dashboard/9");
});

test("labels recent item actions without activating the row", () => {
  renderHome();
  userEvent.click(screen.getByRole("button", { name: "复制链接" }));
  expect(mockNavigate).not.toHaveBeenCalled();
});
