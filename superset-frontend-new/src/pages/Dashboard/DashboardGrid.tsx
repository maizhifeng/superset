import { type RefObject } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { GridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { ChartData } from '@/types/api';
import ChartCard from '@/pages/Dashboard/ChartCard';
import type { ChartLayoutItem } from '@/utils/dashboard/layout';

interface DashboardGridProps {
  containerWidth: number;
  gridLayout: { i: string; x: number; y: number; w: number; h: number }[];
  layoutItems: ChartLayoutItem[];
  chartMeta: Record<number, ChartData>;
  chartData: Record<number, Record<string, unknown>>;
  isDragging: boolean;
  saving: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onLayoutChange: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  onDragStart: () => void;
  onDragStop: () => void;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onRefresh: (chartId: number) => void;
  onEdit: (chartId: number) => void;
}

export default function DashboardGrid({
  containerWidth, gridLayout, layoutItems, chartMeta, chartData,
  isDragging, saving, containerRef, onLayoutChange,
  onDragStart, onDragStop, onResizeStart, onResizeStop,
  onRefresh, onEdit,
}: DashboardGridProps) {
  if (layoutItems.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Typography color="text.secondary">No charts in this dashboard yet</Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{ width: '100%', position: 'relative', minHeight: 400 }}
    >
      {saving && (
        <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'background.paper', px: 1, py: 0.25, borderRadius: 1, boxShadow: 1 }}>
          <CircularProgress size={10} />
          <Typography variant="caption" color="text.secondary">Saving...</Typography>
        </Box>
      )}
      <GridLayout
        key={`layout-${containerWidth < 600}`}
        width={containerWidth}
        layout={gridLayout}
        gridConfig={{ cols: 12, rowHeight: containerWidth < 600 ? 40 : 60, margin: [8, 8] }}
        onLayoutChange={onLayoutChange}
        onDragStart={onDragStart}
        onDragStop={onDragStop}
        onResizeStart={onResizeStart}
        onResizeStop={onResizeStop}
        dragConfig={{ enabled: containerWidth >= 600, handle: '.drag-handle' }}
        resizeConfig={{ enabled: containerWidth >= 600, handles: ['se'] }}
        autoSize
      >
        {layoutItems.map(item => (
          <div key={item.i} data-chart-index={item.chartId}>
            <ChartCard
              chartId={item.chartId}
              sliceName={item.sliceName}
              vizType={chartMeta[item.chartId]?.viz_type || 'bar'}
              data={chartData[item.chartId]}
              meta={chartMeta[item.chartId]}
              isDragging={isDragging}
              containerWidth={containerWidth}
              onRefresh={onRefresh}
              onEdit={onEdit}
            />
          </div>
        ))}
      </GridLayout>
    </Box>
  );
}
