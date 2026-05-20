import { type RefObject } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import AddIcon from "@mui/icons-material/Add";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import { GridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { ChartData } from "@/types/api";
import ChartCard from "@/pages/Dashboard/ChartCard";
import type { CompareConfig } from "@/pages/Dashboard/ChartCard";
import type { ChartLayoutItem } from "@/utils/dashboard/layout";

interface DashboardGridProps {
  containerWidth: number;
  gridLayout: { i: string; x: number; y: number; w: number; h: number }[];
  layoutItems: ChartLayoutItem[];
  chartMeta: Record<number, ChartData>;
  chartData: Record<number, Record<string, unknown>>;
  chartLoading: Record<number, boolean>;
  isDragging: boolean;
  saving: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onLayoutChange: (
    layout: { i: string; x: number; y: number; w: number; h: number }[],
  ) => void;
  onDragStart: () => void;
  onDragStop: () => void;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onRefresh: (chartId: number) => void;
  onEdit: (chartId: number) => void;
  onDelete: (chartId: number) => void;
  onAddChart?: () => void;
  compareConfig?: CompareConfig | null;
  mirrorData?: Record<string, unknown>;
  onToggleCompare: (chartId: number) => void;
  onOpenCompareBigScreen?: (chartId: number, chartData?: Record<string, unknown>) => void;
  otherRows?: Record<number, Record<string, unknown> | null>;
  onFetchOtherRow?: (
    chartId: number,
    excludeColumn: string,
    excludeValues: string[],
  ) => void;
  totalRows?: Record<number, Record<string, unknown> | null>;
}

export default function DashboardGrid({
  containerWidth,
  gridLayout,
  layoutItems,
  chartMeta,
  chartData,
  chartLoading,
  isDragging,
  saving,
  containerRef,
  onLayoutChange,
  onDragStart,
  onDragStop,
  onResizeStart,
  onResizeStop,
  onRefresh,
  onEdit,
  onDelete,
  onAddChart,
  compareConfig,
  mirrorData,
  onToggleCompare,
  onOpenCompareBigScreen,
  otherRows,
  onFetchOtherRow,
  totalRows,
}: DashboardGridProps) {
  if (layoutItems.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          textAlign: "center",
          borderRadius: 2,
          boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <BarChartOutlinedIcon
          sx={{ fontSize: 48, color: "text.disabled", mb: 1 }}
        />
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          No charts in this dashboard yet
        </Typography>
        {onAddChart && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onAddChart}
          >
            Add Chart
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{ width: "100%", position: "relative", minHeight: 400 }}
    >
      {saving && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            bgcolor: "background.paper",
            px: 1,
            py: 0.25,
            borderRadius: 1,
            boxShadow: 1,
          }}
        >
          <CircularProgress size={10} />
          <Typography variant="caption" color="text.secondary">
            Saving...
          </Typography>
        </Box>
      )}
      <GridLayout
        key={`layout-${containerWidth < 600}`}
        width={containerWidth}
        layout={gridLayout}
        gridConfig={{
          cols: 12,
          rowHeight: containerWidth < 600 ? 40 : 60,
          margin: [8, 8],
        }}
        onLayoutChange={onLayoutChange}
        onDragStart={onDragStart}
        onDragStop={onDragStop}
        onResizeStart={onResizeStart}
        onResizeStop={onResizeStop}
        dragConfig={{ enabled: containerWidth >= 600, handle: ".drag-handle" }}
        resizeConfig={{ enabled: containerWidth >= 600, handles: ["se"] }}
        autoSize
      >
        {layoutItems.map((item) => (
          <div key={item.i} data-chart-index={item.chartId}>
            <ChartCard
              chartId={item.chartId}
              sliceName={item.sliceName}
              vizType={chartMeta[item.chartId]?.viz_type || "bar"}
              data={chartData[item.chartId]}
              loading={!!chartLoading[item.chartId]}
              meta={chartMeta[item.chartId]}
              isDragging={isDragging}
              containerWidth={containerWidth}
              onRefresh={onRefresh}
              onEdit={onEdit}
              onDelete={onDelete}
              compareConfig={compareConfig}
              mirrorData={mirrorData}
              onToggleCompare={onToggleCompare}
              onOpenCompareBigScreen={onOpenCompareBigScreen}
              otherRow={otherRows?.[item.chartId]}
              onFetchOtherRow={onFetchOtherRow}
              totalRow={totalRows?.[item.chartId]}
            />
          </div>
        ))}
      </GridLayout>
    </Box>
  );
}
