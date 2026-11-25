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

import { lazy, Suspense, useCallback } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import { useShortcutWithHelp } from "@/hooks/useShortcut";
import DashboardNav from "@/pages/Dashboard/DashboardNav";
import type {
  CompareConfig,
  CompareDimension,
} from "@/pages/Dashboard/ChartCard";
import type { ColumnOption } from "@/pages/Dashboard/CompareConfigModal";
import type { BuildAdhocFilters } from "@/pages/Dashboard/hooks/useDashboardData";
import type { ChartData, ChartDataPayload } from "@/types/api";

const ChartEditor = lazy(() => import("@/pages/ChartCreation/ChartEditor"));
const CompareConfigModal = lazy(
  () => import("@/pages/Dashboard/CompareConfigModal"),
);
const CompareModal = lazy(() => import("@/pages/Dashboard/CompareModal"));
const AddChartDialog = lazy(() => import("@/pages/Dashboard/AddChartDialog"));

interface DashboardCompareState {
  compareConfig: CompareConfig | null;
  compareModalOpen: boolean;
  datasetCompareColumns: ColumnOption[];
  initialCompareColumns: ColumnOption[];
  compareFullData?: ChartDataPayload;
  handleApplyCompare: (dimensions: CompareDimension[]) => void;
  closeCompareModal: () => void;
  periodModalOpen: boolean;
  periodModalChartId: number | null;
  periodModalChartData?: ChartDataPayload;
  compareChartMeta?: ChartData;
  closePeriodModal: () => void;
}

type DashboardFilterBuilder = (
  datasetId?: number,
) => ReturnType<BuildAdhocFilters>;

interface DashboardModalsProps {
  isDrawerOpen: boolean;
  editingSliceId: string | null;
  chartMeta: Record<number, ChartData>;
  navOpen: boolean;
  navItems: { id: number; name: string }[];
  addChartDialogOpen: boolean;
  dashboardChartIds: Set<number>;
  pageKey: string;

  compare: DashboardCompareState;

  buildAdhocFilters: DashboardFilterBuilder;
  onChartSaved: (chartId: number) => void;
  onCloseDrawer: () => void;
  onNavClose: () => void;
  onAddChartSelect: (chart: {
    id: number;
    slice_name: string;
    viz_type: string;
  }) => void;
  onAddChartClose: () => void;
  onSaveLayout: () => Promise<void>;
}

export default function DashboardModals({
  isDrawerOpen,
  editingSliceId,
  chartMeta,
  navOpen,
  navItems,
  addChartDialogOpen,
  dashboardChartIds,
  compare,
  buildAdhocFilters,
  onChartSaved,
  onCloseDrawer,
  onNavClose,
  onAddChartSelect,
  onAddChartClose,
  onSaveLayout,
}: DashboardModalsProps) {
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  const buildEditorAdhocFilters = useCallback(
    (datasetId?: number) =>
      buildAdhocFilters(datasetId).map((filter) => ({
        clause: "WHERE" as const,
        expressionType: "SIMPLE" as const,
        subject: filter.subject,
        operator: filter.operator,
        comparator: Array.isArray(filter.comparator)
          ? filter.comparator.map(String)
          : String(filter.comparator ?? ""),
      })),
    [buildAdhocFilters],
  );

  useShortcutWithHelp(
    "ctrl+s",
    (event) => {
      event.preventDefault();
      void onSaveLayout();
    },
    { label: "Save Dashboard", category: "dashboard" },
    { allowInInput: true },
  );

  useShortcutWithHelp(
    "f",
    (event) => {
      event.preventDefault();
      toggleFullscreen();
    },
    { label: "Toggle Full Screen", category: "dashboard" },
  );

  return (
    <>
      <Drawer
        variant="temporary"
        anchor="right"
        open={isDrawerOpen}
        onClose={onCloseDrawer}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100vw", md: "50vw" },
              top: 0,
              height: "100vh",
              borderRight: "none",
              borderTopLeftRadius: 12,
              borderBottomLeftRadius: 12,
            },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {isDrawerOpen && (
            <Suspense fallback={null}>
              <ChartEditor
                compact
                onChartSaved={onChartSaved}
                initialData={
                  editingSliceId ? chartMeta[Number(editingSliceId)] : null
                }
                buildDashboardAdhocFilters={buildEditorAdhocFilters}
              />
            </Suspense>
          )}
        </Box>
      </Drawer>

      <Suspense fallback={null}>
        <CompareConfigModal
          open={compare.compareModalOpen}
          columns={compare.datasetCompareColumns}
          initialColumns={compare.initialCompareColumns}
          fullData={compare.compareFullData}
          onApply={compare.handleApplyCompare}
          onCancel={compare.closeCompareModal}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CompareModal
          open={compare.periodModalOpen}
          chartId={compare.periodModalChartId}
          chartData={compare.periodModalChartData}
          chartMeta={compare.compareChartMeta}
          onClose={compare.closePeriodModal}
        />
      </Suspense>

      <Suspense fallback={null}>
        <AddChartDialog
          open={addChartDialogOpen}
          excludeIds={dashboardChartIds}
          onSelect={onAddChartSelect}
          onClose={onAddChartClose}
        />
      </Suspense>

      <DashboardNav open={navOpen} items={navItems} onClose={onNavClose} />
    </>
  );
}
