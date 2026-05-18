import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { produce } from "immer";
import { useParams, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Drawer from "@mui/material/Drawer";

import type { DashboardData, ChartData } from "@/types/api";
import PageSpeedDial from "@/components/PageSpeedDial";
import ChartEditor from "@/pages/ChartCreation/ChartEditor";
import ChatInput from "@/components/ChatInput";
import DashboardGrid from "@/pages/Dashboard/DashboardGrid";
import DashboardNav from "@/pages/Dashboard/DashboardNav";
import useDashboardToolbar from "@/pages/Dashboard/useDashboardToolbar";
import UndoRedoKeyListeners from "@/dashboard/components/UndoRedoKeyListeners";
import api from "@/api";
import {
  DashboardFilterDrawer,
  useDashboardFilters,
} from "@/components/DashboardFilter";
import type { AdhocFilter } from "@/components/DashboardFilter/types";
import { buildQueryObject } from "@/utils/query/extractQueryFields";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

import { type LayoutNode, flattenLayout } from "@/utils/dashboard/layout";
import CompareConfigModal from "@/pages/Dashboard/CompareConfigModal";
import AddChartDialog from "@/pages/Dashboard/AddChartDialog";
import type {
  CompareConfig,
  CompareDimension,
} from "@/pages/Dashboard/ChartCard";
import type { ColumnOption } from "@/pages/Dashboard/CompareConfigModal";

export default function Dashboard() {
  const { id } = useParams<{ id: string }>();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [nodeMap, setNodeMap] = useState<Record<string, LayoutNode>>({});
  const [gridId, setGridId] = useState<string | null>(null);
  const [chartData, setChartData] = useState<
    Record<number, Record<string, unknown>>
  >({});
  const [chartMeta, setChartMeta] = useState<Record<number, ChartData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const prevTitleRef = useRef<string | null>(null);

  const [compareConfig, setCompareConfig] = useState<CompareConfig | null>(
    null,
  );
  const [mirrorData, setMirrorData] = useState<Record<string, unknown>>({});
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareChartId, setCompareChartId] = useState<number | null>(null);
  const [addChartDialogOpen, setAddChartDialogOpen] = useState(false);
  const [datasetCompareColumns, setDatasetCompareColumns] = useState<
    ColumnOption[]
  >([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const editingSliceId = searchParams.get("slice_id");
  const isDrawerOpen = Boolean(editingSliceId);
  useEffect(() => {
    document.body.classList.toggle("sidebar-open", isDrawerOpen);
    return () => document.body.classList.remove("sidebar-open");
  }, [isDrawerOpen]);

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [dashboardDimensions, setDashboardDimensions] = useState<
    {
      datasetId: number;
      column: string;
      name: string;
      columnType?: "time" | "string" | "numeric";
    }[]
  >([]);

  const dashboardChartIds = useMemo(() => {
    const ids = new Set<number>();
    for (const node of Object.values(nodeMap)) {
      if (node.type === "CHART" && node.meta?.chartId) {
        ids.add(Number(node.meta.chartId));
      }
    }
    return ids;
  }, [nodeMap]);

  useEffect(() => {
    const chartIds = Object.values(chartMeta).filter((c) =>
      dashboardChartIds.has(c.id),
    );
    const dsIds = new Set(
      chartIds
        .map((c) => c.datasource_id)
        .filter((id): id is number => id != null),
    );
    if (dsIds.size === 0) {
      setDashboardDimensions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const timeCols: {
        datasetId: number;
        column: string;
        name: string;
        columnType: "time";
      }[] = [];
      const stringCols: {
        datasetId: number;
        column: string;
        name: string;
        columnType: "string";
      }[] = [];
      const seen = new Set<string>();
      const timeTypes = /time|date|timestamp|year|month|quarter|week/i;
      const stringTypes = /varchar|char|text|string/i;
      for (const dsId of dsIds) {
        try {
          const res = await api.get<{
            result: { columns: { column_name: string; type: string | null }[] };
          }>(`/dataset/${dsId}`);
          const cols = res.data.result.columns ?? [];
          for (const col of cols) {
            if (!col.column_name || !col.type) continue;
            if (!timeTypes.test(col.type) && !stringTypes.test(col.type))
              continue;
            const key = `${dsId}:${col.column_name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (timeTypes.test(col.type))
              timeCols.push({
                datasetId: dsId,
                column: col.column_name,
                name: col.column_name,
                columnType: "time",
              });
            else
              stringCols.push({
                datasetId: dsId,
                column: col.column_name,
                name: col.column_name,
                columnType: "string",
              });
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setDashboardDimensions([...timeCols, ...stringCols]);
    })();
    return () => {
      cancelled = true;
    };
  }, [chartMeta, dashboardChartIds]);

  const {
    filters,
    filterState,
    setFilter,
    clearAll,
    buildAdhocFilters,
    activeCount,
  } = useDashboardFilters(
    dashboard?.json_metadata ?? null,
    dashboardDimensions,
  );
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
    const observer = new ResizeObserver(handler);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const supportedVizTypes = useMemo(
    () =>
      new Set([
        "line",
        "bar",
        "pie",
        "table",
        "big_number",
        "echarts_timeseries_line",
      ]),
    [],
  );

  const layoutItems = useMemo(() => {
    if (!gridId || Object.keys(nodeMap).length === 0) return [];
    const items = flattenLayout(nodeMap, gridId);
    return items.filter((item) => {
      const vt = chartMeta[item.chartId]?.viz_type;
      return vt && supportedVizTypes.has(vt);
    });
  }, [nodeMap, gridId, chartMeta, supportedVizTypes]);

  const gridLayout = useMemo(
    () =>
      layoutItems.map((item) => ({
        i: item.i,
        x: containerWidth < 600 ? 0 : item.x,
        y: item.y,
        w: containerWidth < 600 ? 12 : item.w,
        h: item.h,
      })),
    [layoutItems, containerWidth],
  );

  const loadDashboard = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get<{ result: DashboardData }>(`/dashboard/${id}`);
      const dash = res.data.result;
      setDashboard(dash);
      if (prevTitleRef.current !== dash.dashboard_title) {
        prevTitleRef.current = dash.dashboard_title;
      }

      let parsedNodes: Record<string, LayoutNode> = {};
      let root: LayoutNode | null = null;
      try {
        const posData = JSON.parse(dash.position_json || "{}");
        fullPositionRef.current = posData;
        for (const [key, val] of Object.entries(posData)) {
          if (
            typeof val === "object" &&
            val !== null &&
            (val as LayoutNode).type
          ) {
            parsedNodes[key] = val as LayoutNode;
            if ((val as LayoutNode).type === "ROOT") root = val as LayoutNode;
          }
        }
      } catch {
        /* empty */
      }

      const gId = root?.children?.[0] || null;
      setGridId(gId);
      setNodeMap(parsedNodes);

      const chartIds = Object.values(parsedNodes)
        .filter((n) => n.type === "CHART")
        .map((n) => n.meta?.chartId as number)
        .filter(Boolean);

      let metaMap: Record<number, ChartData> = {};
      if (chartIds.length > 0) {
        try {
          const metaRes = await api.get<{ result: ChartData[] }>(
            "/chart/?q=(page_size:200,page:0)",
          );
          const allCharts = metaRes.data?.result || [];
          allCharts.forEach((c) => {
            metaMap[c.id] = c;
          });
          setChartMeta(metaMap);
        } catch {
          /* continue */
        }

        const dMap = await getChartDataWithFilters(chartIds, metaMap);
        setChartData(dMap);
      }
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!compareModalOpen || compareChartId == null) {
      setDatasetCompareColumns([]);
      return;
    }
    const dsId = chartMeta[compareChartId]?.datasource_id;
    if (!dsId) {
      setDatasetCompareColumns([]);
      return;
    }
    const numericTypes =
      /^int\d*$|^bigint$|^smallint$|^tinyint$|^numeric$|^decimal$|^float$|^double$|^real$|^money$/i;
    const timeTypes = /time|date|timestamp|year|month|quarter|week/i;
    const idPattern = /_?id$/i;
    api
      .get<{
        result: { columns: { column_name: string; type: string | null }[] };
      }>(`/dataset/${dsId}`)
      .then((res) => {
        setDatasetCompareColumns(
          (res.data.result.columns ?? [])
            .filter((c) => {
              if (!c.column_name || !c.type) return true;
              if (timeTypes.test(c.type) || timeTypes.test(c.column_name))
                return true;
              if (idPattern.test(c.column_name)) return true;
              return !numericTypes.test(c.type);
            })
            .map((c) => ({
              datasetId: dsId,
              column: c.column_name,
              name: c.column_name,
            })),
        );
      })
      .catch(() => setDatasetCompareColumns([]));
  }, [compareModalOpen, compareChartId, chartMeta]);

  const [navOpen, setNavOpen] = useState(false);
  const [navItems, setNavItems] = useState<{ id: number; name: string }[]>([]);

  const openNav = () => {
    const cards = document.querySelectorAll("[data-chart-index]");
    const items = Array.from(cards).map((el) => ({
      id: Number(el.getAttribute("data-chart-index")),
      name:
        el
          .querySelector(".drag-handle .MuiTypography-root")
          ?.textContent?.trim() ||
        `Chart #${el.getAttribute("data-chart-index")}`,
    }));
    setNavItems(items);
    setNavOpen(true);
  };

  function parseChartConfig(chart: ChartData): Record<string, unknown> {
    const raw = chart.params || chart.form_data || "{}";
    const fd = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      ...fd,
      datasource:
        fd.datasource ||
        `${chart.datasource_id}__${chart.datasource_type || "table"}`,
    };
  }

  const getChartDataWithFilters = useCallback(
    async (chartIds: number[], metaMap: Record<number, ChartData>) => {
      const dataPromises = chartIds.map(async (cid) => {
        const chart = metaMap[cid];
        if (!chart) return { id: cid, data: {} };
        try {
          const fd = parseChartConfig(chart);
          const dsId =
            chart.datasource_id ||
            (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : 0);
          if (!dsId) return { id: cid, data: {} };
          const query = buildQueryObject(fd, chart.viz_type);
          if (!query.metrics || query.metrics.length === 0)
            return { id: cid, data: {} };
          const adhocFilters = buildAdhocFilters(dsId);
          if (adhocFilters.length > 0) query.adhoc_filters = adhocFilters;
          const force =
            adhocFilters.length > 0 || chartDataRef.current[cid]?.data != null;
          const payload = {
            datasource: { id: dsId, type: chart.datasource_type || "table" },
            queries: [query],
            form_data: fd,
            result_format: "json",
            result_type: "full" as const,
            force,
          };
          const postRes = await api.post("/chart/data", payload);
          const postResult = postRes.data?.result;
          return {
            id: cid,
            data: Array.isArray(postResult)
              ? postResult[0] || {}
              : postResult || {},
          };
        } catch {
          return { id: cid, data: {} };
        }
      });
      const results = await Promise.all(dataPromises);
      const dataMap: Record<number, Record<string, unknown>> = {};
      results.forEach((r) => {
        dataMap[r.id] = r.data;
      });
      return dataMap;
    },
    [buildAdhocFilters],
  );

  const chartDataRef = useRef(chartData);
  chartDataRef.current = chartData;

  const filterDataLocal = useCallback(
    (
      data: Record<string, unknown>,
      dimensions: CompareDimension[],
    ): Record<string, unknown> => {
      if (data?.data && Array.isArray(data.data)) {
        const filtered = (data.data as Record<string, unknown>[]).filter(
          (row) =>
            dimensions.every((d) =>
              d.values.includes(String(row[d.dimension] ?? "")),
            ),
        );
        return { ...data, data: filtered };
      }
      return data;
    },
    [],
  );

  const fetchMirrorData = useCallback(
    async (
      chartId: number,
      dimensions: CompareDimension[],
      existingDataOverride?: Record<string, unknown>,
    ) => {
      const chart = chartMeta[chartId];
      if (!chart) return;
      const existing = existingDataOverride ?? chartDataRef.current[chartId];
      if (existing?.data && Array.isArray(existing.data)) {
        setMirrorData(filterDataLocal(existing, dimensions));
        return;
      }
      try {
        const fd = parseChartConfig(chart);
        const dsId =
          chart.datasource_id ||
          (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : 0);
        if (!dsId) return;
        const query = buildQueryObject(fd, chart.viz_type);
        if (!query.metrics || query.metrics.length === 0) return;
        const adhocFilters = buildAdhocFilters(dsId);
        if (adhocFilters.length > 0) query.adhoc_filters = adhocFilters;
        const force = adhocFilters.length > 0;
        const payload = {
          datasource: { id: dsId, type: chart.datasource_type || "table" },
          queries: [query],
          form_data: fd,
          result_format: "json",
          result_type: "full" as const,
          force,
        };
        const postRes = await api.post("/chart/data", payload);
        const postResult = postRes.data?.result;
        const rawData = Array.isArray(postResult)
          ? postResult[0] || {}
          : postResult || {};
        setMirrorData(filterDataLocal(rawData, dimensions));
      } catch {
        /* mirror fetch failed */
      }
    },
    [chartMeta, filterDataLocal, buildAdhocFilters],
  );

  const refreshChart = useCallback(
    async (chartId: number) => {
      const chart = chartMeta[chartId];
      if (!chart) return;
      try {
        const fd = parseChartConfig(chart);
        const dsId =
          chart.datasource_id ||
          (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : 0);
        if (!dsId) return;
        const query = buildQueryObject(fd, chart.viz_type);
        if (!query.metrics || query.metrics.length === 0) return;
        const adhocFilters = buildAdhocFilters(dsId);
        if (adhocFilters.length > 0) query.adhoc_filters = adhocFilters;
        const payload = {
          datasource: { id: dsId, type: chart.datasource_type || "table" },
          queries: [query],
          form_data: fd,
          result_format: "json",
          result_type: "full" as const,
          force: true,
        };
        const postRes = await api.post("/chart/data", payload);
        const postResult = postRes.data?.result;
        setChartData((prev) => ({
          ...prev,
          [chartId]: Array.isArray(postResult)
            ? postResult[0] || {}
            : postResult || {},
        }));
      } catch {
        /* refresh failed */
      }
    },
    [chartMeta, buildAdhocFilters],
  );

  const refreshAllCharts = useCallback(async () => {
    const ids = Object.keys(chartMeta).map(Number);
    if (ids.length === 0) return;
    const newData = await getChartDataWithFilters(ids, chartMeta);
    setChartData(newData);
    if (compareConfig?.enabled) {
      const freshData = newData[compareConfig.chartId];
      fetchMirrorData(
        compareConfig.chartId,
        compareConfig.dimensions,
        freshData,
      );
    }
  }, [chartMeta, compareConfig, fetchMirrorData, getChartDataWithFilters]);

  const pageKey = `dashboard_${id}`;
  useDashboardToolbar({
    dashboard,
    activeCount,
    hiddenFilters,
    clearAll,
    layoutItems,
    onFilterDrawerOpen: () => setFilterDrawerOpen(true),
    onAddFilter: (id: string) => setPendingFilterIds((prev) => [...prev, id]),
    onRefreshAll: refreshAllCharts,
    onOpenNav: openNav,
    onAddChart: () => setAddChartDialogOpen(true),
  });

  const handleChartSaved = useCallback(
    async (chartId: number) => {
      setSearchParams((prev) => {
        prev.delete("slice_id");
        return prev;
      });
      try {
        const metaRes = await api.get<{ result: ChartData }>(
          `/chart/${chartId}`,
        );
        const chart = metaRes.data?.result;
        if (chart) {
          const newMeta = { ...chartMeta, [chartId]: chart };
          setChartMeta(newMeta);
          const newData = await getChartDataWithFilters([chartId], newMeta);
          setChartData((prev) => ({ ...prev, ...newData }));
        }
      } catch {
        /* refresh failed */
      }
    },
    [setSearchParams, chartMeta],
  );

  const saveLayout = useCallback(async () => {
    if (!id || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaving(true);
    try {
      const updatedPosition = produce(fullPositionRef.current, (draft) => {
        for (const [key, node] of Object.entries(nodeMapRef.current)) {
          if (node.type) {
            draft[key] = node as unknown as Record<string, unknown>;
          }
        }
      }) as Record<string, { type?: string; children?: string[] }>;
      const rootKey = Object.keys(updatedPosition).find(
        (k) => updatedPosition[k]?.type === "ROOT",
      );
      if (rootKey && rootKey !== "ROOT_ID") {
        updatedPosition["ROOT_ID"] = updatedPosition[rootKey];
        delete updatedPosition[rootKey];
        const gridId = updatedPosition["ROOT_ID"]?.children?.[0];
        if (gridId && gridId !== "GRID_ID" && updatedPosition[gridId]) {
          updatedPosition["GRID_ID"] = updatedPosition[gridId];
          delete updatedPosition[gridId];
          const replaceGrid = (node: {
            type?: string;
            children?: string[];
          }) => {
            if (node.children) {
              node.children = node.children.map((c: string) =>
                c === gridId ? "GRID_ID" : c,
              );
            }
          };
          replaceGrid(updatedPosition["ROOT_ID"]!);
          replaceGrid(updatedPosition["GRID_ID"]!);
          if (nodeMapRef.current[rootKey]) {
            nodeMapRef.current["ROOT_ID"] = nodeMapRef.current[rootKey];
            delete nodeMapRef.current[rootKey];
          }
          if (nodeMapRef.current[gridId]) {
            nodeMapRef.current["GRID_ID"] = nodeMapRef.current[gridId];
            delete nodeMapRef.current[gridId];
          }
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
    setSearchParams((prev) => {
      prev.delete("slice_id");
      return prev;
    });
  }, [setSearchParams]);

  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFilterChange = useCallback(
    (id: string, value: unknown) => {
      setFilter(id, value);
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
      filterTimerRef.current = setTimeout(() => {
        refreshAllCharts();
      }, 300);
    },
    [setFilter, refreshAllCharts],
  );

  const handleClearAll = useCallback(() => {
    clearAll();
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => {
      refreshAllCharts();
    }, 300);
  }, [clearAll, refreshAllCharts]);

  const handleFilterDrawerClose = useCallback(() => {
    setFilterDrawerOpen(false);
  }, []);

  const handleFilterDrawerOpen = useCallback(() => {
    setFilterDrawerOpen(true);
  }, []);

  const handleToggleCompare = useCallback(
    (chartId: number) => {
      if (compareConfig?.enabled && compareConfig.chartId === chartId) {
        setCompareConfig(null);
        setMirrorData({});
      } else {
        setCompareChartId(chartId);
        setCompareModalOpen(true);
      }
    },
    [compareConfig],
  );

  const handleApplyCompare = useCallback(
    (dimensions: CompareDimension[]) => {
      if (compareChartId == null) return;
      const cc: CompareConfig = {
        enabled: true,
        chartId: compareChartId,
        dimensions,
      };
      setCompareConfig(cc);
      setCompareModalOpen(false);
      const existingData = chartData[compareChartId];
      fetchMirrorData(compareChartId, dimensions, existingData);
    },
    [compareChartId, fetchMirrorData, chartData],
  );

  const handleAddChartSelect = useCallback(
    async (chart: { id: number; slice_name: string; viz_type: string }) => {
      setAddChartDialogOpen(false);
      const chartKey = `CHART-${chart.id}`;
      if (nodeMapRef.current[chartKey]) return;
      const newNode: LayoutNode = {
        id: chartKey,
        type: "CHART",
        children: [],
        meta: {
          chartId: chart.id,
          width: 4,
          height: 30,
          sliceName: chart.slice_name,
        },
      };
      const gridNode = Object.values(nodeMapRef.current).find(
        (n) => n.type === "GRID",
      );
      if (!gridNode) return;
      const updatedNodeMap = { ...nodeMapRef.current, [chartKey]: newNode };
      const updatedGrid = {
        ...gridNode,
        children: [...(gridNode.children || []), chartKey],
      };
      updatedNodeMap[gridNode.id] = updatedGrid;
      nodeMapRef.current = updatedNodeMap;
      setNodeMap(updatedNodeMap);
      fullPositionRef.current = {
        ...fullPositionRef.current,
        [chartKey]: newNode,
      };
      saveLayout();
      try {
        const metaRes = await api.get<{ result: ChartData }>(
          `/chart/${chart.id}`,
        );
        const chartMetaData = metaRes.data?.result;
        if (chartMetaData) {
          setChartMeta((prev) => ({ ...prev, [chart.id]: chartMetaData }));
          const newData = await getChartDataWithFilters([chart.id], {
            [chart.id]: chartMetaData,
          });
          setChartData((prev) => ({ ...prev, ...newData }));
        }
      } catch {
        /* ignore */
      }
    },
    [saveLayout, getChartDataWithFilters],
  );

  useEffect(() => {
    if (!filterDrawerOpen) setPendingFilterIds([]);
  }, [filterDrawerOpen]);

  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLayoutChange = useCallback(
    (
      newLayout: { i: string; x: number; y: number; w: number; h: number }[],
    ) => {
      if (containerWidth < 600) return;
      const updated = produce(nodeMapRef.current, (draft) => {
        for (const item of newLayout) {
          if (draft[item.i]?.meta) {
            draft[item.i].meta = {
              ...draft[item.i].meta,
              width: item.w,
              height: Math.round((item.h * 60) / 8),
              x: item.x,
              y: item.y,
            };
          }
        }
      });
      nodeMapRef.current = updated;
      setNodeMap(updated);
      // Debounced save — react-grid-layout calls onLayoutChange BEFORE onDragStop
      if (layoutSaveTimerRef.current) clearTimeout(layoutSaveTimerRef.current);
      layoutSaveTimerRef.current = setTimeout(() => {
        saveLayoutRef.current?.();
      }, 300);
    },
    [containerWidth],
  );

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  if (!dashboard) return null;

  return (
    <>
      <DashboardFilterDrawer
        open={filterDrawerOpen}
        onClose={handleFilterDrawerClose}
        onOpen={handleFilterDrawerOpen}
        filters={filters}
        filterState={filterState}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAll}
        pendingFilterIds={pendingFilterIds}
      />
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 0 }}>
        <DashboardGrid
          containerWidth={containerWidth}
          gridLayout={gridLayout}
          layoutItems={layoutItems}
          chartMeta={chartMeta}
          chartData={chartData}
          isDragging={isDragging}
          saving={saving}
          containerRef={containerRef}
          onLayoutChange={handleLayoutChange}
          onDragStart={() => setIsDragging(true)}
          onDragStop={() => setIsDragging(false)}
          onResizeStart={() => setIsDragging(true)}
          onResizeStop={() => setIsDragging(false)}
          onRefresh={refreshChart}
          onEdit={(chartId: number) =>
            setSearchParams({ slice_id: String(chartId) })
          }
          compareConfig={compareConfig}
          mirrorData={mirrorData}
          onToggleCompare={handleToggleCompare}
        />
      </Box>
      <CompareConfigModal
        open={compareModalOpen}
        columns={datasetCompareColumns}
        fullData={
          compareChartId != null ? chartData[compareChartId] : undefined
        }
        onApply={handleApplyCompare}
        onCancel={() => {
          setCompareModalOpen(false);
          setCompareChartId(null);
        }}
      />
      <AddChartDialog
        open={addChartDialogOpen}
        excludeIds={dashboardChartIds}
        onSelect={handleAddChartSelect}
        onClose={() => setAddChartDialogOpen(false)}
      />
      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={handleCloseDrawer}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100vw", md: "30vw" },
              top: 0,
              height: "100vh",
              borderRight: "none",
              borderTopLeftRadius: 12,
              borderBottomLeftRadius: 12,
            },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {isDrawerOpen && (
            <ChartEditor
              compact
              onChartSaved={handleChartSaved}
              initialData={
                editingSliceId ? chartMeta[Number(editingSliceId)] : null
              }
            />
          )}
        </Box>
      </Drawer>
      <UndoRedoKeyListeners
        onUndo={() => {}}
        onRedo={() => {}}
        onSave={saveLayout}
        onToggleFullScreen={() => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
        }}
      />
      <PageSpeedDial
        pageKeys={[pageKey, ...(isDrawerOpen ? ["chart_editor"] : [])]}
        searchTool={{ render: <ChatInput /> }}
      />
      <DashboardNav
        open={navOpen}
        items={navItems}
        onClose={() => setNavOpen(false)}
      />
    </>
  );
}
