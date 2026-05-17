import { memo, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DragHandleIcon from '@mui/icons-material/DragIndicator';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { buildEChartsOption, echarts } from '@/utils/echarts';
import DataPreviewTable from '@/components/DataPreviewTable';
import { useEChartsType } from '@/hooks/useEChartsType';

interface ChartCardProps {
  chartId: number;
  sliceName?: string;
  vizType: string;
  data?: Record<string, unknown>;
  meta?: { slice_name?: string };
  isDragging: boolean;
  containerWidth: number;
  onRefresh: (chartId: number) => void;
  onEdit: (chartId: number) => void;
}

function ChartCard({
  chartId, sliceName, vizType, data, meta, isDragging, containerWidth,
  onRefresh, onEdit,
}: ChartCardProps) {
  const option = data ? buildEChartsOption(vizType, data) : null;
  const chartLibReady = useEChartsType(vizType);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  const touchStart = () => {
    if (containerWidth >= 600) return;
    longPressTimer.current = setTimeout(() => onEdit(chartId), 600);
  };
  const touchEnd = () => clearTimeout(longPressTimer.current);
  const touchMove = () => clearTimeout(longPressTimer.current);

  return (
    <Card
      onTouchStart={touchStart}
      onTouchEnd={touchEnd}
      onTouchMove={touchMove}
      sx={{
        height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 2,
        border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
        boxShadow: isDragging ? 6 : 0,
        transition: 'box-shadow 200ms ease',
        '&:hover': { boxShadow: 2 },
      }}
    >
      <Box
        className="drag-handle"
        sx={{
          display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, cursor: 'move',
          borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50',
        }}
      >
        <DragHandleIcon sx={{ fontSize: 16, color: 'text.disabled', mr: 0.5, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta?.slice_name || sliceName || `Chart #${chartId}`}
        </Typography>
        <IconButton size="small" onClick={e => { e.stopPropagation(); onRefresh(chartId); }} sx={{ p: 0.5 }}>
          <RefreshIcon sx={{ fontSize: 14 }} />
        </IconButton>
        <Tooltip title="Edit Chart">
          <IconButton size="small" onClick={e => { e.stopPropagation(); onEdit(chartId); }} sx={{ p: 0.5 }}>
            <OpenInNewIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <CardContent sx={{ flex: 1, p: 1, '&:last-child': { pb: 1 }, display: 'flex', minHeight: 0, overflow: 'auto' }}>
        {vizType === 'table' && data ? (
          <DataPreviewTable data={data} maxRows={100} />
        ) : option && chartLibReady ? (
          <ReactEChartsCore
            echarts={echarts}
            option={option}
            style={{ height: '100%', width: '100%' }}
            notMerge
            lazyUpdate
          />
        ) : option ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>Chart data unavailable</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(ChartCard, (prev, next) => {
  return prev.chartId === next.chartId
    && prev.vizType === next.vizType
    && prev.isDragging === next.isDragging
    && prev.containerWidth === next.containerWidth
    && prev.meta?.slice_name === next.meta?.slice_name
    && prev.sliceName === next.sliceName
    && prev.data === next.data;
});
