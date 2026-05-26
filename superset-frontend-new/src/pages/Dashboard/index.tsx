import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { produce } from "immer";
import { useParams, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Drawer from "@mui/material/Drawer";

import type { DashboardData, ChartData } from "@/types/api";
import PageSpeedDial from "@/components/PageSpeedDial";
import ChartEditor from "@/pages/ChartCreation/ChartEditor";
import DashboardGrid from "@/pages/Dashboard/DashboardGrid";
import DashboardNav from "@/pages/Dashboard/DashboardNav";
import useDashboardToolbar from "@/pages/Dashboard/useDashboardToolbar";
import UndoRedoKeyListeners from "@/dashboard/components/UndoRedoKeyListeners";
import api, { getDataset } from "@/api";
import {
  buildQueryObject,
  extractQueryFields,
} from "@/utils/query/extractQueryFields";
import type { SimpleFilter } from "@/utils/query/types";
import {
  DashboardFilterDrawer,
  useDashboardFilters,
} from "@/components/DashboardFilter";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

import { type LayoutNode, flattenLayout } from "@/utils/dashboard/layout";
import CompareConfigModal from "@/pages/Dashboard/CompareConfigModal";
import CompareModal from "@/pages/Dashboard/CompareModal";
import AddChartDialog from "@/pages/Dashboard/AddChartDialog";
import InsightDrawer from "@/pages/Dashboard/InsightDrawer";
import type {
  CompareConfig,
  CompareDimension,
} from "@/pages/Dashboard/ChartCard";
import type { ColumnOption } from "@/pages/Dashboard/CompareConfigModal";
import TableSkeleton from "@/components/TableSkeleton";
import { EmptyState } from "@/superset-ui-mui/components";
import {
  useDashboardData,
  parseChartConfig,
} from "@/pages/Dashboard/hooks/useDashboardData";
import { spacing } from "@/theme/spacing";

export default function Dashboard() {
  const { id } = useParams<{ id: string }>();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [nodeMap, setNodeMap] = useState<Record<string, LayoutNode>>({});
  const [gridId, setGridId] = useState<string | null>(null);
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
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [periodModalChartId, setPeriodModalChartId] = useState<number | null>(
    null,
  );
  const [periodModalChartData, setPeriodModalChartData] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const [insightOpen, setInsightOpen] = useState(false);
  const [insightChartId, setInsightChartId] = useState<number | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [datasetCompareColumns, setDatasetCompareColumns] = useState<
    ColumnOption[]
  >([]);
  const [initialCompareColumns, setInitialCompareColumns] = useState<
    ColumnOption[]
  >([]);

  const {
    chartMeta,
    chartData,
    totalRows,
    otherRows,
    setChartMeta,
    setChartData,
    setTotalRows,
    setOtherRows,
    buildAdhocFiltersRef,
    getChartDataWithFilters,
    refreshChart: refreshChartData,
    fetchOtherRow: fetchOtherRowData,
  } = useDashboardData();

  const [chartLoading, setChartLoading] = useState<Record<number, boolean>>({});
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
      const stringTypes = /varchar|char|text|string/i;
      for (const dsId of dsIds) {
        try {
          const dataset = await getDataset<{
            columns: {
              column_name: string;
              type: string | null;
              is_dttm: boolean;
              expression: string | null;
              filterable: boolean;
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
            const dashFilter = extra?.dashboard_filter === true;
            if (!dashFilter) continue;
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
  buildAdhocFiltersRef.current = buildAdhocFilters;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

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
    let timer: ReturnType<typeof setTimeout>;
    const updateWidth = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (containerRef.current) {
          setContainerWidth(containerRef.current.offsetWidth);
        }
      }, 100);
    };
    window.addEventListener("resize", updateWidth);
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    updateWidth();
    return () => {
      window.removeEventListener("resize", updateWidth);
      observer.disconnect();
      clearTimeout(timer);
    };
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
        const CONCURRENCY = 3;
        for (let i = 0; i < chartIds.length; i += CONCURRENCY) {
          const batch = chartIds.slice(i, i + CONCURRENCY);
          const results = await Promise.allSettled(
            batch.map((cid) =>
              api
                .get<{ result: ChartData }>(`/chart/${cid}`)
                .then((res) => res.data.result),
            ),
          );
          results.forEach((r) => {
            if (r.status === "fulfilled" && r.value) {
              metaMap[r.value.id] = r.value;
            }
          });
        }

        const dsIds = new Set<number>();
        for (const chart of Object.values(metaMap)) {
          const dsId = chart.datasource_id || (chart.datasource_id ?? 0);
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
                const dashFilter = extra?.dashboard_filter === true;
                if (!dashFilter) continue;
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

        const { dataMap, totalRowMap } = await getChartDataWithFilters(
          chartIds,
          metaMap,
        );
        setChartData(dataMap);
        setTotalRows(totalRowMap);
      }
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "加载仪表板失败"));
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
      setInitialCompareColumns([]);
      return;
    }
    const dsId = chartMeta[compareChartId]?.datasource_id;
    if (!dsId) {
      setDatasetCompareColumns([]);
      setInitialCompareColumns([]);
      return;
    }

    let chartGroupbyCols: string[] = [];
    try {
      const chart = chartMeta[compareChartId];
      if (chart) {
        const fd = parseChartConfig(chart);
        const { groupby, columns } = extractQueryFields(fd, chart.viz_type);
        chartGroupbyCols = [...groupby, ...columns].filter(Boolean);
      }
    } catch {
      // ignore
    }

    const numericTypes =
      /^int\d*$|^bigint$|^smallint$|^tinyint$|^numeric$|^decimal$|^float$|^double$|^real$|^money$/i;
    const timeTypes = /time|date|timestamp|year|month|quarter|week/i;
    const idPattern = /_?id$/i;
    getDataset<{
      columns: { column_name: string; type: string | null }[];
    }>(dsId)
      .then((dataset) => {
        const allColumns: ColumnOption[] = (dataset.columns ?? [])
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
          }));
        setDatasetCompareColumns(allColumns);
        setInitialCompareColumns(
          allColumns.filter((c) => chartGroupbyCols.includes(c.column)),
        );
      })
      .catch(() => {
        setDatasetCompareColumns([]);
        setInitialCompareColumns([]);
      });
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

  const chartMetaRef = useRef(chartMeta);
  chartMetaRef.current = chartMeta;

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
      forceServerQuery?: boolean,
    ) => {
      const chart = chartMeta[chartId];
      if (!chart) return;

      // If not forcing a fresh query and existing data is available, filter locally
      if (!forceServerQuery) {
        const existing = existingDataOverride ?? chartDataRef.current[chartId];
        if (existing?.data && Array.isArray(existing.data)) {
          setMirrorData(filterDataLocal(existing, dimensions));
          return;
        }
      }

      try {
        const fd = parseChartConfig(chart);
        const dsId =
          chart.datasource_id ||
          (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : 0);
        if (!dsId) return;
        const query = buildQueryObject(fd, chart.viz_type);
        if (!query.metrics || query.metrics.length === 0) return;

        // Add compare dimension filters to the SQL query
        const dimensionFilters: SimpleFilter[] = dimensions.map((d) => ({
          col: d.dimension,
          op: "IN",
          val: d.values,
        }));

        const buildFn = buildAdhocFiltersRef.current;
        const adhocFilters = buildFn(dsId);
        query.filters = [
          ...(adhocFilters.map((f) => ({
            col: f.subject,
            op: f.operator,
            val: f.comparator,
          })) as SimpleFilter[]),
          ...dimensionFilters,
        ];
        const force = adhocFilters.length > 0 || dimensions.length > 0;
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
        setMirrorData(rawData);
      } catch {
        // Fall back to client-side filtering on server error
        const existing = existingDataOverride ?? chartDataRef.current[chartId];
        if (existing?.data && Array.isArray(existing.data)) {
          setMirrorData(filterDataLocal(existing, dimensions));
        }
      }
    },
    [chartMeta, filterDataLocal],
  );

  const refreshChart = useCallback(
    async (chartId: number) => {
      setChartLoading((prev) => ({ ...prev, [chartId]: true }));
      try {
        const data = await refreshChartData(
          chartId,
          chartMeta,
          buildAdhocFiltersRef.current,
        );
        if (data) {
          setChartData((prev) => ({ ...prev, [chartId]: data }));
          if (compareConfig?.enabled && compareConfig.chartId === chartId) {
            fetchMirrorData(chartId, compareConfig.dimensions, data);
          }
        }
      } finally {
        setChartLoading((prev) => ({ ...prev, [chartId]: false }));
      }
    },
    [chartMeta, refreshChartData, compareConfig, fetchMirrorData],
  );

  const refreshCharts = useCallback(
    async (chartIds?: Set<number>) => {
      const ids = chartIds
        ? Array.from(chartIds)
        : Object.keys(chartMeta).map(Number);
      if (ids.length === 0) return;
      setChartLoading((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = true;
        return next;
      });
      try {
        const { dataMap, totalRowMap } = await getChartDataWithFilters(
          ids,
          chartMeta,
        );
        setChartData((prev) => ({ ...prev, ...dataMap }));
        setTotalRows((prev) => ({ ...prev, ...totalRowMap }));
        if (compareConfig?.enabled) {
          const freshData = dataMap[compareConfig.chartId];
          fetchMirrorData(
            compareConfig.chartId,
            compareConfig.dimensions,
            freshData,
          );
        }
      } finally {
        setChartLoading((prev) => {
          const next = { ...prev };
          for (const id of ids) next[id] = false;
          return next;
        });
      }
    },
    [chartMeta, compareConfig, fetchMirrorData, getChartDataWithFilters],
  );
  const refreshChartsRef = useRef(refreshCharts);
  refreshChartsRef.current = refreshCharts;

  const fetchOtherRow = useCallback(
    async (chartId: number, excludeColumn: string, excludeValues: string[]) => {
      setOtherRows((prev) => ({ ...prev, [chartId]: null }));
      const result = await fetchOtherRowData(
        chartId,
        excludeColumn,
        excludeValues,
        chartMetaRef.current,
        buildAdhocFiltersRef.current,
      );
      if (result) {
        setOtherRows((prev) => ({ ...prev, [chartId]: result }));
      } else {
        setOtherRows((prev) => {
          const next = { ...prev };
          delete next[chartId];
          return next;
        });
      }
    },
    [fetchOtherRowData],
  );

  const pageKey = `dashboard_${id}`;
  useDashboardToolbar({
    dashboard,
    activeCount,
    hiddenFilters,
    clearAll,
    layoutItems,
    onFilterDrawerOpen: () => setFilterDrawerOpen(true),
    onAddFilter: (id: string) => setPendingFilterIds((prev) => [...prev, id]),
    onRefreshAll: refreshCharts,
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
          const { dataMap } = await getChartDataWithFilters([chartId], newMeta);
          setChartData((prev) => ({ ...prev, ...dataMap }));
        }
      } catch {
        /* refresh failed */
      }
    },
    [setSearchParams, chartMeta],
  );

  const saveLayout = useCallback(async () => {
    if (!id) {
      console.warn("[saveLayout] no id");
      return;
    }
    isSavingRef.current = true;
    setSaving(true);
    try {
      const updatedPosition = produce(fullPositionRef.current, (draft) => {
        const d = draft as Record<string, unknown>;
        d["DASHBOARD_VERSION_KEY"] = "v2";

        // Copy nodes from nodeMap (unfreeze with spread)
        for (const [key, node] of Object.entries(nodeMapRef.current)) {
          if (!node.type) continue;
          if (
            node.type === "CHART" &&
            node.meta?.chartId != null &&
            !chartMetaRef.current[node.meta.chartId as number]
          ) {
            delete d[key];
            continue;
          }
          d[key] = { ...node } as unknown as Record<string, unknown>;
        }

        // Remove children references to deleted charts
        for (const key of Object.keys(d)) {
          const n = d[key] as Record<string, unknown> | undefined;
          if (
            n &&
            typeof n === "object" &&
            "children" in n &&
            Array.isArray(n.children)
          ) {
            n.children = n.children.filter(
              (childId: string) => d[childId] && typeof d[childId] === "object",
            );
          }
        }

        // Remove stale CHART nodes that are no longer in nodeMap
        for (const key of Object.keys(d)) {
          const n = d[key] as Record<string, unknown> | undefined;
          if (
            n &&
            typeof n === "object" &&
            n.type === "CHART" &&
            !nodeMapRef.current[key]
          ) {
            delete d[key];
          }
        }

        // Normalize ROOT and GRID keys (backend expects ROOT_ID/GRID_ID)
        const rootKey = Object.keys(d).find((k) => {
          const v = d[k] as Record<string, unknown> | undefined;
          return v?.type === "ROOT";
        });
        if (rootKey && rootKey !== "ROOT_ID") {
          const rootVal = d[rootKey] as Record<string, unknown> | undefined;
          if (rootVal) {
            d["ROOT_ID"] = { ...rootVal, id: "ROOT_ID" };
            delete d[rootKey];
            const children = d["ROOT_ID"] as
              | Record<string, unknown>
              | undefined;
            const gridId = (children?.children as string[] | undefined)?.[0];
            if (gridId && gridId !== "GRID_ID" && d[gridId]) {
              const gridVal = d[gridId] as Record<string, unknown> | undefined;
              if (gridVal) {
                d["GRID_ID"] = { ...gridVal, id: "GRID_ID" };
                delete d[gridId];
                const replaceChildRef = (obj: Record<string, unknown>) => {
                  const kids = obj.children as string[] | undefined;
                  if (kids) {
                    obj.children = kids.map((c) =>
                      c === gridId ? "GRID_ID" : c,
                    );
                  }
                };
                replaceChildRef(d["ROOT_ID"] as Record<string, unknown>);
                replaceChildRef(d["GRID_ID"] as Record<string, unknown>);
              }
            }
          }
        }
      }) as Record<string, Record<string, unknown>>;
      const saved = JSON.stringify(updatedPosition);
      await api.put(`/dashboard/${id}`, {
        position_json: saved,
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
      const changedFilter = filtersRef.current.find((f) => f.id === id);
      const affectedIds = changedFilter?.chartsInScope?.length
        ? new Set(changedFilter.chartsInScope)
        : undefined;
      setChartLoading((prev) => {
        const next = { ...prev };
        const ids = affectedIds
          ? Array.from(affectedIds)
          : Object.keys(chartMeta).map(Number);
        for (const chartId of ids) next[chartId] = true;
        return next;
      });
      filterTimerRef.current = setTimeout(() => {
        refreshChartsRef.current(affectedIds);
      }, 300);
    },
    [setFilter, chartMeta],
  );

  const handleClearAll = useCallback(() => {
    clearAll();
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => {
      refreshChartsRef.current();
    }, 300);
  }, [clearAll]);

  const handleFilterDrawerClose = useCallback(() => {
    setFilterDrawerOpen(false);
  }, []);

  const handleFilterDrawerOpen = useCallback(() => {
    setFilterDrawerOpen(true);
  }, []);

  const handleOpenInsight = useCallback(
    (chartId: number) => {
      setInsightChartId(chartId);
      setInsightOpen(true);
      // Collect active filter IDs and values
      const activeFilters: Record<string, unknown> = {};
      for (const f of filters) {
        const state = filterState[f.id];
        if (state?.value != null) {
          activeFilters[f.id] = {
            value: state.value,
            column: f.column,
            filterType: f.filterType,
          };
        }
      }
      setFilterValues(activeFilters);
    },
    [filters, filterState],
  );

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
      fetchMirrorData(compareChartId, dimensions, undefined, true);
    },
    [compareChartId, fetchMirrorData],
  );

  const handleAddChartSelect = useCallback(
    async (chart: { id: number; slice_name: string; viz_type: string }) => {
      setAddChartDialogOpen(false);
      const alreadyInLayout = Object.values(nodeMapRef.current).some(
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
      let gridNode = Object.values(nodeMapRef.current).find(
        (n) => n.type === "GRID",
      );
      let rootNode = Object.values(nodeMapRef.current).find(
        (n) => n.type === "ROOT",
      );
      const updatedNodeMap = { ...nodeMapRef.current, [chartKey]: newNode };

      if (!gridNode || !rootNode) {
        const gridId = "GRID_ID";
        const rootId = "ROOT_ID";
        const grid: LayoutNode = {
          id: gridId,
          type: "GRID",
          children: [chartKey],
        };
        const root: LayoutNode = {
          id: rootId,
          type: "ROOT",
          children: [gridId],
        };
        updatedNodeMap[rootId] = root;
        updatedNodeMap[gridId] = grid;
        setGridId(gridId);
      } else {
        const updatedGrid = {
          ...gridNode,
          children: [...(gridNode.children || []), chartKey],
        };
        updatedNodeMap[gridNode.id] = updatedGrid;
      }
      nodeMapRef.current = updatedNodeMap;
      setNodeMap(updatedNodeMap);
      fullPositionRef.current = {
        ...fullPositionRef.current,
        ...updatedNodeMap,
      };
      await saveLayout();
      if (chartMetaData) {
        try {
          const newData = await getChartDataWithFilters([chart.id], {
            [chart.id]: chartMetaData,
          });
          setChartData((prev) => ({ ...prev, ...newData }));
        } catch {
          /* ignore */
        }
      }
    },
    [saveLayout, getChartDataWithFilters],
  );

  const handleDeleteChart = useCallback(
    async (chartId: number) => {
      const chartKey = `CHART-${chartId}`;
      const node = nodeMapRef.current[chartKey];
      if (!node || node.type !== "CHART") return;

      const updatedNodeMap: Record<string, LayoutNode> = {};
      for (const [key, n] of Object.entries(nodeMapRef.current)) {
        if (n.type === "CHART" && n.meta?.chartId === chartId) continue;
        if (n.children?.includes(chartKey)) {
          updatedNodeMap[key] = {
            ...n,
            children: n.children.filter((c) => c !== chartKey),
          };
        } else {
          updatedNodeMap[key] = n;
        }
      }
      delete updatedNodeMap[chartKey];

      nodeMapRef.current = updatedNodeMap;
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
      await saveLayout();
    },
    [saveLayout],
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
      <Box sx={{ p: 3 }}>
        <TableSkeleton rows={6} />
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
  if (!dashboard) return <EmptyState title="未找到仪表板" />;

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
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "auto",
          maxWidth: "100%",
          px: { xs: spacing.xs, md: spacing.md },
        }}
      >
        <DashboardGrid
          containerWidth={containerWidth}
          gridLayout={gridLayout}
          layoutItems={layoutItems}
          chartMeta={chartMeta}
          chartData={chartData}
          chartLoading={chartLoading}
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
          onDelete={handleDeleteChart}
          onInsight={handleOpenInsight}
          onAddChart={() => setAddChartDialogOpen(true)}
          compareConfig={compareConfig}
          mirrorData={mirrorData}
          onToggleCompare={handleToggleCompare}
          onOpenCompareBigScreen={(chartId, chartData) => {
            setPeriodModalChartId(chartId);
            setPeriodModalChartData(chartData);
            setPeriodModalOpen(true);
          }}
          otherRows={otherRows}
          onFetchOtherRow={fetchOtherRow}
          totalRows={totalRows}
        />
      </Box>
      <Drawer
        variant="temporary"
        anchor="right"
        open={isDrawerOpen}
        onClose={handleCloseDrawer}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100vw", md: "50vw" },
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
              buildDashboardAdhocFilters={buildAdhocFilters}
            />
          )}
        </Box>
      </Drawer>
      <CompareConfigModal
        open={compareModalOpen}
        columns={datasetCompareColumns}
        initialColumns={initialCompareColumns}
        fullData={
          compareChartId != null ? chartData[compareChartId] : undefined
        }
        onApply={handleApplyCompare}
        onCancel={() => {
          setCompareModalOpen(false);
          setCompareChartId(null);
        }}
      />
      <CompareModal
        open={periodModalOpen}
        chartId={periodModalChartId}
        chartData={periodModalChartData}
        chartMeta={
          periodModalChartId != null ? chartMeta[periodModalChartId] : undefined
        }
        onClose={() => {
          setPeriodModalOpen(false);
          setPeriodModalChartId(null);
          setPeriodModalChartData(undefined);
        }}
      />
      <AddChartDialog
        open={addChartDialogOpen}
        excludeIds={dashboardChartIds}
        onSelect={handleAddChartSelect}
        onClose={() => setAddChartDialogOpen(false)}
      />
      <InsightDrawer
        open={insightOpen}
        chartId={insightChartId}
        chartData={
          insightChartId != null ? chartData[insightChartId] : undefined
        }
        chartMeta={
          insightChartId != null ? chartMeta[insightChartId] : undefined
        }
        filters={filterValues}
        onClose={() => {
          setInsightOpen(false);
          setInsightChartId(null);
        }}
      />
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
      />
      <DashboardNav
        open={navOpen}
        items={navItems}
        onClose={() => setNavOpen(false)}
      />
    </>
  );
}
