import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import type { EChartsOption } from "echarts";
import { buildEChartsOption, loadECharts } from "@/utils/echarts";
import { buildQueryObject } from "@/utils/query/extractQueryFields";
import api, { getDataset, getMetricFormatMap } from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { useToolbarStore } from "@/contexts/ToolbarContext";
import { useNotificationStore } from "@/store/notificationStore";
import PageSpeedDial from "@/components/PageSpeedDial";
import ChartPreview from "./ChartPreview";
import ChartEditorForm from "./ChartEditorForm";
import ChartTypeSelector from "./ChartTypeSelector";
import ExploreViewContainer from "@/explore/components/ExploreViewContainer";
import ExploreWelcome from "./ExploreWelcome";
import type { Dataset } from "@/types/api";
import { formatNumber } from "@/utils/formatNumber";

interface FieldOption {
  value: string;
  label: string;
  group: string;
}

function autoSuggestChartType(
  metrics: string[],
  columnsList: { column_name: string; type: string | null }[],
  groupby: string[],
): { vizType: string; groupby: string[] } {
  const metricCount = metrics.length;
  if (metricCount === 0) return { vizType: "table", groupby: [] };
  if (metricCount >= 4) return { vizType: "table", groupby: [] };
  if (groupby.length >= 3) return { vizType: "table", groupby: [groupby[0]] };

  if (groupby.length === 0) {
    if (metricCount === 1) return { vizType: "big_number", groupby: [] };
    if (metricCount >= 2) return { vizType: "line", groupby: [] };
  }

  const numericTypes = /int|float|double|decimal|number|bigint|numeric|real/i;
  const timeTypes = /time|date|timestamp|year|month|quarter|week/i;
  const idPattern2 = /_?id$/i;
  const dimColumns = columnsList.filter((c) => {
    if (!c.type) return true;
    if (timeTypes.test(c.type) || timeTypes.test(c.column_name)) return false;
    if (idPattern2.test(c.column_name)) return true;
    return !numericTypes.test(c.type);
  });
  const timeCols = columnsList.filter(
    (c) => (c.type && timeTypes.test(c.type)) || timeTypes.test(c.column_name),
  );

  if (metricCount === 1 && dimColumns.length === 1) {
    const dimName = dimColumns[0].column_name;
    const isTime = timeCols.some((c) => c.column_name === dimName);
    return { vizType: isTime ? "line" : "bar", groupby: [dimName] };
  }
  if (metricCount === 1 && dimColumns.length > 1) {
    const firstDim =
      timeCols.length > 0 ? timeCols[0].column_name : dimColumns[0].column_name;
    return { vizType: "line", groupby: [firstDim] };
  }
  if (metricCount >= 2 && dimColumns.length >= 1) {
    return { vizType: "bar", groupby: [dimColumns[0].column_name] };
  }
  if (metricCount === 1 && dimColumns.length === 0) {
    return { vizType: "big_number", groupby: [] };
  }
  if (metricCount >= 2 && dimColumns.length === 0) {
    return { vizType: "line", groupby: [] };
  }
  return {
    vizType: "bar",
    groupby: dimColumns.length > 0 ? [dimColumns[0].column_name] : [],
  };
}

interface ChartInitialData {
  slice_name: string;
  viz_type: string;
  datasource_id?: number;
  form_data?: string | Record<string, unknown> | null;
  params?: string | Record<string, unknown> | null;
}

