import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DragHandleIcon from '@mui/icons-material/DragIndicator';
import { useNavigate } from 'react-router-dom';
import { GridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import api from '@/api';

echarts.use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  CanvasRenderer,
]);

interface DashboardData {
  id: number;
  dashboard_title: string;
  published: boolean;
  description?: string;
  position_json: string;
  json_metadata: string;
  charts: string[];
  created_by?: { email?: string; username?: string; first_name?: string; last_name?: string };
}

interface LayoutNode {
  id: string;
  type: string;
  children: string[];
  meta?: Record<string, unknown>;
}

interface ChartData {
  id: number;
  slice_name: string;
  viz_type: string;
  datasource_id?: number;
  datasource_type?: string;
  datasource_name_text?: string;
  form_data?: Record<string, unknown> | string;
}

interface ChartLayoutItem {
  i: string; x: number; y: number; w: number; h: number;
  minW: number; minH: number;
  chartId: number; sliceName?: string;
}

const chartTypeToECharts: Record<string, string> = {
  line: 'line', bar: 'bar', area: 'line', pie: 'pie',
  big_number: 'bar', big_number_total: 'bar',
  echarts_timeseries_line: 'line', echarts_area: 'line',
};

function buildEChartsOption(vizType: string, data: Record<string, unknown>) {
  const baseOption: Record<string, unknown> = {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    animation: true, animationDuration: 300,
  };
  const echartsType = chartTypeToECharts[vizType] || 'bar';

  if (vizType === 'pie') {
    return {
      ...baseOption, tooltip: { trigger: 'item' as const }, grid: undefined,
      series: [{
        type: 'pie', radius: ['30%', '60%'], center: ['50%', '50%'],
        data: Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]).slice(0, 10).map((d: Record<string, unknown>) => ({
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
  const metricKey = valueKeys[0] || 'value';

  return {
    ...baseOption,
    xAxis: { type: 'category' as const, data: rows.slice(0, 50).map(r => String(r[categoryKey] ?? '')), axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value' as const },
    series: [{
      type: echartsType, data: rows.slice(0, 50).map(r => Number(r[metricKey] || 0)),
      smooth: vizType === 'area', areaStyle: vizType === 'area' ? { opacity: 0.3 } : undefined,
      itemStyle: { color: '#20a7c9' },
    }],
  };
}

  function flattenLayout(nodeMap: Record<string, LayoutNode>, gridId: string): ChartLayoutItem[] {
  const items: ChartLayoutItem[] = [];
  function processNode(nodeId: string, parentWidth: number, offsetX: number, offsetY: number) {
    const node = nodeMap[nodeId];
    if (!node) return { height: 0 };
    if (node.type === 'CHART') {
      const w = (node.meta?.width as number) || 4;
      const h = Math.max(Math.round(((node.meta?.height as number) || 30) * 8 / 60), 3);
      items.push({
        i: node.id, x: offsetX, y: offsetY,
        w: Math.min(w, 12), h, minW: 2, minH: 3,
        chartId: node.meta?.chartId as number,
        sliceName: node.meta?.sliceName as string,
      });
      return { height: h };
    }
    if (node.type === 'ROW') {
      const children = (node.children || []).filter(id => nodeMap[id]);
      let xOff = 0; let maxH = 0;
      for (const childId of children) {
        const cw = getChildWidth(nodeMap[childId], parentWidth);
        const r = processNode(childId, parentWidth, offsetX + xOff, offsetY);
        xOff += cw; maxH = Math.max(maxH, r.height);
      }
      return { height: maxH };
    }
    if (node.type === 'COLUMN') {
      const cw = (node.meta?.width as number) || parentWidth;
      const children = (node.children || []).filter(id => nodeMap[id]);
      let yOff = 0;
      for (const childId of children) {
        const r = processNode(childId, cw, offsetX, offsetY + yOff);
        yOff += r.height;
      }
      return { height: yOff };
    }
    if (node.type === 'GRID') {
      const children = (node.children || []).filter(id => nodeMap[id]);
      let yOff = 0;
      for (const childId of children) {
        const r = processNode(childId, 12, 0, yOff);
        yOff += r.height;
      }
      return { height: yOff };
    }
    return { height: 0 };
  }
  if (gridId) processNode(gridId, 12, 0, 0);
  return items;
}

function getChildWidth(node: LayoutNode, parentWidth: number): number {
  if (!node) return 0;
  if (node.type === 'CHART') return (node.meta?.width as number) || 4;
  if (node.type === 'COLUMN') return (node.meta?.width as number) || parentWidth;
  return parentWidth;
}

export default function Dashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [nodeMap, setNodeMap] = useState<Record<string, LayoutNode>>({});
  const [gridId, setGridId] = useState<string | null>(null);
  const [chartData, setChartData] = useState<Record<number, Record<string, unknown>>>({});
  const [chartMeta, setChartMeta] = useState<Record<number, ChartData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const { setCustom } = useBreadcrumb();
  const prevTitleRef = useRef<string | null>(null);

  const [containerWidth, setContainerWidth] = useState(window.innerWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    handler();
    window.addEventListener('resize', handler);
    const observer = new ResizeObserver(handler);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', handler);
      observer.disconnect();
    };
  }, []);

  const layoutItems = useMemo(() => {
    if (!gridId || Object.keys(nodeMap).length === 0) return [];
    return flattenLayout(nodeMap, gridId);
  }, [nodeMap, gridId]);

  const gridLayout = useMemo(() =>
    layoutItems.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })),
  [layoutItems]);

  const loadDashboard = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/dashboard/${id}`);
      const dash: DashboardData = res.data.result;
      setDashboard(dash);
      if (prevTitleRef.current !== dash.dashboard_title) {
        prevTitleRef.current = dash.dashboard_title;
        setCustom({
          label: dash.dashboard_title,
          actions: (
            <Chip label={dash.published ? 'Published' : 'Not published'} color={dash.published ? 'success' : 'default'} size="small" sx={{ height: 20, ml: 0.5 }} />
          ),
        });
      }

      let parsedNodes: Record<string, LayoutNode> = {};
      let root: LayoutNode | null = null;
      try {
        const posData = JSON.parse(dash.position_json || '{}');
        for (const [key, val] of Object.entries(posData)) {
          if (typeof val === 'object' && val !== null && (val as LayoutNode).type) {
            parsedNodes[key] = val as LayoutNode;
            if ((val as LayoutNode).type === 'ROOT') root = val as LayoutNode;
          }
        }
      } catch { /* empty */ }

      const gId = root?.children?.[0] || null;
      setGridId(gId);
      setNodeMap(parsedNodes);

      const chartIds = Object.values(parsedNodes)
        .filter(n => n.type === 'CHART')
        .map(n => (n.meta?.chartId as number))
        .filter(Boolean);

      let metaMap: Record<number, ChartData> = {};
      if (chartIds.length > 0) {
        try {
          const metaRes = await api.get('/chart/?q=(page_size:200,page:0)');
          const allCharts: ChartData[] = metaRes.data?.result || [];
          allCharts.forEach(c => { metaMap[c.id] = c; });
          setChartMeta(metaMap);
        } catch { /* continue */ }

        const dMap = await getChartData(chartIds, metaMap);
        setChartData(dMap);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const getChartData = useCallback(async (chartIds: number[], metaMap: Record<number, ChartData>) => {
    const dataPromises = chartIds.map(async cid => {
      try {
        const d = await api.get(`/chart/${cid}/data/`);
        const result = d.data?.result;
        return { id: cid, data: Array.isArray(result) ? (result[0] || {}) : (result || {}) };
      } catch {
        const chart = metaMap[cid];
        if (!chart) return { id: cid, data: {} };
        try {
          const fd = typeof chart.form_data === 'string' ? JSON.parse(chart.form_data) : chart.form_data;
          let dsId = chart.datasource_id;
          let datasourceType = chart.datasource_type || 'table';
          if (fd?.datasource) {
            if (typeof fd.datasource === 'string') { const parts = fd.datasource.split('__'); dsId = Number(parts[0]) || dsId; datasourceType = parts[1] || datasourceType; }
            else if (typeof fd.datasource === 'object' && fd.datasource !== null) { dsId = (fd.datasource as { id?: number }).id ?? dsId; datasourceType = (fd.datasource as { type?: string }).type || datasourceType; }
          }
          if (!dsId) return { id: cid, data: {} };
          const query: Record<string, unknown> = { result_type: 'full' };
          if (fd?.granularity_sqla) query.granularity = fd.granularity_sqla;
          if (fd?.time_range) query.time_range = fd.time_range;
          const metricFields = fd?.metrics || (fd?.metric ? [fd.metric] : undefined)
            || (typeof fd?.x === 'string' ? [fd.x] : undefined) || (typeof fd?.y === 'string' ? [fd.y] : undefined)
            || (typeof fd?.size === 'string' ? [fd.size] : undefined) || (typeof fd?.series === 'string' ? [fd.series] : undefined);
          if (Array.isArray(metricFields) && metricFields.length > 0) query.metrics = metricFields;
          const groupby = fd?.groupby || fd?.columns;
          if (Array.isArray(groupby) && groupby.length > 0) query.groupby = groupby;
          const postRes = await api.post('/chart/data', { datasource: { id: dsId, type: datasourceType }, queries: [query] });
          const postResult = postRes.data?.result;
          return { id: cid, data: Array.isArray(postResult) ? (postResult[0] || {}) : (postResult || {}) };
        } catch { return { id: cid, data: {} }; }
      }
    });
    const results = await Promise.all(dataPromises);
    const dataMap: Record<number, Record<string, unknown>> = {};
    results.forEach(r => { dataMap[r.id] = r.data; });
    return dataMap;
  }, []);

  const refreshChart = useCallback(async (chartId: number) => {
    try {
      const d = await api.get(`/chart/${chartId}/data/`);
      const result = d.data?.result;
      setChartData(prev => ({ ...prev, [chartId]: Array.isArray(result) ? (result[0] || {}) : (result || {}) }));
    } catch {
      const chart = chartMeta[chartId];
      if (!chart) return;
      try {
        const fd = typeof chart.form_data === 'string' ? JSON.parse(chart.form_data) : chart.form_data;
        let dsId = chart.datasource_id; let datasourceType = chart.datasource_type || 'table';
        if (fd?.datasource) {
          if (typeof fd.datasource === 'string') { const parts = fd.datasource.split('__'); dsId = Number(parts[0]) || dsId; datasourceType = parts[1] || datasourceType; }
          else if (typeof fd.datasource === 'object' && fd.datasource !== null) { dsId = (fd.datasource as { id?: number }).id ?? dsId; datasourceType = (fd.datasource as { type?: string }).type || datasourceType; }
        }
        if (dsId) {
          const query: Record<string, unknown> = { result_type: 'full' };
          if (fd?.granularity_sqla) query.granularity = fd.granularity_sqla;
          if (fd?.time_range) query.time_range = fd.time_range;
          const mf = fd?.metrics || (fd?.metric ? [fd.metric] : undefined)
            || (typeof fd?.x === 'string' ? [fd.x] : undefined) || (typeof fd?.y === 'string' ? [fd.y] : undefined)
            || (typeof fd?.size === 'string' ? [fd.size] : undefined) || (typeof fd?.series === 'string' ? [fd.series] : undefined);
          if (Array.isArray(mf) && mf.length > 0) query.metrics = mf;
          const gb = fd?.groupby || fd?.columns;
          if (Array.isArray(gb) && gb.length > 0) query.groupby = gb;
          const postRes = await api.post('/chart/data', { datasource: { id: dsId, type: datasourceType }, queries: [query] });
          const postResult = postRes.data?.result;
          setChartData(prev => ({ ...prev, [chartId]: Array.isArray(postResult) ? (postResult[0] || {}) : (postResult || {}) }));
        }
      } catch { /* fallback failed */ }
    }
  }, [chartMeta]);

  const handleLayoutChange = useCallback((newLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    setNodeMap(prev => {
      const updated = { ...prev };
      for (const item of newLayout) {
        if (updated[item.i]?.meta) {
          updated[item.i] = { ...updated[item.i], meta: { ...updated[item.i].meta, width: item.w, height: Math.round(item.h * 60 / 8) } };
        }
      }
      return updated;
    });
  }, []);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;
  }
  if (!dashboard) return null;

  return (
    <Box sx={{ p: 0 }}>
      {layoutItems.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Typography color="text.secondary">No charts in this dashboard yet</Typography>
        </Box>
      ) : (
        <Box ref={containerRef} sx={{ width: '100%', position: 'relative', minHeight: 400 }}>
          <GridLayout
              key={containerWidth}
              width={containerWidth}
              layout={gridLayout}
              gridConfig={{ cols: 12, rowHeight: 60, margin: [8, 8] }}
              onLayoutChange={handleLayoutChange}
              onDragStart={() => setIsDragging(true)}
              onDragStop={() => setIsDragging(false)}
              onResizeStart={() => setIsDragging(true)}
              onResizeStop={() => setIsDragging(false)}
              dragConfig={{ enabled: true, handle: '.drag-handle' }}
              resizeConfig={{ enabled: true, handles: ['se'] }}
              autoSize
            >
              {layoutItems.map(item => {
                const chartId = item.chartId;
                const meta = chartMeta[chartId];
                const data = chartData[chartId];
                const vizType = meta?.viz_type || 'bar';
                const option = data ? buildEChartsOption(vizType, data) : null;

                function getBigNumber(chartData: Record<string, unknown> | undefined): string {
                  const rows = Array.isArray(chartData?.data) ? (chartData.data as Record<string, unknown>[]) : [];
                  if (rows.length === 0) return '—';
                  const keys = Object.keys(rows[0]);
                  for (const key of keys) {
                    const val = rows[0][key];
                    if (typeof val === 'number') return Number(val).toLocaleString();
                    const num = Number(val);
                    if (!isNaN(num)) return num.toLocaleString();
                  }
                  return '—';
                }

                const colW = (containerWidth - 8 * 11) / 12;
                const itemPixelW = colW * item.w + 8 * (item.w - 1);
                const isSmall = itemPixelW < 300;

                return (
                  <Card
                    key={item.i}
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
                        {meta?.slice_name || item.sliceName || `Chart #${chartId}`}
                      </Typography>
                      <IconButton size="small" onClick={(e: React.MouseEvent) => { e.stopPropagation(); refreshChart(chartId); }} sx={{ p: 0.5 }}>
                        <RefreshIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      <Tooltip title="Open in Explore">
                        <IconButton size="small" onClick={(e: React.MouseEvent) => { e.stopPropagation(); navigate(`/explore?slice_id=${chartId}`); }} sx={{ p: 0.5 }}>
                          <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <CardContent sx={{ flex: 1, p: 1, '&:last-child': { pb: 1 }, display: 'flex', minHeight: 0 }}>
                      {isSmall ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                          <Typography variant="h3" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2rem' }, lineHeight: 1.2, textAlign: 'center' }}>
                            {getBigNumber(data)}
                          </Typography>
                        </Box>
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
                          <Typography variant="caption" color="primary" onClick={() => navigate(`/explore?slice_id=${chartId}`)} sx={{ cursor: 'pointer', textDecoration: 'underline' }}>
                            Open in Explore
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </GridLayout>
        </Box>
      )}
    </Box>
  );
}
