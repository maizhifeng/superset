import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
import MenuIcon from '@mui/icons-material/Menu';

import { GridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useBreadcrumbStore } from '@/store/breadcrumbStore';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import ChartEditor from '@/pages/ChartCreation/ChartEditor';
import ChartCard from '@/pages/Dashboard/ChartCard';
import ChatInput from '@/components/ChatInput';
import api from '@/api';
import {
  DashboardFilterDrawer,
  FilterToolbarButton,
  useDashboardFilters,
} from '@/components/DashboardFilter';
import type { AdhocFilter } from '@/components/DashboardFilter/types';

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

  function flattenLayout(nodeMap: Record<string, LayoutNode>, gridId: string): ChartLayoutItem[] {
  const items: ChartLayoutItem[] = [];
  function processNode(nodeId: string, parentWidth: number, offsetX: number, offsetY: number) {
    const node = nodeMap[nodeId];
    if (!node) return { height: 0 };
    if (node.type === 'CHART') {
      const w = (node.meta?.width as number) || 4;
      const h = Math.max(Math.round(((node.meta?.height as number) || 30) * 8 / 60), 3);
      const savedX = node.meta?.x as number | undefined;
      const savedY = node.meta?.y as number | undefined;
      items.push({
        i: node.id,
        x: savedX ?? offsetX,
        y: savedY ?? offsetY,
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
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [nodeMap, setNodeMap] = useState<Record<string, LayoutNode>>({});
  const [gridId, setGridId] = useState<string | null>(null);
  const [chartData, setChartData] = useState<Record<number, Record<string, unknown>>>({});
  const [chartMeta, setChartMeta] = useState<Record<number, ChartData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const setCustom = useBreadcrumbStore(s => s.setCustom);
  const registerTools = useToolbarStore(s => s.registerTools);
  const unregisterTools = useToolbarStore(s => s.unregisterTools);
  const prevTitleRef = useRef<string | null>(null);
  const pageKey = `dashboard_${id}`;

  const [searchParams, setSearchParams] = useSearchParams();
  const editingSliceId = searchParams.get('slice_id');
  const isDrawerOpen = Boolean(editingSliceId);

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const { filters, filterState, setFilter, clearAll, buildAdhocFilters, activeCount } =
    useDashboardFilters(dashboard?.json_metadata ?? null, Object.values(chartMeta));
  const extraFiltersRef = useRef<AdhocFilter[]>([]);
  extraFiltersRef.current = buildAdhocFilters();

  const hiddenFilters = useMemo(() => filters.slice(8), [filters]);
  const [pendingFilterIds, setPendingFilterIds] = useState<string[]>([]);

  const nodeMapRef = useRef(nodeMap);
  nodeMapRef.current = nodeMap;
  const fullPositionRef = useRef<Record<string, unknown>>({});
  const isSavingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const saveLayoutRef = useRef<() => Promise<void>>();

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
    layoutItems.map(item => ({
      i: item.i,
      x: containerWidth < 600 ? 0 : item.x,
      y: item.y,
      w: containerWidth < 600 ? 12 : item.w,
      h: item.h,
    })),
  [layoutItems, containerWidth]);

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
      }

      let parsedNodes: Record<string, LayoutNode> = {};
      let root: LayoutNode | null = null;
      try {
        const posData = JSON.parse(dash.position_json || '{}');
        fullPositionRef.current = posData;
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

        const dMap = await getChartDataWithFilters(chartIds, metaMap);
        setChartData(dMap);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!dashboard) return;
    setCustom({ label: dashboard.dashboard_title, status: dashboard.published ? 'published' : 'draft' });
    registerTools(pageKey, [
      {
        id: 'search',
        priority: 0,
        showOnMobile: false,
        render: <ChatInput />,
      },
      {
        id: 'filter',
        priority: 10,
        showOnMobile: true,
        fabIcon: <FilterListIcon />,
        fabLabel: 'Filter',
        action: () => setFilterDrawerOpen(prev => !prev),
        render: (
          <FilterToolbarButton
            activeCount={activeCount}
            hiddenFilters={hiddenFilters}
            onOpenDrawer={() => setFilterDrawerOpen(prev => !prev)}
            onClearAll={() => clearAll()}
            onAddFilter={(id: string) => { setPendingFilterIds(prev => [...prev, id]); setFilterDrawerOpen(true); }}
          />
        ),
      },
      {
        id: 'refresh',
        priority: 20,
        showOnMobile: false,
        fabIcon: <RefreshIcon />,
        fabLabel: 'Refresh',
        action: refreshAllCharts,
        render: (
          <Button
            onClick={refreshAllCharts}
            startIcon={<RefreshIcon sx={{ fontSize: 22 }} />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.9375rem',
              color: 'text.secondary',
              px: 0.5,
              py: 0,
              minWidth: 0,
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            Refresh
          </Button>
        ),
      },
      ...(layoutItems.length > 1 ? [{
        id: 'nav',
        priority: 25,
        showOnMobile: true,
        fabIcon: <MenuIcon />,
        fabLabel: 'Jump to chart',
        render: null,
      }] : []),
    ]);
    return () => unregisterTools(pageKey);
  }, [dashboard, activeCount, hiddenFilters, clearAll, pageKey, layoutItems.length]);

  function buildQueryFromChart(fd: Record<string, unknown> | null): Record<string, unknown> {
    fd = fd || {};
    const query: Record<string, unknown> = { result_type: 'full' };
    if (fd?.granularity_sqla) query.granularity = fd.granularity_sqla;
    if (fd?.time_range) query.time_range = fd.time_range;
    const metricFields = fd?.metrics || (fd?.metric ? [fd.metric] : undefined)
      || (typeof fd?.x === 'string' ? [fd.x] : undefined) || (typeof fd?.y === 'string' ? [fd.y] : undefined)
      || (typeof fd?.size === 'string' ? [fd.size] : undefined) || (typeof fd?.series === 'string' ? [fd.series] : undefined);
    if (Array.isArray(metricFields) && metricFields.length > 0) query.metrics = metricFields;
    const groupby = fd?.groupby || fd?.columns;
    if (Array.isArray(groupby) && groupby.length > 0) query.groupby = groupby;
    const extra = extraFiltersRef.current;
    if (extra.length > 0) {
      query.adhoc_filters = extra;
    }
    return query;
  }

  function parseChartConfig(chart: ChartData): Record<string, unknown> {
    const raw = chart.form_data || (chart as any).params || '{}';
    const fd = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return fd;
  }

  const getChartDataWithFilters = useCallback(async (chartIds: number[], metaMap: Record<number, ChartData>) => {
    const dataPromises = chartIds.map(async cid => {
      const chart = metaMap[cid];
      if (!chart) return { id: cid, data: {} };
      try {
        const fd = parseChartConfig(chart);
        let dsId = chart.datasource_id;
        let datasourceType = chart.datasource_type || 'table';
        if (fd?.datasource) {
          if (typeof fd.datasource === 'string') { const parts = fd.datasource.split('__'); dsId = Number(parts[0]) || dsId; datasourceType = parts[1] || datasourceType; }
          else if (typeof fd.datasource === 'object' && fd.datasource !== null) { dsId = (fd.datasource as { id?: number }).id ?? dsId; datasourceType = (fd.datasource as { type?: string }).type || datasourceType; }
        }
        if (!dsId) return { id: cid, data: {} };
        const query = buildQueryFromChart(fd);
        const postRes = await api.post('/chart/data', { datasource: { id: dsId, type: datasourceType }, queries: [query] });
        const postResult = postRes.data?.result;
        return { id: cid, data: Array.isArray(postResult) ? (postResult[0] || {}) : (postResult || {}) };
      } catch { return { id: cid, data: {} }; }
    });
    const results = await Promise.all(dataPromises);
    const dataMap: Record<number, Record<string, unknown>> = {};
    results.forEach(r => { dataMap[r.id] = r.data; });
    return dataMap;
  }, []);

  const refreshChart = useCallback(async (chartId: number) => {
    const chart = chartMeta[chartId];
    if (!chart) return;
    try {
      const fd = parseChartConfig(chart);
      let dsId = chart.datasource_id;
      let datasourceType = chart.datasource_type || 'table';
      if (fd?.datasource) {
        if (typeof fd.datasource === 'string') { const parts = fd.datasource.split('__'); dsId = Number(parts[0]) || dsId; datasourceType = parts[1] || datasourceType; }
        else if (typeof fd.datasource === 'object' && fd.datasource !== null) { dsId = (fd.datasource as { id?: number }).id ?? dsId; datasourceType = (fd.datasource as { type?: string }).type || datasourceType; }
      }
      if (dsId) {
        const query = buildQueryFromChart(fd);
        const postRes = await api.post('/chart/data', { datasource: { id: dsId, type: datasourceType }, queries: [query] });
        const postResult = postRes.data?.result;
        setChartData(prev => ({ ...prev, [chartId]: Array.isArray(postResult) ? (postResult[0] || {}) : (postResult || {}) }));
      }
    } catch { /* refresh failed */ }
  }, [chartMeta]);

  const refreshAllCharts = useCallback(async () => {
    const ids = Object.keys(chartMeta).map(Number);
    if (ids.length === 0) return;
    const newData = await getChartDataWithFilters(ids, chartMeta);
    setChartData(newData);
  }, [chartMeta]);

  const handleChartSaved = useCallback(async (chartId: number) => {
    setSearchParams(prev => { prev.delete('slice_id'); return prev; });
    try {
      const metaRes = await api.get(`/chart/${chartId}`);
      const chart = metaRes.data?.result as ChartData | undefined;
      if (chart) {
        const newMeta = { ...chartMeta, [chartId]: chart };
        setChartMeta(newMeta);
        const newData = await getChartDataWithFilters([chartId], newMeta);
        setChartData(prev => ({ ...prev, ...newData }));
      }
    } catch { /* refresh failed */ }
  }, [setSearchParams, chartMeta]);

  const saveLayout = useCallback(async () => {
    if (!id || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaving(true);
    try {
      const updatedPosition = { ...fullPositionRef.current };
      for (const [key, node] of Object.entries(nodeMapRef.current)) {
        if (node.type) {
          updatedPosition[key] = node;
        }
      }
      await api.put(`/dashboard/${id}`, {
        position_json: JSON.stringify(updatedPosition),
      });
      fullPositionRef.current = updatedPosition;
    } catch {
      // layout save failure should not disrupt UX
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }, [id]);
  saveLayoutRef.current = saveLayout;

  const handleCloseDrawer = useCallback(() => {
    setSearchParams(prev => { prev.delete('slice_id'); return prev; });
  }, [setSearchParams]);

  const filterTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleFilterChange = useCallback((id: string, value: unknown) => {
    setFilter(id, value);
    clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(refreshAllCharts, 300);
  }, [setFilter, refreshAllCharts]);

  const handleClearAll = useCallback(() => {
    clearAll();
    clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(refreshAllCharts, 300);
  }, [clearAll, refreshAllCharts]);

  const handleFilterDrawerClose = useCallback(() => {
    setFilterDrawerOpen(false);
  }, []);

  const handleFilterDrawerOpen = useCallback(() => {
    setFilterDrawerOpen(true);
  }, []);

  useEffect(() => {
    if (!filterDrawerOpen) setPendingFilterIds([]);
  }, [filterDrawerOpen]);

  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLayoutChange = useCallback((newLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    if (containerWidth < 600) return;
    const updated = { ...nodeMapRef.current };
    for (const item of newLayout) {
      if (updated[item.i]?.meta) {
        updated[item.i] = {
          ...updated[item.i],
          meta: {
            ...updated[item.i].meta,
            width: item.w,
            height: Math.round(item.h * 60 / 8),
            x: item.x,
            y: item.y,
          },
        };
      }
    }
    nodeMapRef.current = updated;
    setNodeMap(updated);
    // Debounced save — react-grid-layout calls onLayoutChange BEFORE onDragStop
    if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
    layoutSaveTimerRef.current = setTimeout(() => { saveLayoutRef.current?.(); }, 300);
  }, [containerWidth]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;
  }
  if (!dashboard) return null;

  return (
    <><DashboardFilterDrawer
        open={filterDrawerOpen}
        onClose={handleFilterDrawerClose}
        onOpen={handleFilterDrawerOpen}
        filters={filters}
        filterState={filterState}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAll}
        pendingFilterIds={pendingFilterIds}
      />
      <Box sx={{ p: 0 }}>
      {layoutItems.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Typography color="text.secondary">No charts in this dashboard yet</Typography>
        </Box>
      ) : (
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
              {layoutItems.map(item => (
                <div key={item.i} data-chart-index={item.chartId}>                  <ChartCard
                    chartId={item.chartId}
                    sliceName={item.sliceName}
                    vizType={chartMeta[item.chartId]?.viz_type || 'bar'}
                    data={chartData[item.chartId]}
                    meta={chartMeta[item.chartId]}
                    isDragging={isDragging}
                    containerWidth={containerWidth}
                    onRefresh={refreshChart}
                    onEdit={(chartId: number) => {
                      setSearchParams({ slice_id: String(chartId) });
                    }}
                  />
                </div>
              ))}
            </GridLayout>
        </Box>
      )}
    </Box>
      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={handleCloseDrawer}
        slotProps={{
          paper: { sx: { width: { xs: '100vw', md: '30vw' }, top: { xs: 0, sm: 48 }, height: { xs: '100vh', sm: 'calc(100vh - 48px)' } } },
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {isDrawerOpen && (
            <ChartEditor
              compact
              onChartSaved={handleChartSaved}
              initialData={editingSliceId ? chartMeta[Number(editingSliceId)] : null}
            />
          )}
        </Box>
      </Drawer>
    </>
  );
}