interface ChartEditorProps {
  onChartSaved?: (chartId: number) => void;
  showPreview?: boolean;
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

export default function ChartEditor({
  onChartSaved,
  initialData,
  compact,
  buildDashboardAdhocFilters,
}: ChartEditorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sliceId = searchParams.get("slice_id");

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasourceId, setDatasourceId] = useState("");
  const [vizType, setVizType] = useState("auto");
  const [metrics, setMetrics] = useState<string[]>([]);
  const [groupby, setGroupby] = useState<string[]>([]);
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
  const [savedFormData, setSavedFormData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [sortEntry, setSortEntry] = useState<{
    column: string;
    direction: "asc" | "desc";
  } | null>(null);

  const fieldOptions = useMemo(() => {
    const items: FieldOption[] = [];
    for (const m of metricsList) {
      items.push({
        value: m.metric_name,
        label: m.verbose_name || m.metric_name,
        group: "指标",
      });
    }
    for (const c of columnsList) {
      if (!c.column_name) continue;
      items.push({
        value: c.column_name,
        label: c.column_name,
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
        label: c.column_name,
        group: "维度",
      }));
  }, [columnsList]);

  const [chartData, setChartData] = useState<Record<string, unknown> | null>(
    null,
  );
  const [loadingData, setLoadingData] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 50;
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);

  const isEditing = Boolean(sliceId || initialData?.datasource_id);
  const notify = useNotificationStore((s) => s.notify);
  const abortRef = useRef<AbortController | null>(null);
  const metricNames = useMemo(
    () => new Set(metricsList.map((m) => m.metric_name)),
    [metricsList],
  );

  function buildMetricsPayload(selected: string[]): unknown[] {
    return selected.map((m) => {
      if (metricNames.has(m)) return m;
      return {
        expressionType: "SIMPLE",
        column: { column_name: m },
        aggregate: "SUM",
        label: `SUM(${m})`,
      };
    });
  }

  const handleMetricsChange = (v: string[]) => {
    if (v.length === 0 && metricsList.length > 0) {
      setMetrics(metricsList.map((m) => m.metric_name));
    } else {
      setMetrics(v);
    }
  };

  useEffect(() => {
    api
      .get<{ result: Dataset[] }>("/dataset/?q=(page_size:200,page:0)")
      .then((res) => {
        setDatasets(res.data.result);
        setLoadingDatasets(false);
      })
      .catch((err) => {
        setError(err?.message ?? "加载数据集失败");
        setLoadingDatasets(false);
      });
  }, []);

