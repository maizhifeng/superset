import { memo, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DragHandleIcon from '@mui/icons-material/DragIndicator';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  CanvasRenderer,
]);

const chartTypeToECharts: Record<string, string> = {
  line: 'line', bar: 'bar', area: 'line', pie: 'pie',
  echarts_timeseries_line: 'line', echarts_area: 'area',
};

function buildEChartsOption(vizType: string, data: Record<string, unknown>) {
  const echartsType = chartTypeToECharts[vizType] || 'bar';

  if (vizType === 'pie') {
    return {
      tooltip: { trigger: 'item' as const },
      animation: true, animationDuration: 300,
      series: [{
        type: 'pie', radius: ['30%', '60%'], center: ['50%', '50%'],
        data: Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]).slice(0, 10).map(d => ({
          name: String(Object.values(d)[0] || ''), value: Number(Object.values(d)[1] || 0),
        })) : [],
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    };
  }

  const rows = Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]) : [];
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const categoryKey = keys[0] || 'category';
  const valueKeys = keys.slice(1).filter(k => typeof rows[0]?.[k] === 'number' || k !== categoryKey);

  const slicedRows = rows.slice(0, 50);
  const isTimeAxis = /year|date|time/i.test(categoryKey);
  const xLabels = slicedRows.map(r => {
    const v = r[categoryKey];
    if (isTimeAxis && typeof v === 'number' && !isNaN(v)) {
      const d = new Date(v);
      const y = d.getFullYear();
      if (y > 1900 && y < 2100) return d.toLocaleDateString();
    }
    return String(v ?? '');
  });

  const maxXLen = Math.max(...xLabels.map(l => l.length), 0);
  const rotatedExtent = Math.ceil(maxXLen * 7 * Math.sin(Math.PI / 4));

  const allYValues = valueKeys.flatMap(k => slicedRows.map(r => Number(r[k] || 0)).filter(v => Number.isFinite(v)).map(Math.abs));
  const yMax = allYValues.length > 0 ? Math.max(...allYValues) : 0;
  const yLabelChars = Math.max(String(Math.round(yMax)).length, 1);
  const yLabelWidth = yLabelChars * 7;

  const palette = ['#20a7c9', '#ff7f50', '#5ab1ef', '#ffb980', '#d87a80', '#8d98b3', '#e5cf0d', '#97b552'];
  const series = valueKeys.length > 0 ? valueKeys.map((key, i) => ({
    type: echartsType as ('bar' | 'line'),
    name: key,
    data: slicedRows.map(r => Number(r[key] || 0)),
    smooth: vizType === 'area',
    areaStyle: vizType === 'area' ? { opacity: 0.3 } : undefined,
    itemStyle: { color: palette[i % palette.length] },
  })) : [{
    type: echartsType as ('bar' | 'line'),
    name: 'value',
    data: slicedRows.map(r => Number(r[categoryKey] || 0)),
    smooth: vizType === 'area',
    areaStyle: vizType === 'area' ? { opacity: 0.3 } : undefined,
    itemStyle: { color: '#20a7c9' },
  }];

  return {
    tooltip: { trigger: 'axis' as const },
    legend: series.length > 1 ? { type: 'scroll' as const, bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8 } : undefined,
    grid: {
      left: Math.max(40, Math.min(yLabelWidth + 24, 120)),
      right: 20,
      top: 40,
      bottom: series.length > 1 ? Math.max(60, Math.min(rotatedExtent + 24, 160)) : Math.max(30, Math.min(rotatedExtent + 12, 100)),
    },
    animation: true, animationDuration: 300,
    xAxis: {
      type: 'category' as const,
      data: xLabels,
      axisLabel: { rotate: 45, fontSize: 10, margin: 8 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: {
        formatter: (v: number) => {
          if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
          if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
          if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
          return String(v);
        },
      },
    },
    series,
  };
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
}

function ChartCard({
  chartId, sliceName, vizType, data, meta, isDragging, containerWidth,
  onRefresh, onEdit,
}: ChartCardProps) {
  const option = data ? buildEChartsOption(vizType, data) : null;
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
        {vizType === 'table' && data?.data ? (
          <TableContainer sx={{ flex: 1 }}>
            <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, px: 1, fontSize: '0.75rem' } }}>
              {(() => {
                const rows = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
                const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
                return (
                  <>
                    <TableHead>
                      <TableRow>
                        {keys.map(k => <TableCell key={k} sx={{ fontWeight: 600 }}>{k}</TableCell>)}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={keys.length || 1} align="center">
                            <Typography variant="caption" color="text.secondary" sx={{ py: 2, display: 'block' }}>No data</Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.slice(0, 100).map((row, i) => (
                          <TableRow key={i}>
                            {keys.map(k => <TableCell key={k}>{String(row[k] ?? '')}</TableCell>)}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </>
                );
              })()}
            </Table>
          </TableContainer>
        ) : option ? (
          <ReactEChartsCore
            echarts={echarts}
            option={option}
            style={{ height: '100%', width: '100%' }}
            notMerge
            lazyUpdate
          />
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
