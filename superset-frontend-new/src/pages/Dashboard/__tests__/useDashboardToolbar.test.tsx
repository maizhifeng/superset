/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { beforeEach, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useDashboardToolbar from "@/pages/Dashboard/useDashboardToolbar";
import { useToolbarStore } from "@/store/toolbarStore";
import type { DashboardData } from "@/types/api";

const dashboard: DashboardData = {
  id: 7,
  dashboard_title: "Dashboard",
  published: true,
  position_json: "{}",
  json_metadata: "{}",
  charts: [],
};

beforeEach(() => {
  useToolbarStore.setState({ registry: {} });
});

test("dashboard toolbar omits the nonfunctional AI chat control", () => {
  const params = {
    dashboard,
    activeCount: 0,
    hiddenFilters: [],
    clearAll: vi.fn(),
    layoutItems: [{ chartId: 1 }, { chartId: 2 }],
    onFilterDrawerOpen: vi.fn(),
    onFilterDrawerToggle: vi.fn(),
    onAddFilter: vi.fn(),
    onRefreshAll: vi.fn(),
    onOpenNav: vi.fn(),
    onAddChart: vi.fn(),
  };

  const { unmount } = renderHook(() => useDashboardToolbar(params));
  const tools = useToolbarStore.getState().registry.dashboard_7;

  expect(tools?.map((tool) => tool.id)).toEqual([
    "add_chart",
    "filter",
    "refresh",
    "nav",
  ]);
  expect(tools?.some((tool) => tool.id === "search")).toBe(false);

  unmount();
  expect(useToolbarStore.getState().registry.dashboard_7).toBeUndefined();
});
