import { lazy, Suspense } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import UndoRedoKeyListeners from "@/dashboard/components/UndoRedoKeyListeners";
import DashboardNav from "@/pages/Dashboard/DashboardNav";
import type { ChartData } from "@/types/api";

const ChartEditor = lazy(() => import("@/pages/ChartCreation/ChartEditor"));
const CompareConfigModal = lazy(() => import("@/pages/Dashboard/CompareConfigModal"));
const CompareModal = lazy(() => import("@/pages/Dashboard/CompareModal"));
const AddChartDialog = lazy(() => import("@/pages/Dashboard/AddChartDialog"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCompare = any;

interface DashboardModalsProps {
  isDrawerOpen: boolean;
  editingSliceId: string | null;
  chartMeta: Record<number, ChartData>;
  navOpen: boolean;
  navItems: { id: number; name: string }[];
  addChartDialogOpen: boolean;
  dashboardChartIds: Set<number>;
  pageKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compare: AnyCompare;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildAdhocFilters: any;
  onChartSaved: (chartId: number) => void;
  onCloseDrawer: () => void;
  onNavClose: () => void;
  onAddChartSelect: (chart: { id: number; slice_name: string; viz_type: string }) => void;
  onAddChartClose: () => void;
  onSaveLayout: () => Promise<void>;
}

export default function DashboardModals({
  isDrawerOpen, editingSliceId, chartMeta,
  navOpen, navItems, addChartDialogOpen, dashboardChartIds, pageKey,
  compare, buildAdhocFilters,
  onChartSaved, onCloseDrawer, onNavClose, onAddChartSelect, onAddChartClose, onSaveLayout,
}: DashboardModalsProps) {
  return (
    <>
      <Drawer
        variant="temporary"
        anchor="right"
        open={isDrawerOpen}
        onClose={onCloseDrawer}
        slotProps={{
          paper: {
            sx: { width: { xs: "100vw", md: "50vw" }, top: 0, height: "100vh", borderRight: "none", borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {isDrawerOpen && (
            <Suspense fallback={null}>
              <ChartEditor
                compact
                onChartSaved={onChartSaved}
                initialData={editingSliceId ? chartMeta[Number(editingSliceId)] : null}
                buildDashboardAdhocFilters={buildAdhocFilters}
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

      <UndoRedoKeyListeners
        onUndo={() => {}}
        onRedo={() => {}}
        onSave={onSaveLayout}
        onToggleFullScreen={() => {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen();
          else document.exitFullscreen();
        }}
      />

      <DashboardNav open={navOpen} items={navItems} onClose={onNavClose} />
    </>
  );
}
