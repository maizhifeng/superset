import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { EChartsOption } from "echarts";
import { buildEChartsOption, loadECharts } from "@/utils/echarts";
import { buildQueryObject } from "@/utils/query/extractQueryFields";
import api, { getDataset, getMetricFormatMap } from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { useToolbarStore } from "@/store/toolbarStore";
import { useNotificationStore } from "@/store/notificationStore";
import type {
  Dataset,
  FormData,
  ChartDataPayload,
  ChartData,
  ChartDataRow,
} from "@/types/api";
import type { AdhocMetric, QueryOrderBy } from "@/utils/query/types";
import { formatNumber } from "@/utils/formatNumber";
import { getChartDataUrl } from "@/api/chartData";
import { isFederatedDataset } from "@/config/federatedDatasets";

export interface PivotConfig {
  aggregateFunction: string;
  transposePivot: boolean;
  combineMetric: boolean;
  rowTotals: boolean;
  colTotals: boolean;
  metricsLayout: "ROWS" | "COLUMNS";
}

export const DEFAULT_PIVOT_CONFIG: PivotConfig = {
  aggregateFunction: "Sum",
  transposePivot: false,
  combineMetric: true,
  rowTotals: false,
  colTotals: true,
  metricsLayout: "COLUMNS",
};

export function autoSuggestChartType(
  metrics: string[],
  columnsList: { column_name: string; type: string | null }[],
  groupby: string[],
): { vizType: string; groupby: string[] } {
  const metricCount = metrics.length;
  if (metricCount === 0) return { vizType: "table", groupby: [] };
  if (metricCount >= 4) return { vizType: "table", groupby: [] };
  if (groupby.length >= 2) return { vizType: "table", groupby };
  if (groupby.length === 0) {
    if (metricCount === 1) return { vizType: "big_number", groupby: [] };
    if (metricCount >= 2) return { vizType: "line", groupby: [] };
  }
  const timeTypes = /time|date|timestamp|year|month|quarter|week/i;
  const groupbyCol = columnsList.find((c) => c.column_name === groupby[0]);
  const isTime =
    groupbyCol != null &&
    (timeTypes.test(groupbyCol.type ?? "") ||
      timeTypes.test(groupbyCol.column_name));
  if (metricCount === 1) return { vizType: isTime ? "line" : "pie", groupby };
  return { vizType: "bar", groupby };
}

interface ChartInitialData {
  slice_name: string;
  viz_type: string;
  datasource_id?: number;
  form_data?: string | FormData | null;
  params?: string | FormData | null;
}

interface ChartEditorOptions {
  onChartSaved?: (chartId: number) => void;
  initialData?: ChartInitialData | null;
  compact?: boolean;
  buildDashboardAdhocFilters?: (datasetId?: number) => {
    clause: "WHERE" | "HAVING";
    expressionType: "SIMPLE" | "SQL";
    subject: string;
    operator: string;
    comparator: string | string[];
  }[];
}

interface FieldOption {
  value: string;
  label: string;
  group: string;
}

let datasetsCache: Dataset[] | null = null;

