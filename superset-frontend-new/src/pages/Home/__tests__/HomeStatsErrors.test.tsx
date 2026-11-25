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
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import Home from "@/pages/Home";
import type { HomeStats } from "@/hooks/useHomeStats";

const stats = vi.hoisted<HomeStats>(() => ({
  dashboards: 0,
  charts: 0,
  datasets: 0,
  savedQueries: 0,
  databases: 0,
  recentDashboards: [],
  recentDatasets: [],
  recentCharts: [],
  errors: {},
  loading: false,
  retry: () => {},
}));

vi.mock("@/hooks/useHomeStats", () => ({
  useHomeStats: () => stats,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

beforeEach(() => {
  stats.dashboards = 0;
  stats.charts = 0;
  stats.datasets = 0;
  stats.savedQueries = 0;
  stats.databases = 0;
  stats.recentDashboards = [];
  stats.recentDatasets = [];
  stats.recentCharts = [];
  stats.errors = {};
  stats.loading = false;
});

test("does not present a failed statistic as zero", () => {
  stats.errors.dashboards = "网络异常，请检查网络连接后重试";
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );

  const failedLabel = screen.getByText(
    "仪表板数加载失败：网络异常，请检查网络连接后重试",
  );
  expect(failedLabel.parentElement).toHaveTextContent("!");
  expect(failedLabel.parentElement).not.toHaveTextContent("0");

  const zeroLabel = screen.getByText("图表数");
  expect(zeroLabel.parentElement).toHaveTextContent("0");
});

test("surfaces recent-list errors instead of hiding them as empty sections", () => {
  stats.errors.recentCharts = "加载最近更新的图表失败";
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("加载最近更新的图表失败");
});

test("marks failed module counts without presenting them as zero", () => {
  stats.errors.charts = "图表服务不可用";
  stats.errors.savedQueries = "查询服务不可用";
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );

  expect(screen.getByTitle("图表服务不可用")).toHaveTextContent("!");
  expect(screen.getByTitle("图表服务不可用")).not.toHaveTextContent("0");
  expect(screen.getByText("查询数加载失败")).toBeInTheDocument();
});

test("keeps statistics and recent sections in their loading state", () => {
  stats.loading = true;
  stats.recentDashboards = [
    {
      id: 9,
      dashboard_title: "最近仪表板",
      published: true,
      changed_on_utc: "2026-11-25T00:00:00Z",
    },
  ];
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );

  expect(screen.getAllByText("–")).toHaveLength(5);
  expect(screen.queryByText("最近更新的仪表板")).not.toBeInTheDocument();
});
