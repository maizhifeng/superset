import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import TableSkeleton from "@/components/TableSkeleton";
import { EmptyState } from "@/superset-ui-mui/components";
import { useDrawerStore } from "@/store/drawerState";
import { spacing } from "@/theme/spacing";
import { useDashboardState } from "@/pages/Dashboard/hooks/useDashboardState";
import DashboardGrid from "@/pages/Dashboard/DashboardGrid";
import { DashboardFilterDrawer } from "@/components/DashboardFilter";
import DashboardModals from "@/pages/Dashboard/DashboardModals";

export default function Dashboard() {
  const {
    dashboard, loading, error, isDrawerOpen, editingSliceId, buildDashboardAdhocFilters,
    chartMeta, chartData, totalRows, chartLoading, chartPages, chartHasMore, metricFormatMaps,
    layoutItems, layout,
    filters, filterState, pendingFilterIds, filterDrawerOpen,
    navOpen, navItems, addChartDialogOpen,
    intervalSeconds, pageKey,
    compare, dashboardChartIds,
    setFilterDrawerOpen, setNavOpen, setAddChartDialogOpen,
    handleFilterChange, handleClearAll, handleChartPageChange, refreshChart, cycleInterval,
    handleChartSaved, handleCloseDrawer, handleOpenInsight, handleAddChartSelect, handleDeleteChart,
  } = useDashboardState();

  if (loading) {
    return <Box sx={{ p: 3 }}><TableSkeleton rows={6} /></Box>;
  }
  if (error) {
    return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;
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

      <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden", px: { xs: spacing.xs, md: spacing.md }, pt: { xs: spacing.sm, md: spacing.md } }}>
        <DashboardGrid
          containerWidth={layout.containerWidth}
          layoutItems={layoutItems}
          chartMeta={chartMeta}
          chartData={chartData}
          chartLoading={chartLoading}
          saving={layout.saving}
          containerRef={layout.containerRef}
          onSizeChange={layout.handleSizeChange}
          onRefresh={refreshChart}
          onEdit={(chartId: number) => {
            useDrawerStore.getState().closeAiDrawer();
            const [sp, setSp] = [new URLSearchParams(window.location.search), (p: URLSearchParams) => window.history.replaceState({}, "", `?${p}`)];
            sp.set("slice_id", String(chartId));
            setSp(sp);
            window.dispatchEvent(new Event("popstate"));
          }}
          onDelete={handleDeleteChart}
          onInsight={handleOpenInsight}
          onAddChart={() => setAddChartDialogOpen(true)}
          compareConfig={compare.compareConfig}
          mirrorData={compare.mirrorData}
          onToggleCompare={compare.handleToggleCompare}
          onOpenCompareBigScreen={compare.openPeriodModal}
          totalRows={totalRows}
          intervalSeconds={intervalSeconds}
          onCycleInterval={cycleInterval}
          metricFormatMaps={metricFormatMaps}
          chartPages={chartPages}
          chartHasMore={chartHasMore}
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
        onChartSaved={handleChartSaved}
        onCloseDrawer={handleCloseDrawer}
        onNavClose={() => setNavOpen(false)}
        onAddChartSelect={handleAddChartSelect}
        onAddChartClose={() => setAddChartDialogOpen(false)}
        onSaveLayout={layout.saveLayout}
      />
    </>
  );
}