export function useChartEditor({
  onChartSaved,
  initialData,
  compact,
  buildDashboardAdhocFilters,
}: ChartEditorOptions) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sliceId = searchParams.get("slice_id");
  const notify = useNotificationStore((s) => s.notify);

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasourceId, setDatasourceId] = useState("");
  const [vizType, setVizType] = useState("auto");
  const [metrics, setMetrics] = useState<string[]>([]);
  const [groupby, setGroupby] = useState<string[]>([]);
  const [groupbyColumns, setGroupbyColumns] = useState<string[]>([]);
  const [sliceName, setSliceName] = useState("");
  const [metricsList, setMetricsList] = useState<
    { metric_name: string; verbose_name: string | null; expression: string }[]
  >([]);
  const [columnsList, setColumnsList] = useState<
    {
      column_name: string;
      type: string | null;
      expression?: string;
      is_dttm?: boolean;
      verbose_name?: string | null;
    }[]
  >([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [suggested, setSuggested] = useState<{
    vizType: string;
    groupby: string[];
  } | null>(null);
  const [userChangedType, setUserChangedType] = useState(false);
  const [metricFormatMap, setMetricFormatMap] = useState<
    Record<string, string>
  >({});
  const [savedFormData, setSavedFormData] = useState<FormData | null>(null);
  const [sortEntry, setSortEntry] = useState<{
    column: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [chartData, setChartData] = useState<ChartDataPayload | null>(null);
  const [chartTotalsRows, setChartTotalsRows] = useState<ChartDataRow[] | null>(
    null,
  );
  const [chartSubtotalRows, setChartSubtotalRows] = useState<
    ChartDataRow[][] | null
  >(null);
  const [loadingData, setLoadingData] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 50;
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);
  const abortRef = useRef<AbortController | null>(null);
  const chartDataRef = useRef(chartData);
  chartDataRef.current = chartData;
  const metricNames = useMemo(
    () => new Set(metricsList.map((m) => m.metric_name)),
    [metricsList],
  );
  const isEditing = Boolean(sliceId || initialData?.datasource_id);

  const pivotMetricKeys = useMemo(
    () => metrics.map((m) => (metricNames.has(m) ? m : `SUM(${m})`)),
    [metrics, metricNames],
  );

  const fieldOptions = useMemo(() => {
    const items: FieldOption[] = [];
    for (const m of metricsList)
      items.push({
        value: m.metric_name,
        label: m.verbose_name || m.metric_name,
        group: "指标",
      });
    for (const c of columnsList) {
      if (c.column_name)
        items.push({
          value: c.column_name,
          label: c.verbose_name || c.column_name,
          group: "列",
        });
    }
    return items;
  }, [metricsList, columnsList]);

  const idColumnNames = useMemo(() => {
    const idPattern = /_?id$/i;
    return new Set(
      columnsList
        .filter((c) => idPattern.test(c.column_name))
        .map((c) => c.column_name),
    );
  }, [columnsList]);

  const metricsOptions = useMemo(() => {
    if (!columnsList.length) return fieldOptions;
    const numericTypes = /int|float|double|decimal|number|bigint|numeric|real/i;
    return fieldOptions.filter((o) => {
      if (o.group === "指标") return true;
      const col = columnsList.find((c) => c.column_name === o.value);
      if (!col) return false;
      if (idColumnNames.has(o.value)) return false;
      if (col.type && numericTypes.test(col.type)) return true;
      if (!col.type && col.expression) return true;
      return false;
    });
  }, [fieldOptions, columnsList, idColumnNames]);

  const dimensionOptions = useMemo(() => {
    if (!columnsList.length) return [];
    const numericTypes = /int|float|double|decimal|number|bigint|numeric|real/i;
    const timeTypes = /time|date|timestamp|year|month|quarter|week/i;
    return columnsList
      .filter((c) => {
        if (!c.type) return true;
        if (timeTypes.test(c.type) || timeTypes.test(c.column_name))
          return true;
        return !numericTypes.test(c.type);
      })
      .map((c) => ({
        value: c.column_name,
        label: c.verbose_name || c.column_name,
        group: "维度",
      }));
  }, [columnsList]);

  const buildMetricsPayload = useCallback(
    (selected: string[]): unknown[] => {
      return selected.map((m) => {
        if (metricNames.has(m)) return m;
        return {
          expressionType: "SIMPLE",
          column: { column_name: m },
          aggregate: "SUM",
          label: `SUM(${m})`,
        };
      });
    },
    [metricNames],
  );

  const handleMetricsChange = (v: string[]) => {
    if (v.length === 0 && metricsList.length > 0)
      setMetrics(
        metricsList
          .filter((m) => m.expression !== "NULL")
          .map((m) => m.metric_name),
      );
    else setMetrics(v);
  };

  useEffect(() => {
    if (datasetsCache) {
      setDatasets(datasetsCache);
      setLoadingDatasets(false);
      return;
    }
    api
      .get<{ result: Dataset[] }>("/dataset/?q=(page_size:200,page:0)")
      .then((res) => {
        datasetsCache = res.data.result;
        setDatasets(res.data.result);
        setLoadingDatasets(false);
      })
      .catch((err) => {
        setError(err?.message ?? "加载数据集失败");
        setLoadingDatasets(false);
      });
  }, []);

  function restoreFormData(raw: string | FormData | null | undefined) {
    if (!raw) return;
    let parsed: FormData = {};
    try {
      parsed =
        typeof raw === "string"
          ? JSON.parse(raw || "{}")
          : typeof raw === "object" && raw !== null
            ? raw
            : {};
    } catch {
      return;
    }
    const g = parsed.groupby;
    if (Array.isArray(g)) setGroupby(g);
    const gr = parsed.groupbyRows;
    if (Array.isArray(gr)) setGroupby(gr);
    const gc = parsed.groupbyColumns;
    if (Array.isArray(gc)) setGroupbyColumns(gc);
    const m = parsed.metrics ?? parsed.metric;
    if (Array.isArray(m))
      setMetrics(
        m
          .map((item: unknown) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object")
              return (
                ((item as AdhocMetric).column?.column_name as string) || ""
              );
            return "";
          })
          .filter(Boolean),
      );
    else if (typeof m === "string") setMetrics([m]);
    const ob = parsed.orderby;
    if (Array.isArray(ob) && ob.length > 0) {
      const entry = ob[0] as QueryOrderBy;
      const col =
        typeof entry[0] === "string" ? entry[0] : entry[0]?.column?.column_name;
      if (col)
        setSortEntry({ column: col, direction: entry[1] ? "asc" : "desc" });
    }
    setSavedFormData(parsed);
  }

  useEffect(() => {
    if (initialData?.form_data || initialData?.params) {
      setSliceName(initialData.slice_name);
      setVizType(initialData.viz_type);
      setDatasourceId(String(initialData.datasource_id ?? ""));
      restoreFormData(initialData.form_data || initialData.params);
      setLoadingChart(false);
      return;
    }
    if (initialData) {
      setSliceName(initialData.slice_name);
      setVizType(initialData.viz_type);
      setDatasourceId(String(initialData.datasource_id ?? ""));
    }
    if (!sliceId) return;
    setLoadingChart(true);
    api
      .get(`/chart/${sliceId}`)
      .then((res) => {
        const chart = res.data?.result as ChartData | undefined;
        if (!chart) return;
        setSliceName(String(chart.slice_name ?? ""));
        setVizType(String(chart.viz_type ?? ""));
        setDatasourceId(String(chart.datasource_id ?? ""));
        restoreFormData(chart.params || chart.form_data);
      })
      .catch((err) => setError(parseErrorMessage(err, "加载图表失败")))
      .finally(() => setLoadingChart(false));
  }, [sliceId, initialData]);

  useEffect(() => {
    if (!datasourceId) {
      setColumnsList([]);
      setMetricsList([]);
      return;
    }
    setLoadingColumns(true);
    getDataset<{
      columns: {
        column_name: string;
        type: string | null;
        expression?: string;
        is_dttm?: boolean;
        verbose_name?: string | null;
      }[];
      metrics: {
        metric_name: string;
        verbose_name: string | null;
        expression: string;
      }[];
    }>(datasourceId)
      .then((r) => {
        setColumnsList(r.columns ?? []);
        setMetricsList(r.metrics ?? []);
        if (!isEditing)
          setMetrics(
            (r.metrics ?? [])
              .filter((m) => m.expression !== "NULL")
              .map((m) => m.metric_name),
          );
      })
      .catch(() => {
        setColumnsList([]);
        setMetricsList([]);
      })
      .finally(() => setLoadingColumns(false));
    getMetricFormatMap(Number(datasourceId))
      .then((fmtMap) => setMetricFormatMap(fmtMap))
      .catch(() => setMetricFormatMap({}));
  }, [datasourceId, isEditing]);

  useEffect(() => {
    if (loadingColumns) {
      setSuggested(null);
      return;
    }
    if (metrics.length === 0) return;
    const s = autoSuggestChartType(metrics, columnsList, groupby);
    setSuggested(s);
    if (!userChangedType && vizType === "auto" && !isEditing)
      setVizType(s.vizType);
  }, [
    metrics,
    columnsList,
    loadingColumns,
    groupby,
    vizType,
    userChangedType,
    isEditing,
  ]);

  const resolvedType =
    vizType === "auto" && suggested ? suggested.vizType : vizType;
  const hasValidType = Boolean(resolvedType && resolvedType !== "auto");
  const isPivot = resolvedType === "pivot_table_v2";

  const [chartLibReady, setChartLibReady] = useState(false);
  useEffect(() => {
    if (resolvedType === "table" || isPivot) {
      setChartLibReady(true);
      return;
    }
    let cancelled = false;
    setChartLibReady(false);
    void loadECharts().then(() => {
      if (!cancelled) setChartLibReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedType, isPivot]);

  const previewParams = useMemo(() => {
    if (!datasourceId || !hasValidType) return null;
    return {
      datasource_id: Number(datasourceId),
      viz_type: resolvedType,
      metrics,
      groupby,
      groupbyColumns: isPivot ? groupbyColumns : [],
      pivotConfig: isPivot ? DEFAULT_PIVOT_CONFIG : null,
    };
  }, [
    datasourceId,
    resolvedType,
    metrics,
    groupby,
    groupbyColumns,
    isPivot,
    hasValidType,
  ]);

  const prevParamsRef = useRef(previewParams);
  useEffect(() => {
    if (prevParamsRef.current !== previewParams) {
      setPage(0);
      prevParamsRef.current = previewParams;
    }
  }, [previewParams]);

  const wideCacheRef = useRef<{
    key: string;
    payload: ChartDataPayload;
  } | null>(null);

  useEffect(() => {
    if (
      !previewParams ||
      previewParams.metrics.length === 0 ||
      loadingColumns ||
      metricNames.size === 0
    ) {
      setChartData(null);
      setChartTotalsRows(null);
      setChartSubtotalRows(null);
      setLoadingData(false);
      return;
    }
    // Pivot layout changes must not keep rendering the stale grid: switch to
    // the skeleton immediately and render only once the new data is ready.
    if (previewParams.viz_type === "pivot_table_v2") setLoadingData(true);
    const timer = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const isRequery = chartDataRef.current !== null;
      if (!isRequery) setChartData(null);
      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingData(true);
      const isPivotQuery = previewParams.viz_type === "pivot_table_v2";
      const isFed = isFederatedDataset(Number(previewParams.datasource_id));

      const dashboardFilters = buildDashboardAdhocFilters?.(
        previewParams.datasource_id,
      );
      const savedAdhoc = Array.isArray(savedFormData?.adhoc_filters)
        ? (savedFormData.adhoc_filters as {
            subject?: string;
            operator?: string;
            comparator?: unknown;
            col?: string;
            op?: string;
            val?: unknown;
          }[])
        : [];
      const allFilters: {
        subject?: string;
        operator?: string;
        comparator?: unknown;
        col?: string;
        op?: string;
        val?: unknown;
      }[] = [...savedAdhoc, ...(dashboardFilters ?? [])];
      const toWideFilters = allFilters
        .map((f) => ({
          col: f.subject ?? f.col ?? "",
          op: f.operator ?? f.op ?? "",
          val: f.comparator ?? f.val,
        }))
        .filter((f) => f.col);

      // Wide-table path: row/column layout changes re-aggregate client-side
      // with zero backend round-trips; the cache is keyed by datasource +
      // metrics + filters, i.e. everything the wide table actually depends on.
      // Only enabled with an active time range: without filters the wide
      // table would cover the full history (tens of thousands of rows),
      // which is too heavy to ship to the browser.
      if (isPivotQuery && isFed && toWideFilters.length > 0) {
        const wideKey = JSON.stringify([
          previewParams.datasource_id,
          previewParams.metrics,
          allFilters,
        ]);
        const cached = wideCacheRef.current;
        if (cached && cached.key === wideKey) {
          setChartData(cached.payload);
          setLoadingData(false);
          return;
        }
        api
          .post(
            "/bi/pivot/wide-data",
            {
              datasource: {
                id: previewParams.datasource_id,
                type: "table",
              },
              columns: dimensionOptions.map((d) => d.value),
              metrics: buildMetricsPayload(previewParams.metrics),
              filters: toWideFilters,
              row_limit: 100000,
            },
            { signal: controller.signal },
          )
          .then((res) => {
            if (controller.signal.aborted) return;
            const results = (
              Array.isArray(res.data?.result) ? res.data.result : []
            ) as ChartDataPayload[];
            const payload = results[0];
            if (payload) {
              setChartData(payload);
              wideCacheRef.current = { key: wideKey, payload };
              setHasMore(false);
            } else {
              setChartData({});
            }
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            // Metrics that cannot be re-aggregated client-side (AVG /
            // COUNT DISTINCT) fall back to the classic multi-query path.
            runLegacyQuery();
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoadingData(false);
          });
        return () => controller.abort();
      }

      const runLegacyQuery = () => {
        const queryFormData: FormData = {
          metrics: buildMetricsPayload(previewParams.metrics),
          groupby: previewParams.groupby,
          groupbyRows: previewParams.groupby,
          groupbyColumns: previewParams.groupbyColumns,
          viz_type: previewParams.viz_type,
        };
        if (previewParams.pivotConfig) {
          queryFormData.aggregateFunction =
            previewParams.pivotConfig.aggregateFunction;
          queryFormData.transposePivot =
            previewParams.pivotConfig.transposePivot;
          queryFormData.combineMetric = previewParams.pivotConfig.combineMetric;
          queryFormData.rowTotals = previewParams.pivotConfig.rowTotals;
          queryFormData.colTotals = previewParams.pivotConfig.colTotals;
          queryFormData.metricsLayout = previewParams.pivotConfig.metricsLayout;
        }
        if (savedFormData) {
          if (savedFormData.time_range)
            queryFormData.time_range = savedFormData.time_range;
          if (savedFormData.adhoc_filters)
            queryFormData.adhoc_filters = savedFormData.adhoc_filters;
          if (savedFormData.row_limit)
            queryFormData.row_limit = savedFormData.row_limit;
          if (savedFormData.granularity_sqla)
            queryFormData.granularity_sqla = savedFormData.granularity_sqla;
        }
        if (sortEntry)
          queryFormData.orderby = [
            [sortEntry.column, sortEntry.direction === "asc"],
          ];
        if (isPivotQuery) {
          queryFormData.row_limit = 10000;
          delete queryFormData.row_offset;
        } else {
          queryFormData.row_limit = pageSize + 1;
          queryFormData.row_offset = page * pageSize;
        }
        const query = buildQueryObject(queryFormData, previewParams.viz_type);
        const totalsQuery = isPivotQuery
          ? buildQueryObject(
              {
                ...queryFormData,
                orderby: [],
                groupby: [],
                groupbyRows: [],
                groupbyColumns: [],
                columns: [],
              },
              previewParams.viz_type,
            )
          : null;
        const subtotalQueries: ReturnType<typeof buildQueryObject>[] = [];
        if (isPivotQuery) {
          for (
            let level = 0;
            level < previewParams.groupby.length - 1;
            level += 1
          ) {
            const dims = [
              ...previewParams.groupby.slice(0, level + 1),
              ...previewParams.groupbyColumns,
            ];
            subtotalQueries.push(
              buildQueryObject(
                {
                  ...queryFormData,
                  groupby: dims,
                  groupbyRows: dims,
                  groupbyColumns: [],
                  columns: [],
                },
                previewParams.viz_type,
              ),
            );
          }
        }
        if (dashboardFilters && dashboardFilters.length > 0) {
          query.filters = dashboardFilters.map((f) => ({
            col: f.subject,
            op: f.operator,
            val: f.comparator,
          }));
          if (totalsQuery) {
            totalsQuery.filters = dashboardFilters.map((f) => ({
              col: f.subject,
              op: f.operator,
              val: f.comparator,
            }));
          }
          for (const q of subtotalQueries) {
            q.filters = dashboardFilters.map((f) => ({
              col: f.subject,
              op: f.operator,
              val: f.comparator,
            }));
          }
        }
        const chartUrl = getChartDataUrl(Number(previewParams.datasource_id));
        const queries = [query];
        if (totalsQuery) queries.push(totalsQuery);
        queries.push(...subtotalQueries);
        api
          .post(
            chartUrl,
            {
              datasource: { id: previewParams.datasource_id, type: "table" },
              queries,
              form_data: {
                viz_type: previewParams.viz_type,
                metrics: previewParams.metrics,
                groupby: previewParams.groupby,
                groupbyRows: previewParams.groupby,
                groupbyColumns: previewParams.groupbyColumns,
                aggregateFunction: previewParams.pivotConfig?.aggregateFunction,
                transposePivot: previewParams.pivotConfig?.transposePivot,
                combineMetric: previewParams.pivotConfig?.combineMetric,
                rowTotals: previewParams.pivotConfig?.rowTotals,
                colTotals: previewParams.pivotConfig?.colTotals,
                metricsLayout: previewParams.pivotConfig?.metricsLayout,
              },
            },
            { signal: controller.signal },
          )
          .then((res) => {
            if (controller.signal.aborted) return;
            const results = (
              Array.isArray(res.data?.result) ? res.data.result : []
            ) as { data?: unknown }[];
            const rowData = (results[0] || {}) as ChartDataPayload;
            const totalsData = results[1]?.data;
            setChartTotalsRows(Array.isArray(totalsData) ? totalsData : null);
            setChartSubtotalRows(
              results
                .slice(2)
                .map((r) =>
                  Array.isArray(r?.data) ? (r.data as ChartDataRow[]) : null,
                )
                .filter((v): v is ChartDataRow[] => v !== null),
            );
            if (rowData && Array.isArray(rowData.data)) {
              if (isPivotQuery) {
                setHasMore(false);
              } else {
                const hasNext = rowData.data.length > pageSize;
                setHasMore(hasNext);
                if (hasNext) rowData.data = rowData.data.slice(0, pageSize);
              }
            }
            setChartData(rowData);
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            setChartData({});
            setChartTotalsRows(null);
            setChartSubtotalRows(null);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoadingData(false);
          });
      };

      runLegacyQuery();
      return () => controller.abort();
    }, 300);
    return () => clearTimeout(timer);
  }, [
    previewParams,
    loadingColumns,
    metricNames,
    savedFormData,
    sortEntry,
    buildDashboardAdhocFilters,
    page,
    buildMetricsPayload,
    dimensionOptions,
  ]);

  const option = useMemo(() => {
    if (!chartData || !resolvedType || resolvedType === "auto") return null;
    if (resolvedType === "table" || resolvedType === "pivot_table_v2")
      return null;
    return buildEChartsOption(
      resolvedType,
      chartData,
      undefined,
      undefined,
      compact,
    ) as EChartsOption | null;
  }, [chartData, resolvedType, compact]);

  const bigNumberValue = useMemo(() => {
    if (!chartData?.data) return null;
    const rows = Array.isArray(chartData.data) ? chartData.data : [];
    if (rows.length === 0) return null;
    const keys = Object.keys(rows[0]);
    for (const key of keys) {
      const val = rows[0][key];
      if (typeof val === "number") return formatNumber(val);
      const num = Number(val);
      if (!isNaN(num)) return formatNumber(num);
    }
    return null;
  }, [chartData]);

  const pieDisabled = useMemo(() => {
    if (groupby.length >= 2) return true;
    if (groupby.length === 1 && chartData?.data) {
      const rows = Array.isArray(chartData.data) ? chartData.data : [];
      const dimKey = groupby[0];
      const isTimeKey = /year|date|time/i.test(dimKey);
      const uniqueVals = new Set(
        rows.map((r) => {
          const v = r[dimKey];
          if (isTimeKey && typeof v === "number") {
            const d = new Date(v);
            const y = d.getFullYear();
            if (y > 1900 && y < 2100) return d.toLocaleDateString();
          }
          return v;
        }),
      );
      if (uniqueVals.size > 6) return true;
    }
    return false;
  }, [groupby, chartData]);

  const hasGroupBy = groupby.length > 0;

  const disabledReasons = useMemo(() => {
    const reasons: Record<string, string> = {};
    if (metrics.length === 0) {
      reasons["line"] = "未选择指标";
      reasons["bar"] = "未选择指标";
      reasons["pie"] = "未选择指标";
      reasons["big_number"] = "未选择指标";
      reasons["pivot_table_v2"] = "未选择指标";
    }
    if (pieDisabled) {
      const parts: string[] = [];
      if (groupby.length >= 2) parts.push("已选择多个维度");
      if (pieDisabled && !parts.length) parts.push("维度超过 6 个唯一值");
      reasons["pie"] = `饼图不可用：${parts.join(", ")}`;
    }
    if (hasGroupBy || metrics.length !== 1)
      reasons["big_number"] = "大数字需要 1 个指标且无分组";
    return reasons;
  }, [metrics.length, hasGroupBy, pieDisabled, groupby.length]);

  useEffect(() => {
    if (disabledReasons[vizType] && suggested) setVizType(suggested.vizType);
  }, [disabledReasons, vizType, suggested]);

  const handleSubmit = useCallback(async () => {
    if (!datasourceId || !hasValidType) {
      notify({
        severity: "warning",
        message: "请选择数据集并确保图表类型可用后再保存",
      });
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const selectedDataset = datasets.find(
        (d) => d.id === Number(datasourceId),
      );
      const effectiveType = resolvedType === "auto" ? "line" : resolvedType;
      const formData: FormData = {
        viz_type: effectiveType,
        datasource: `${datasourceId}__table`,
        metrics: buildMetricsPayload(metrics),
        groupby,
      };
      if (isPivot) {
        formData.groupbyRows = groupby;
        formData.groupbyColumns = groupbyColumns;
        formData.aggregateFunction = DEFAULT_PIVOT_CONFIG.aggregateFunction;
        formData.transposePivot = DEFAULT_PIVOT_CONFIG.transposePivot;
        formData.combineMetric = DEFAULT_PIVOT_CONFIG.combineMetric;
        formData.rowTotals = DEFAULT_PIVOT_CONFIG.rowTotals;
        formData.colTotals = DEFAULT_PIVOT_CONFIG.colTotals;
        formData.metricsLayout = DEFAULT_PIVOT_CONFIG.metricsLayout;
      }
      if (sortEntry)
        formData.orderby = [[sortEntry.column, sortEntry.direction === "asc"]];
      const queryContext = buildQueryObject(formData, effectiveType);
      const body = {
        slice_name: sliceName || selectedDataset?.table_name || "未命名",
        viz_type: effectiveType,
        datasource_id: Number(datasourceId),
        datasource_type: "table",
        params: JSON.stringify(formData),
        query_context: JSON.stringify(queryContext),
      };
      let savedId: number | null = null;
      if (isEditing) {
        await api.put(`/chart/${sliceId}`, body);
        savedId = Number(sliceId);
      } else {
        const res = await api.post("/chart/", body);
        savedId = res.data?.id ?? null;
      }
      if (onChartSaved && savedId) {
        notify({ severity: "success", message: "图表已保存" });
        onChartSaved(savedId);
      } else {
        notify({ severity: "success", message: "图表已保存" });
        navigate("/chart/list");
      }
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: unknown; status?: number } };
      if (apiErr?.response?.data)
        console.error(
          "Chart save error response:",
          JSON.stringify(apiErr.response.data),
        );
      const errMsg = parseErrorMessage(err, "保存图表失败");
      setError(errMsg);
      notify({ severity: "error", message: errMsg });
    } finally {
      setCreating(false);
    }
  }, [
    datasourceId,
    hasValidType,
    datasets,
    resolvedType,
    sliceName,
    metrics,
    groupby,
    groupbyColumns,
    isPivot,
    isEditing,
    sliceId,
    sortEntry,
    onChartSaved,
    navigate,
    notify,
    buildMetricsPayload,
  ]);

  const handleRunQuery = useCallback(() => {
    setPage(0);
    setLoadingData(true);
    const queryFormData: FormData = {
      metrics: buildMetricsPayload(metrics),
      groupby,
      groupbyRows: groupby,
      groupbyColumns: groupbyColumns,
      viz_type: resolvedType === "auto" ? "line" : resolvedType,
      row_limit: isPivot ? 10000 : pageSize + 1,
      row_offset: isPivot ? undefined : 0,
    };
    if (isPivot) {
      queryFormData.aggregateFunction = DEFAULT_PIVOT_CONFIG.aggregateFunction;
      queryFormData.transposePivot = DEFAULT_PIVOT_CONFIG.transposePivot;
      queryFormData.combineMetric = DEFAULT_PIVOT_CONFIG.combineMetric;
      queryFormData.rowTotals = DEFAULT_PIVOT_CONFIG.rowTotals;
      queryFormData.colTotals = DEFAULT_PIVOT_CONFIG.colTotals;
      queryFormData.metricsLayout = DEFAULT_PIVOT_CONFIG.metricsLayout;
    }
    if (savedFormData) {
      if (savedFormData.time_range)
        queryFormData.time_range = savedFormData.time_range;
      if (savedFormData.adhoc_filters)
        queryFormData.adhoc_filters = savedFormData.adhoc_filters;
      if (savedFormData.granularity_sqla)
        queryFormData.granularity_sqla = savedFormData.granularity_sqla;
    }
    if (sortEntry)
      queryFormData.orderby = [
        [sortEntry.column, sortEntry.direction === "asc"],
      ];
    const query = buildQueryObject(
      queryFormData,
      resolvedType === "auto" ? "line" : resolvedType,
    );
    const totalsQuery = isPivot
      ? buildQueryObject(
          {
            ...queryFormData,
            orderby: [],
            groupby: [],
            groupbyRows: [],
            groupbyColumns: [],
            columns: [],
          },
          resolvedType,
        )
      : null;
    const subtotalQueries: ReturnType<typeof buildQueryObject>[] = [];
    if (isPivot) {
      for (let level = 0; level < groupby.length - 1; level += 1) {
        const dims = [...groupby.slice(0, level + 1), ...groupbyColumns];
        subtotalQueries.push(
          buildQueryObject(
            {
              ...queryFormData,
              groupby: dims,
              groupbyRows: dims,
              groupbyColumns: [],
              columns: [],
            },
            resolvedType,
          ),
        );
      }
    }
    const dashboardFilters = buildDashboardAdhocFilters?.(Number(datasourceId));
    if (dashboardFilters && dashboardFilters.length > 0) {
      query.filters = dashboardFilters.map((f) => ({
        col: f.subject,
        op: f.operator,
        val: f.comparator,
      }));
      if (totalsQuery) {
        totalsQuery.filters = dashboardFilters.map((f) => ({
          col: f.subject,
          op: f.operator,
          val: f.comparator,
        }));
      }
      for (const q of subtotalQueries) {
        q.filters = dashboardFilters.map((f) => ({
          col: f.subject,
          op: f.operator,
          val: f.comparator,
        }));
      }
    }
    const chartUrl = getChartDataUrl(Number(datasourceId));
    const queries = [query];
    if (totalsQuery) queries.push(totalsQuery);
    queries.push(...subtotalQueries);
    api
      .post(chartUrl, {
        datasource: { id: Number(datasourceId), type: "table" },
        queries,
        form_data: {
          viz_type: resolvedType,
          metrics,
          groupby,
          groupbyRows: groupby,
          groupbyColumns: groupbyColumns,
          aggregateFunction: isPivot
            ? DEFAULT_PIVOT_CONFIG.aggregateFunction
            : undefined,
          transposePivot: isPivot
            ? DEFAULT_PIVOT_CONFIG.transposePivot
            : undefined,
          combineMetric: isPivot
            ? DEFAULT_PIVOT_CONFIG.combineMetric
            : undefined,
          rowTotals: isPivot ? DEFAULT_PIVOT_CONFIG.rowTotals : undefined,
          colTotals: isPivot ? DEFAULT_PIVOT_CONFIG.colTotals : undefined,
          metricsLayout: isPivot
            ? DEFAULT_PIVOT_CONFIG.metricsLayout
            : undefined,
        },
      })
      .then((res) => {
        const results = (
          Array.isArray(res.data?.result) ? res.data.result : []
        ) as { data?: unknown }[];
        const rowData = (results[0] || {}) as ChartDataPayload;
        const totalsData = results[1]?.data;
        setChartTotalsRows(Array.isArray(totalsData) ? totalsData : null);
        setChartSubtotalRows(
          results
            .slice(2)
            .map((r) =>
              Array.isArray(r?.data) ? (r.data as ChartDataRow[]) : null,
            )
            .filter((v): v is ChartDataRow[] => v !== null),
        );
        if (rowData && Array.isArray(rowData.data)) {
          if (isPivot) {
            setHasMore(false);
          } else {
            const hasNext = rowData.data.length > pageSize;
            setHasMore(hasNext);
            if (hasNext) rowData.data = rowData.data.slice(0, pageSize);
          }
        }
        setChartData(rowData);
      })
      .catch(() => {
        setChartData({});
        setChartTotalsRows(null);
        setChartSubtotalRows(null);
      })
      .finally(() => setLoadingData(false));
  }, [
    datasourceId,
    resolvedType,
    metrics,
    groupby,
    groupbyColumns,
    isPivot,
    savedFormData,
    sortEntry,
    buildDashboardAdhocFilters,
    buildMetricsPayload,
  ]);

  useEffect(() => {
    registerTools("chart_editor", [
      {
        id: "save",
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabIcon: null,
        fabLabel: isEditing ? "保存" : "创建",
        action: () => void handleSubmit(),
        render: null,
      },
    ]);
    return () => unregisterTools("chart_editor");
  }, [registerTools, unregisterTools, handleSubmit, isEditing]);

  return {
    datasets,
    datasourceId,
    vizType,
    metrics,
    groupby,
    groupbyColumns,
    sliceName,
    metricsList,
    columnsList,
    loadingColumns,
    loadingDatasets,
    loadingChart,
    chartData,
    chartTotalsRows,
    chartSubtotalRows,
    loadingData,
    page,
    hasMore,
    pageSize,
    suggested,
    metricFormatMap,
    savedFormData,
    sortEntry,
    fieldOptions,
    metricsOptions,
    dimensionOptions,
    pivotMetricKeys,
    resolvedType,
    hasValidType,
    chartLibReady,
    option,
    bigNumberValue,
    disabledReasons,
    error,
    isEditing,
    creating,
    setDatasourceId,
    setMetrics,
    setGroupby,
    setGroupbyColumns,
    setSliceName,
    setVizType,
    setPage,
    setSortEntry,
    setError,
    setSavedFormData,
    setUserChangedType,
    handleMetricsChange,
    handleChartTypeChange: (val: string) => {
      setVizType(val);
      setUserChangedType(val !== "auto");
    },
    handleSubmit,
    handleRunQuery,
  };
}
