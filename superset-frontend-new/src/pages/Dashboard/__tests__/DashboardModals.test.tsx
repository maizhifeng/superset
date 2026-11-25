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

import { expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import DashboardModals from "@/pages/Dashboard/DashboardModals";

const { shortcutSpy } = vi.hoisted(() => ({ shortcutSpy: vi.fn() }));

vi.mock("@/hooks/useShortcut", () => ({
  useShortcutWithHelp: shortcutSpy,
}));

vi.mock("@/pages/ChartCreation/ChartEditor", () => ({
  default: () => null,
}));

vi.mock("@/pages/Dashboard/CompareConfigModal", () => ({
  default: () => null,
}));

vi.mock("@/pages/Dashboard/CompareModal", () => ({
  default: () => null,
}));

vi.mock("@/pages/Dashboard/AddChartDialog", () => ({
  default: () => null,
}));

vi.mock("@/pages/Dashboard/DashboardNav", () => ({
  default: () => null,
}));

test("dashboard modals keep save and fullscreen without no-op undo/redo shortcuts", async () => {
  const onSaveLayout = vi.fn().mockResolvedValue(undefined);
  const props: ComponentProps<typeof DashboardModals> = {
    isDrawerOpen: false,
    editingSliceId: null,
    chartMeta: {},
    navOpen: false,
    navItems: [],
    addChartDialogOpen: false,
    dashboardChartIds: new Set<number>(),
    pageKey: "dashboard_7",
    compare: {
      compareConfig: null,
      compareModalOpen: false,
      datasetCompareColumns: [],
      initialCompareColumns: [],
      handleApplyCompare: vi.fn(),
      closeCompareModal: vi.fn(),
      periodModalOpen: false,
      periodModalChartId: null,
      closePeriodModal: vi.fn(),
    },
    buildAdhocFilters: vi.fn(() => []),
    onChartSaved: vi.fn(),
    onCloseDrawer: vi.fn(),
    onNavClose: vi.fn(),
    onAddChartSelect: vi.fn(),
    onAddChartClose: vi.fn(),
    onSaveLayout,
  };

  render(<DashboardModals {...props} />);
  await act(async () => {});

  expect(shortcutSpy.mock.calls.map(([key]) => key)).toEqual(["ctrl+s", "f"]);
  expect(shortcutSpy.mock.calls.map(([key]) => key)).not.toContain("ctrl+z");
  expect(shortcutSpy.mock.calls.map(([key]) => key)).not.toContain("ctrl+y");

  const saveHandler = shortcutSpy.mock.calls.find(
    ([key]) => key === "ctrl+s",
  )?.[1] as (event: { preventDefault: () => void }) => void;
  const preventDefault = vi.fn();
  saveHandler({ preventDefault });

  expect(preventDefault).toHaveBeenCalledOnce();
  expect(onSaveLayout).toHaveBeenCalledOnce();
});
