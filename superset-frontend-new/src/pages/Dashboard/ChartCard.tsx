import { memo, useRef, useMemo } from 'react';
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
import FlipIcon from '@mui/icons-material/Flip';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { buildEChartsOption, echarts } from '@/utils/echarts';
import DataPreviewTable from '@/components/DataPreviewTable';
import type { CellFormatter } from '@/components/DataPreviewTable';
import { useEChartsType } from '@/hooks/useEChartsType';
import MirrorTable from '@/pages/Dashboard/MirrorTable';

export interface CompareDimension {
  dimension: string;
  values: string[];
}

export interface CompareConfig {
  enabled: boolean;
  chartId: number;
  dimensions: CompareDimension[];
}

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
  compareConfig?: CompareConfig | null;
  mirrorData?: Record<string, unknown>;
  onToggleCompare: (chartId: number) => void;
}

function ChartCard({
  chartId, sliceName, vizType, data, meta, isDragging, containerWidth,
  onRefresh, onEdit, compareConfig, mirrorData, onToggleCompare,
}: ChartCardProps) {
  const option = data ? buildEChartsOption(vizType, data) : null;
  const chartLibReady = useEChartsType(vizType);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  function formatDateValue(value: unknown): string | null {
    if (typeof value === 'number') {
      if (value > 1e12 && value < 1e16) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
      }
      if (value > 19000000 && value < 21000000 && value < 1e9) {
        const s = String(Math.floor(value));
        if (s.length === 8) {
          return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        }
      }
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return null;
  }

  const tableFormatCell: CellFormatter | undefined = useMemo(() => {
    const colnames = (data as Record<string, unknown>).colnames as string[] | undefined;
    const coltypes = (data as Record<string, unknown>).coltypes as number[] | undefined;
    if (!colnames || !coltypes) return undefined;
    const dateCols = new Set(colnames.filter((_, i) => coltypes[i] === 2));
    if (dateCols.size === 0) return undefined;
    return (key: string, value: unknown) => {
      if (value === null || value === undefined) return '';
      if (dateCols.has(key)) {
        const formatted = formatDateValue(value);
        if (formatted !== null) return formatted;
      }
      return String(value);
    };
  }, [data]);

  const touchStart = () => {
    if (containerWidth >= 600) return;
    longPressTimer.current = setTimeout(() => onEdit(chartId), 600);
  };
  const touchEnd = () => clearTimeout(longPressTimer.current);
  const touchMove = () => clearTimeout(longPressTimer.current);

  const isCompareActive = compareConfig?.enabled && compareConfig.chartId === chartId;

  return (
    <Card
      onTouchStart={touchStart}
      onTouchEnd={touchEnd}
      onTouchMove={touchMove}
      sx={{
        height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 2,
        border: '1px solid', borderColor: isCompareActive ? 'primary.300' : 'divider',
        bgcolor: 'background.paper',
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
        <DragHandleIcon sx={{ fontSize: 18, color: 'text.disabled', mr: 0.5, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta?.slice_name || sliceName || `Chart #${chartId}`}
        </Typography>
        {vizType === 'table' && (
          <Tooltip title={isCompareActive ? 'Stop comparing' : 'Compare'}>
            <IconButton
              size="small"
              onClick={e => { e.stopPropagation(); onToggleCompare(chartId); }}
              sx={{ p: 0.5, color: isCompareActive ? 'primary.main' : undefined }}
            >
              <FlipIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={e => { e.stopPropagation(); onRefresh(chartId); }} sx={{ p: 0.5 }}>
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit Chart">
          <IconButton size="small" onClick={e => { e.stopPropagation(); onEdit(chartId); }} sx={{ p: 0.5 }}>
            <OpenInNewIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <CardContent sx={{ flex: 1, p: 1, '&:last-child': { pb: 1 }, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {vizType === 'table' && data ? (
          isCompareActive ? (
            <MirrorTable
              dimensions={compareConfig.dimensions}
              data={mirrorData}
              onClose={() => onToggleCompare(chartId)}
              formatCell={tableFormatCell}
            />
          ) : (
            <DataPreviewTable data={data} maxRows={100} formatCell={tableFormatCell} />
          )
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
            <CloudOffIcon sx={{ fontSize: 28, color: 'text.disabled' }} />
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
    && prev.data === next.data
    && prev.mirrorData === next.mirrorData
    && prev.compareConfig === next.compareConfig
    && prev.onRefresh === next.onRefresh;
});
