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

import { useCallback } from "react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import TableSkeleton from "@/components/TableSkeleton";
import { EmptyState } from "@/superset-ui-mui/components";
import { spacing } from "@/theme/spacing";
import { useDashboardState } from "@/pages/Dashboard/hooks/useDashboardState";
import DashboardGrid from "@/pages/Dashboard/DashboardGrid";
import { DashboardFilterDrawer } from "@/components/DashboardFilter";
import DashboardModals from "@/pages/Dashboard/DashboardModals";

export default function Dashboard() {
  const {
    dashboard,
    loading,
    error,
    isDrawerOpen,
    editingSliceId,
    buildDashboardAdhocFilters,
    chartMeta,
    chartData,
    totalRows,
    pivotTotalRows,
    pivotSubtotalRows,
    chartLoading,
    chartErrors,
    chartPages,
    chartHasMore,
    metricFormatMaps,
    layoutItems,
    layout,
    filters,
    filterState,
    pendingFilterIds,
    filterDrawerOpen,
    navOpen,
    navItems,
    addChartDialogOpen,
    intervalSeconds,
    pageKey,
    compare,
    dashboardChartIds,
    setFilterDrawerOpen,
    setNavOpen,
    setAddChartDialogOpen,
    handleFilterChange,
    handleClearAll,
    handleChartPageChange,
    refreshChart,
    cycleInterval,
    handleChartSaved,
    handleCloseDrawer,
    handleAddChartSelect,
    handleDeleteChart,
  } = useDashboardState();

  const handleEditChart = useCallback((chartId: number) => {
    const [sp, setSp] = [
      new URLSearchParams(window.location.search),
      (p: URLSearchParams) => window.history.replaceState({}, "", `?${p}`),
    ];
    sp.set("slice_id", String(chartId));
    setSp(sp);
    window.dispatchEvent(new Event("popstate"));
  }, []);

  const handleAddChartOpen = useCallback(
    () => setAddChartDialogOpen(true),
    [setAddChartDialogOpen],
  );

  const handleRefreshChart = useCallback(
    (chartId: number) => void refreshChart(chartId),
    [refreshChart],
  );

  const handleDeleteChartClick = useCallback(
    (chartId: number) => void handleDeleteChart(chartId),
    [handleDeleteChart],
  );

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <TableSkeleton rows={6} />
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!dashboard) return <EmptyState title="未找到仪表板" />;

  return (
    <>
      <DashboardFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        onOpen={() => setFilterDrawerOpen(true)}
        filters={filters}
        filterState={filterState}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAll}
        pendingFilterIds={pendingFilterIds}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "auto",
          px: { xs: spacing.xs, md: spacing.md },
          pt: { xs: spacing.sm, md: spacing.md },
        }}
      >
        <DashboardGrid
          containerWidth={layout.containerWidth}
          layoutItems={layoutItems}
          saving={layout.saving}
          containerRef={layout.containerRef}
          chartData={{
            chartMeta,
            chartData,
            chartLoading,
            chartErrors,
            totalRows,
            pivotTotalRows,
            pivotSubtotalRows,
            metricFormatMaps,
            chartPages,
            chartHasMore,
            compareConfig: compare.compareConfig,
            mirrorData: compare.mirrorData,
          }}
          onSizeChange={layout.handleSizeChange}
          onRefresh={handleRefreshChart}
          onEdit={handleEditChart}
          onDelete={handleDeleteChartClick}
          onAddChart={handleAddChartOpen}
          onToggleCompare={compare.handleToggleCompare}
          onOpenCompareBigScreen={compare.openPeriodModal}
          intervalSeconds={intervalSeconds}
          onCycleInterval={cycleInterval}
          onChartPageChange={handleChartPageChange}
        />
      </Box>

      <DashboardModals
        isDrawerOpen={isDrawerOpen}
        editingSliceId={editingSliceId}
        chartMeta={chartMeta}
        navOpen={navOpen}
        navItems={navItems}
        addChartDialogOpen={addChartDialogOpen}
        dashboardChartIds={dashboardChartIds}
        pageKey={pageKey}
        compare={compare}
        buildAdhocFilters={buildDashboardAdhocFilters}
        onChartSaved={(id) => void handleChartSaved(id)}
        onCloseDrawer={handleCloseDrawer}
        onNavClose={() => setNavOpen(false)}
        onAddChartSelect={(c) => void handleAddChartSelect(c)}
        onAddChartClose={() => setAddChartDialogOpen(false)}
        onSaveLayout={layout.saveLayout}
      />
    </>
  );
}