  function restoreFormData(
    raw: string | Record<string, unknown> | null | undefined,
  ) {
    if (!raw) return;
    let parsed: Record<string, unknown> = {};
    try {
      parsed =
        typeof raw === "string"
          ? JSON.parse(raw || "{}")
          : typeof raw === "object" && raw !== null
            ? (raw as Record<string, unknown>)
            : {};
    } catch {
      return;
    }
    const g = parsed.groupby;
    if (Array.isArray(g)) setGroupby(g as string[]);
    const m = parsed.metrics ?? parsed.metric;
    if (Array.isArray(m)) {
      setMetrics(
        m
          .map((item: unknown) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object")
              return (
                ((
                  (item as Record<string, unknown>).column as
                    | Record<string, unknown>
                    | undefined
                )?.column_name as string) || ""
              );
            return "";
          })
          .filter(Boolean),
      );
    } else if (typeof m === "string") {
      setMetrics([m]);
    }
    const ob = parsed.orderby;
    if (Array.isArray(ob) && ob.length > 0) {
      const entry = ob[0];
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
      const raw = initialData.form_data || initialData.params;
      restoreFormData(raw);
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
        const chart = res.data?.result as Record<string, unknown> | undefined;
        if (!chart) return;
        setSliceName(String(chart.slice_name ?? ""));
        setVizType(String(chart.viz_type ?? ""));
        setDatasourceId(String(chart.datasource_id ?? ""));
        const raw = (chart.params || chart.form_data) as
          | string
          | Record<string, unknown>
          | undefined;
        restoreFormData(raw ?? null);
      })
      .catch((err) => {
        setError(parseErrorMessage(err, "加载图表失败"));
      })
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
      }[];
      metrics: {
        metric_name: string;
        verbose_name: string | null;
        expression: string;
      }[];
    }>(datasourceId)
      .then((r) => {
        const cols = (r.columns ?? []) as {
          column_name: string;
          type: string | null;
          expression?: string;
          is_dttm?: boolean;
        }[];
        const mets = (r.metrics ?? []) as {
          metric_name: string;
          verbose_name: string | null;
          expression: string;
        }[];
        setColumnsList(cols);
        setMetricsList(mets);
        if (!isEditing) {
          setMetrics(mets.map((m) => m.metric_name));
        }
      })
      .catch(() => {
        setColumnsList([]);
        setMetricsList([]);
      })
      .finally(() => setLoadingColumns(false));
    getMetricFormatMap(Number(datasourceId))
      .then((fmtMap) => setMetricFormatMap(fmtMap))
      .catch(() => setMetricFormatMap({}));
  }, [datasourceId]);

  useEffect(() => {
    if (loadingColumns) {
      setSuggested(null);
      return;
    }
    if (metrics.length === 0) return;
    const s = autoSuggestChartType(metrics, columnsList, groupby);
    setSuggested(s);
    if (!userChangedType && vizType === "auto" && !isEditing) {
      setVizType(s.vizType);
    }
  }, [metrics, columnsList, loadingColumns, groupby, vizType, userChangedType]);

  const resolvedType =
    vizType === "auto" && suggested ? suggested.vizType : vizType;
  const hasValidType = Boolean(resolvedType && resolvedType !== "auto");

  const [chartLibReady, setChartLibReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setChartLibReady(false);
    loadECharts().then(() => {
      if (!cancelled) setChartLibReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedType]);

  const previewParams = useMemo(() => {
    if (!datasourceId || !hasValidType) return null;
    return {
      datasource_id: Number(datasourceId),
      viz_type: resolvedType,
      metrics,
      groupby,
    };
  }, [datasourceId, resolvedType, metrics, groupby]);

  const prevParamsRef = useRef(previewParams);
  useEffect(() => {
    if (prevParamsRef.current !== previewParams) {
      setPage(0);
      prevParamsRef.current = previewParams;
    }
  }, [previewParams]);

  useEffect(() => {
    if (
      !previewParams ||
      previewParams.metrics.length === 0 ||
      loadingColumns ||
      metricNames.size === 0
    ) {
      setChartData(null);
      setLoadingData(false);
      return;
    }

    const timer = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();

      const isRequery = chartData !== null;
      if (!isRequery) setChartData(null);
      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingData(true);

      const queryFormData: Record<string, unknown> = {
        metrics: buildMetricsPayload(previewParams.metrics),
        groupby: previewParams.groupby,
        viz_type: previewParams.viz_type,
      };
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
      if (sortEntry) {
        queryFormData.orderby = [
          [sortEntry.column, sortEntry.direction === "asc"],
        ];
      }
      queryFormData.row_limit = pageSize + 1;
      queryFormData.row_offset = page * pageSize;
      const query = buildQueryObject(queryFormData, previewParams.viz_type);
      const dashboardFilters = buildDashboardAdhocFilters?.(
        previewParams.datasource_id,
      );
      if (dashboardFilters && dashboardFilters.length > 0) {
        query.filters = dashboardFilters.map((f) => ({
          col: f.subject,
          op: f.operator,
          val: f.comparator,
        }));
      }
      api
        .post(
          "/chart/data",
          {
            datasource: { id: previewParams.datasource_id, type: "table" },
            queries: [query],
            form_data: {
              viz_type: previewParams.viz_type,
              metrics: previewParams.metrics,
              groupby: previewParams.groupby,
            },
          },
          { signal: controller.signal },
        )
        .then((res) => {
          if (controller.signal.aborted) return;
          const result = res.data?.result;
          const rowData = Array.isArray(result)
            ? result[0] || {}
            : result || {};
          if (rowData && Array.isArray(rowData.data)) {
            const hasNext = rowData.data.length > pageSize;
            setHasMore(hasNext);
            if (hasNext) {
              rowData.data = rowData.data.slice(0, pageSize);
            }
          }
          setChartData(rowData);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setChartData({});
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingData(false);
        });

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
  ]);

  const option = useMemo(() => {
    if (!chartData || !resolvedType || resolvedType === "auto") return null;
    if (resolvedType === "table") return null;
    return buildEChartsOption(resolvedType, chartData) as EChartsOption | null;
  }, [chartData, resolvedType]);

  const bigNumberValue = useMemo(() => {
    if (!chartData?.data) return null;
    const rows = Array.isArray(chartData.data)
      ? (chartData.data as Record<string, unknown>[])
      : [];
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
      const rows = Array.isArray(chartData.data)
        ? (chartData.data as Record<string, unknown>[])
        : [];
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
    }
    if (pieDisabled) {
      const parts: string[] = [];
      if (groupby.length >= 2) parts.push("已选择多个维度");
      if (pieDisabled && !parts.length) parts.push("维度超过 6 个唯一值");
      reasons["pie"] = `饼图不可用：${parts.join(", ")}`;
    }
    if (hasGroupBy || metrics.length !== 1) {
      reasons["big_number"] = "大数字需要 1 个指标且无分组";
    }
    return reasons;
  }, [metrics.length, hasGroupBy, pieDisabled, groupby.length]);

  useEffect(() => {
    if (disabledReasons[vizType] && suggested) {
      setVizType(suggested.vizType);
    }
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
      const formData: Record<string, unknown> = {
        viz_type: effectiveType,
        datasource: `${datasourceId}__table`,
        metrics: buildMetricsPayload(metrics),
        groupby,
      };
      if (sortEntry) {
        formData.orderby = [[sortEntry.column, sortEntry.direction === "asc"]];
      }
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
    metricNames,
    metrics,
    groupby,
    isEditing,
    sliceId,
    onChartSaved,
    navigate,
  ]);

  useEffect(() => {
    registerTools("chart_editor", [
      {
        id: "save",
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabIcon: <SaveIcon />,
        fabLabel: isEditing ? "保存" : "创建",
        action: handleSubmit,
        render: null,
      },
    ]);
    return () => unregisterTools("chart_editor");
  }, [registerTools, unregisterTools, handleSubmit, isEditing]);

  const handleRunQuery = useCallback(() => {
    setPage(0);
    setLoadingData(true);
    const queryFormData: Record<string, unknown> = {
      metrics: buildMetricsPayload(metrics),
      groupby,
      viz_type: resolvedType === "auto" ? "line" : resolvedType,
      row_limit: pageSize + 1,
      row_offset: 0,
    };
    if (savedFormData) {
      if (savedFormData.time_range)
        queryFormData.time_range = savedFormData.time_range;
      if (savedFormData.adhoc_filters)
        queryFormData.adhoc_filters = savedFormData.adhoc_filters;
      if (savedFormData.granularity_sqla)
        queryFormData.granularity_sqla = savedFormData.granularity_sqla;
    }
    if (sortEntry) {
      queryFormData.orderby = [
        [sortEntry.column, sortEntry.direction === "asc"],
      ];
    }
    const query = buildQueryObject(
      queryFormData,
      resolvedType === "auto" ? "line" : resolvedType,
    );
    const dashboardFilters = buildDashboardAdhocFilters?.(Number(datasourceId));
    if (dashboardFilters && dashboardFilters.length > 0) {
      query.filters = dashboardFilters.map((f) => ({
        col: f.subject,
        op: f.operator,
        val: f.comparator,
      }));
    }
    api
      .post("/chart/data", {
        datasource: { id: Number(datasourceId), type: "table" },
        queries: [query],
        form_data: { viz_type: resolvedType, metrics, groupby },
      })
      .then((res) => {
        const result = res.data?.result;
        const rowData = Array.isArray(result) ? result[0] || {} : result || {};
        if (rowData && Array.isArray(rowData.data)) {
          const hasNext = rowData.data.length > pageSize;
          setHasMore(hasNext);
          if (hasNext) {
            rowData.data = rowData.data.slice(0, pageSize);
          }
        }
        setChartData(rowData);
      })
      .catch(() => setChartData({}))
      .finally(() => setLoadingData(false));
  }, [
    datasourceId,
    resolvedType,
    metrics,
    groupby,
    metricNames,
    savedFormData,
    sortEntry,
    buildDashboardAdhocFilters,
  ]);

  const handleChartTypeChange = (val: string) => {
    setVizType(val);
    setUserChangedType(val !== "auto");
  };

  if (loadingChart) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const c = (full: number | string, comp: number | string) =>
    compact ? comp : full;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 0.75,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "grey.50",
          flexShrink: 0,
        }}
      >
        {!compact && (
          <IconButton
            size="small"
            onClick={() => navigate(-1)}
            sx={{ bgcolor: "grey.200", color: "text.primary" }}
          >
            <ArrowBackIcon sx={{ fontSize: 20 }} />
          </IconButton>
        )}
        <TextField
          placeholder="图表名称..."
          value={sliceName}
          onChange={(e) => setSliceName(e.target.value)}
          variant="standard"
          sx={{
            minWidth: 120,
            "& .MuiInputBase-input": {
              fontSize: "1.125rem",
              fontWeight: 700,
              py: 0.5,
            },
            "& .MuiInputBase-root::before": {
              borderBottomColor: "divider",
              borderBottomWidth: 1,
            },
            "& .MuiInputBase-root:hover::before": {
              borderBottomColor: "primary.light",
            },
            "& .MuiInputBase-root::after": {
              borderBottomColor: "primary.main",
            },
          }}
        />
        {datasourceId && (
          <ChartTypeSelector
            value={vizType}
            suggested={suggested?.vizType}
            disabledReasons={disabledReasons}
            onChange={handleChartTypeChange}
          />
        )}
      </Box>
      <ExploreViewContainer
        onRunQuery={handleRunQuery}
        onSaveChart={handleSubmit}
      />
      {error && (
        <Alert
          severity="error"
          sx={{ mx: c(2, 1.5), mt: c(2, 1.5), flexShrink: 0 }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      <ChartEditorForm
        datasets={datasets}
        datasourceId={datasourceId}
        metrics={metrics}
        groupby={groupby}
        metricsOptions={metricsOptions}
        dimensionOptions={dimensionOptions}
        loadingDatasets={loadingDatasets}
        loadingColumns={loadingColumns}
        compact={compact}
        onDatasourceChange={(id) => {
          setDatasourceId(id);
          setMetrics([]);
          setGroupby([]);
          setUserChangedType(false);
          setSavedFormData(null);
        }}
        onMetricsChange={handleMetricsChange}
        onGroupbyChange={setGroupby}
      />

      <Box
        sx={{
          flex: 1,
          p: c(0.5, 0.75),
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!datasourceId ? (
          <ExploreWelcome />
        ) : (
          <ChartPreview
            datasourceId={datasourceId}
            resolvedType={resolvedType}
            hasValidType={hasValidType}
            metrics={metrics}
            chartData={chartData}
            loadingData={loadingData}
            chartLibReady={chartLibReady}
            option={option}
            bigNumberValue={bigNumberValue}
            metricFormatMap={metricFormatMap}
            page={page}
            hasMore={hasMore}
            onPageChange={(p) => setPage(p)}
            onSortChange={(sorts) => {
              const s = sorts[0];
              if (s) {
                setPage(0);
                setSortEntry({ column: s.column, direction: s.direction });
              } else {
                setSortEntry(null);
              }
            }}
          />
        )}
      </Box>
      {compact ? (
        <Box sx={{ p: 2, pt: 0 }}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<SaveIcon />}
            onClick={handleSubmit}
          >
            {isEditing ? "保存" : "创建"}
          </Button>
        </Box>
      ) : (
        <PageSpeedDial pageKeys="chart_editor" />
      )}
    </Box>
  );
}
