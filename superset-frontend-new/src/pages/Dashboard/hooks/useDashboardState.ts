import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type {
  DashboardData,
  ChartData,
  DashboardFilterValue,
  DashboardPosition,
} from "@/types/api";
import api, { getDataset, getMetricFormatMap } from "@/api";
import {
  refreshFilterValues,
  useDashboardFilters,
} from "@/components/DashboardFilter";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { type LayoutNode, flattenLayout } from "@/utils/dashboard/layout";
import { useDrawerStore } from "@/store/drawerState";
import { PRESET_INTERVALS } from "@/pages/Dashboard/constants";
import { useNotificationStore } from "@/store/notificationStore";
import { useDashboardData } from "@/pages/Dashboard/hooks/useDashboardData";
import { useDashboardCompare } from "@/pages/Dashboard/hooks/useDashboardCompare";
import { useDashboardLayout } from "@/pages/Dashboard/hooks/useDashboardLayout";
import useDashboardToolbar from "@/pages/Dashboard/useDashboardToolbar";

export function useDashboardState() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const notify = useNotificationStore((s) => s.notify);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [nodeMap, setNodeMap] = useState<Record<string, LayoutNode>>({});
  const [gridId, setGridId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const prevTitleRef = useRef<string | null>(null);

  const [addChartDialogOpen, setAddChartDialogOpen] = useState(false);

  const {
    chartMeta,
    chartData,
    totalRows,
    setChartMeta,
    setChartData,
    setTotalRows,
    buildAdhocFiltersRef,
    getChartDataWithFilters,
    refreshChart: refreshChartData,
  } = useDashboardData();

  const chartDataRef = useRef(chartData);
  chartDataRef.current = chartData;

  const compare = useDashboardCompare({
    chartMeta,
    chartData,
    chartDataRef,
    buildAdhocFiltersRef,
  });
  const compareConfigRef = useRef(compare.compareConfig);
  compareConfigRef.current = compare.compareConfig;
  const fetchMirrorRef = useRef(compare.fetchMirrorData);
  fetchMirrorRef.current = compare.fetchMirrorData;

  const [chartPages, setChartPages] = useState<Record<number, number>>({});
  const [chartHasMore, setChartHasMore] = useState<Record<number, boolean>>({});
  const [chartLoading, setChartLoading] = useState<Record<number, boolean>>({});
  const [metricFormatMaps, setMetricFormatMaps] = useState<
    Record<number, Record<string, string>>
  >({});
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [dashboardDimensions, setDashboardDimensions] = useState<
    {
      datasetId: number;
      column: string;
      name: string;
      columnType?: "time" | "string" | "numeric";
    }[]
  >([]);

  const editingSliceId = searchParams.get("slice_id");
  const isDrawerOpen = Boolean(editingSliceId);

  const dashboardChartIds = useMemo(() => {
    const ids = new Set<number>();
    for (const n of Object.values(nodeMap)) {
      if (n.type === "CHART" && n.meta?.chartId)
        ids.add(Number(n.meta.chartId));
    }
    return ids;
  }, [nodeMap]);

  const layout = useDashboardLayout({
    dashboardId: id ?? "",
    nodeMap,
    chartMeta,
    onNodeMapChange: setNodeMap,
  });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

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
    return flattenLayout(nodeMap, gridId).filter((item) => {
      const vt = chartMeta[item.chartId]?.viz_type;
      return vt && supportedVizTypes.has(vt);
    });
  }, [nodeMap, gridId, chartMeta, supportedVizTypes]);

  const loadDashboard = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get<{ result: DashboardData }>(`/dashboard/${id}`);
      const dash = res.data.result;
      setDashboard(dash);
      if (prevTitleRef.current !== dash.dashboard_title)
        prevTitleRef.current = dash.dashboard_title;

      const parsedNodes: Record<string, LayoutNode> = {};
      let root: LayoutNode | null = null;
      try {
        const posData = JSON.parse(dash.position_json || "{}");
        layoutRef.current.setFullPosition(posData);
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

      const metaMap: Record<number, ChartData> = {};
      if (chartIds.length > 0) {
        const CONCURRENCY = 3;
        for (let i = 0; i < chartIds.length; i += CONCURRENCY) {
          const batch = chartIds.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map((cid) =>
              api
                .get<{ result: ChartData }>(`/chart/${cid}`)
                .then((r) => r.data.result),
            ),
          );
          results.forEach((r) => {
            if (r.status === "fulfilled" && r.value)
              metaMap[r.value.id] = r.value;
          });
        }

        const dsIds = new Set<number>();
        for (const chart of Object.values(metaMap)) {
          const dsId = chart.datasource_id || 0;
          if (dsId) dsIds.add(dsId);
        }

        if (dsIds.size > 0) {
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
          const stringTypes = /varchar|char|text|string/i;
          for (const dsId of dsIds) {
            try {
              const dataset = await getDataset<{
                columns: {
                  column_name: string;
                  type: string | null;
                  is_dttm: boolean;
                  extra: string | null;
                }[];
              }>(dsId);
              const cols = dataset.columns ?? [];
              for (const col of cols) {
                if (!col.column_name || !col.type) continue;
                const key = `${dsId}:${col.column_name}`;
                if (seen.has(key)) continue;
                seen.add(key);
                let extra: Record<string, unknown> | null = null;
                try {
                  extra = col.extra ? JSON.parse(col.extra) : null;
                } catch {
                  /* ignore */
                }
                if (extra?.dashboard_filter !== true) continue;
                if (col.is_dttm)
                  timeCols.push({
                    datasetId: dsId,
                    column: col.column_name,
                    name: col.column_name,
                    columnType: "time",
                  });
                else if (stringTypes.test(col.type))
                  stringCols.push({
                    datasetId: dsId,
                    column: col.column_name,
                    name: col.column_name,
                    columnType: "string",
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
          setDashboardDimensions([...timeCols, ...stringCols]);
        }
        setChartMeta(metaMap);
        const fmtMaps: Record<number, Record<string, string>> = {};
        for (const dsId of dsIds) {
          try {
            fmtMaps[dsId] = await getMetricFormatMap(dsId);
          } catch {
            /* ignore */
          }
        }
        setMetricFormatMaps(fmtMaps);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const { dataMap, totalRowMap } = await getChartDataWithFilters(
          chartIds,
          metaMap,
          buildAdhocFiltersRef.current,
          false,
        );
        setChartData(dataMap);
        setTotalRows(totalRowMap);
      }
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "加载仪表板失败"));
    } finally {
      setLoading(false);
    }
  }, [
    id,
    getChartDataWithFilters,
    buildAdhocFiltersRef,
    setChartData,
    setChartMeta,
    setTotalRows,
  ]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-open", isDrawerOpen);
    return () => document.body.classList.remove("sidebar-open");
  }, [isDrawerOpen]);

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

  buildAdhocFiltersRef.current = buildAdhocFilters;
  const buildDashboardAdhocFilters = buildAdhocFilters;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const hiddenFilters = useMemo(() => filters.slice(8), [filters]);
  const [pendingFilterIds, setPendingFilterIds] = useState<string[]>([]);

  const chartMetaRef = useRef(chartMeta);
  chartMetaRef.current = chartMeta;
  const refreshChartsRef = useRef<(...args: unknown[]) => void>(() => {});
  const [intervalSeconds, setIntervalSeconds] = useState(600);

  const cycleInterval = useCallback(() => {
    if (intervalSeconds === 0) {
      setIntervalSeconds(PRESET_INTERVALS[0]);
      notify({
        severity: "success",
        message: `自动刷新已切换至 ${PRESET_INTERVALS[0] >= 60 ? `${PRESET_INTERVALS[0] / 60}分钟` : `${PRESET_INTERVALS[0]}秒`}`,
      });
      return;
    }
    const idx = PRESET_INTERVALS.indexOf(intervalSeconds);
    const next =
      idx === -1 || idx === PRESET_INTERVALS.length - 1
        ? PRESET_INTERVALS[0]
        : PRESET_INTERVALS[idx + 1];
    setIntervalSeconds(next);
    notify({
      severity: "success",
      message:
        next > 0
          ? `自动刷新已切换至 ${next >= 60 ? `${next / 60}分钟` : `${next}秒`}`
          : "已关闭自动刷新",
    });
  }, [intervalSeconds, notify]);

  const refreshChart = useCallback(
    async (chartId: number, page?: number) => {
      setChartLoading((prev) => ({ ...prev, [chartId]: true }));
      try {
        const result = await refreshChartData(
          chartId,
          chartMetaRef.current,
          buildAdhocFiltersRef.current,
          page,
        );
        if (result) {
          setChartData((prev) => ({ ...prev, [chartId]: result.data }));
          if (result.hasMore !== undefined)
            setChartHasMore((prev) => ({
              ...prev,
              [chartId]: result.hasMore as boolean,
            }));
          const cc = compareConfigRef.current;
          if (cc?.enabled && cc.chartId === chartId)
            void fetchMirrorRef.current(chartId, cc.dimensions, result.data);
        }
      } finally {
        setChartLoading((prev) => ({ ...prev, [chartId]: false }));
      }
    },
    [refreshChartData, buildAdhocFiltersRef, setChartData],
  );

  const handleChartPageChange = useCallback(
    (chartId: number, newPage: number) => {
      setChartPages((prev) => ({ ...prev, [chartId]: newPage }));
      setChartLoading((prev) => ({ ...prev, [chartId]: true }));
      void refreshChart(chartId, newPage);
    },
    [refreshChart],
  );

  const refreshCharts = useCallback(
    async (chartIds?: Set<number>) => {
      refreshFilterValues();
      const meta = chartMetaRef.current;
      const ids = chartIds
        ? Array.from(chartIds)
        : Object.keys(meta).map(Number);
      if (ids.length === 0) return;
      setChartLoading((prev: Record<number, boolean>) => {
        const next: Record<number, boolean> = { ...prev };
        for (const id of ids) next[id] = true;
        return next;
      });
      setChartPages((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setChartHasMore((prev: Record<number, boolean>) =>
        Object.fromEntries(
          Object.entries(prev).filter(([k]) => !ids.includes(Number(k))),
        ),
      );
      try {
        const { dataMap, totalRowMap } = await getChartDataWithFilters(
          ids,
          meta,
          undefined,
          true,
        );
        setChartData((prev) => ({ ...prev, ...dataMap }));
        setTotalRows((prev) => ({ ...prev, ...totalRowMap }));
        const cc = compareConfigRef.current;
        if (cc?.enabled) {
          const freshData = dataMap[cc.chartId];
          void fetchMirrorRef.current(cc.chartId, cc.dimensions, freshData);
        }
      } finally {
        setChartLoading((prev) => {
          const next = { ...prev };
          for (const id of ids) next[id] = false;
          return next;
        });
      }
    },
    [getChartDataWithFilters, setChartData, setTotalRows],
  );

  refreshChartsRef.current = (...args) =>
    void refreshCharts(...(args as [Set<number>?]));

  const pageKey = `dashboard_${id}`;
  useDashboardToolbar({
    dashboard,
    activeCount,
    hiddenFilters,
    clearAll,
    layoutItems,
    onFilterDrawerOpen: () => setFilterDrawerOpen(true),
    onAddFilter: (id: string) => setPendingFilterIds((prev) => [...prev, id]),
    onRefreshAll: () => void refreshCharts(),
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
          const newMeta = { ...chartMetaRef.current, [chartId]: chart };
          setChartMeta(newMeta);
          const { dataMap } = await getChartDataWithFilters([chartId], newMeta);
          setChartData((prev) => ({ ...prev, ...dataMap }));
        }
      } catch {
        /* refresh failed */
      }
    },
    [setSearchParams, setChartMeta, getChartDataWithFilters, setChartData],
  );

  const handleCloseDrawer = useCallback(() => {
    setSearchParams((prev) => {
      prev.delete("slice_id");
      return prev;
    });
  }, [setSearchParams]);

  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFilterChange = useCallback(
    (filterId: string, value: unknown) => {
      setFilter(filterId, value);
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
      const changedFilter = filtersRef.current.find((f) => f.id === filterId);
      const affectedIds = changedFilter?.chartsInScope?.length
        ? new Set(changedFilter.chartsInScope)
        : undefined;
      setChartLoading((prev) => {
        const next = { ...prev };
        const ids = affectedIds
          ? Array.from(affectedIds)
          : Object.keys(chartMetaRef.current).map(Number);
        for (const cid of ids) next[cid] = true;
        return next;
      });
      filterTimerRef.current = setTimeout(
        () => refreshChartsRef.current(affectedIds),
        300,
      );
    },
    [setFilter],
  );

  const handleClearAll = useCallback(() => {
    clearAll();
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => refreshChartsRef.current(), 300);
  }, [clearAll]);

  const handleOpenInsight = useCallback(
    (chartId: number) => {
      const openAiDrawer = useDrawerStore.getState().openAiDrawer;
      const activeFilters: Record<string, DashboardFilterValue> = {};
      for (const f of filters) {
        const state = filterState[f.id];
        if (state?.value != null)
          activeFilters[f.id] = {
            value: state.value,
            column: f.column,
            filterType: f.filterType,
          };
      }
      openAiDrawer("insight", {
        chartId,
        chartMeta: chartMeta[chartId],
        filters: activeFilters,
        dashboardId: id,
      });
    },
    [filters, filterState, chartMeta, id],
  );

  const handleAddChartSelect = useCallback(
    async (chart: { id: number; slice_name: string; viz_type: string }) => {
      setAddChartDialogOpen(false);
      const alreadyInLayout = Object.values(layout.nodeMapRef.current).some(
        (n) => n.type === "CHART" && n.meta?.chartId === chart.id,
      );
      if (alreadyInLayout) return;
      let chartMetaData: ChartData | undefined;
      try {
        const metaRes = await api.get<{ result: ChartData }>(
          `/chart/${chart.id}`,
        );
        chartMetaData = metaRes.data?.result;
      } catch {
        /* ignore */
      }
      if (chartMetaData) {
        chartMetaRef.current = {
          ...chartMetaRef.current,
          [chart.id]: chartMetaData,
        };
        setChartMeta((prev) => ({ ...prev, [chart.id]: chartMetaData }));
      }
      const chartKey = `CHART-${chart.id}`;
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
      const gridNode = Object.values(layout.nodeMapRef.current).find(
        (n) => n.type === "GRID",
      );
      const rootNode = Object.values(layout.nodeMapRef.current).find(
        (n) => n.type === "ROOT",
      );
      const updatedNodeMap = {
        ...layout.nodeMapRef.current,
        [chartKey]: newNode,
      };
      if (!gridNode || !rootNode) {
        const grid: LayoutNode = {
          id: "GRID_ID",
          type: "GRID",
          children: [chartKey],
        };
        const root: LayoutNode = {
          id: "ROOT_ID",
          type: "ROOT",
          children: ["GRID_ID"],
        };
        updatedNodeMap["ROOT_ID"] = root;
        updatedNodeMap["GRID_ID"] = grid;
        setGridId("GRID_ID");
      } else {
        updatedNodeMap[gridNode.id] = {
          ...gridNode,
          children: [...(gridNode.children || []), chartKey],
        };
      }
      layout.nodeMapRef.current = updatedNodeMap;
      setNodeMap(updatedNodeMap);
      layout.fullPositionRef.current = {
        ...layout.fullPositionRef.current,
        ...updatedNodeMap,
      } as DashboardPosition;
      await layout.saveLayout();
      if (chartMetaData) {
        try {
          const { dataMap, totalRowMap } = await getChartDataWithFilters(
            [chart.id],
            { [chart.id]: chartMetaData },
          );
          setChartData((prev) => ({ ...prev, ...dataMap }));
          setTotalRows((prev) => ({ ...prev, ...totalRowMap }));
        } catch {
          /* ignore */
        }
      }
    },
    [layout, getChartDataWithFilters, setChartMeta, setChartData, setTotalRows],
  );

  const handleDeleteChart = useCallback(
    async (chartId: number) => {
      const chartKey = `CHART-${chartId}`;
      const node = layout.nodeMapRef.current[chartKey];
      if (!node || node.type !== "CHART") return;
      const updatedNodeMap: Record<string, LayoutNode> = {};
      for (const [key, n] of Object.entries(layout.nodeMapRef.current)) {
        if (n.type === "CHART" && n.meta?.chartId === chartId) continue;
        if (n.children?.includes(chartKey))
          updatedNodeMap[key] = {
            ...n,
            children: n.children.filter((c) => c !== chartKey),
          };
        else updatedNodeMap[key] = n;
      }
      delete updatedNodeMap[chartKey];
      layout.nodeMapRef.current = updatedNodeMap;
      setNodeMap(updatedNodeMap);
      setChartMeta((prev) => {
        const next = { ...prev };
        delete next[chartId];
        return next;
      });
      const metaRef = chartMetaRef.current;
      if (metaRef[chartId]) {
        const next = { ...metaRef };
        delete next[chartId];
        chartMetaRef.current = next;
      }
      setChartData((prev) => {
        const next = { ...prev };
        delete next[chartId];
        return next;
      });
      setDashboardDimensions([]);
      await layout.saveLayout();
    },
    [layout, setChartMeta, setChartData],
  );

  useEffect(() => {
    if (!filterDrawerOpen) setPendingFilterIds([]);
  }, [filterDrawerOpen]);

  return {
    id,
    dashboard,
    loading,
    error,
    isDrawerOpen,
    editingSliceId,
    buildDashboardAdhocFilters,
    chartMeta,
    chartData,
    totalRows,
    chartLoading,
    chartPages,
    chartHasMore,
    metricFormatMaps,
    nodeMap,
    gridId,
    layoutItems,
    layout,
    filters,
    filterState,
    activeCount,
    hiddenFilters,
    pendingFilterIds,
    filterDrawerOpen,
    navOpen,
    navItems,
    addChartDialogOpen,
    intervalSeconds,
    pageKey,
    compare,
    dashboardChartIds,
    setFilterDrawerOpen,
    setNavOpen,
    setAddChartDialogOpen,
    handleFilterChange,
    handleClearAll,
    handleChartPageChange,
    refreshChart,
    refreshCharts,
    cycleInterval,
    handleChartSaved,
    handleCloseDrawer,
    handleOpenInsight,
    handleAddChartSelect,
    handleDeleteChart,
    openNav,
  };
}
