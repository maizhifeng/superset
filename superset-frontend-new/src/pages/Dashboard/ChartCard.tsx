import { memo, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
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
import { buildEChartsOption, ensureChartType } from '@/utils/echarts';

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
  const [chartLibReady, setChartLibReady] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let cancelled = false;
    setChartLibReady(false);
    ensureChartType(vizType).then(() => {
      if (!cancelled) setChartLibReady(true);
    });
    return () => { cancelled = true; };
  }, [vizType]);

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
