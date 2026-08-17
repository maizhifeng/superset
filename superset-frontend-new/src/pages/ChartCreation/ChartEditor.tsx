import { useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useShortcutWithHelp } from "@/hooks/useShortcut";
import ChartPreview from "./ChartPreview";
import ChartEditorForm from "./ChartEditorForm";
import ChartTypeSelector from "./ChartTypeSelector";
import ExploreViewContainer from "@/explore/components/ExploreViewContainer";
import ExploreWelcome from "./ExploreWelcome";
import { useChartEditor } from "./useChartEditor";

interface ChartEditorProps {
  onChartSaved?: (chartId: number) => void;
  initialData?: {
    slice_name: string;
    viz_type: string;
    datasource_id?: number;
    form_data?: string | Record<string, unknown> | null;
    params?: string | Record<string, unknown> | null;
  } | null;
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
  const {
    datasets,
    datasourceId,
    vizType,
    metrics,
    metricsList,
    groupby,
    groupbyColumns,
    sliceName,
    loadingColumns,
    loadingDatasets,
    loadingChart,
    chartData,
    chartTotalsRows,
    chartSubtotalRows,
    loadingData,
    page,
    hasMore,
    suggested,
    metricFormatMap,
    metricsOptions,
    dimensionOptions,
    resolvedType,
    hasValidType,
    chartLibReady,
    option,
    bigNumberValue,
    pivotMetricKeys,
    disabledReasons,
    error,
    isEditing,
    setDatasourceId,
    setMetrics,
    setGroupby,
    setGroupbyColumns,
    setSliceName,
    setPage,
    setSortEntry,
    setError,
    setSavedFormData,
    setUserChangedType,
    handleMetricsChange,
    handleChartTypeChange,
    handleSubmit,
    handleRunQuery,
    handleCopyConfig,
    handleCopyChartId,
    handleCopyChartLink,
  } = useChartEditor({
    onChartSaved,
    initialData,
    compact,
    buildDashboardAdhocFilters,
  });

  // big_number 预览下显示的指标名称（首个选中指标的显示名）。
  const primaryMetricLabel = useMemo(() => {
    const first = metrics[0];
    if (!first) return undefined;
    const found = metricsList.find((m) => m.metric_name === first);
    return found ? (found.verbose_name || found.metric_name) : first;
  }, [metrics, metricsList]);

  /** 根据数据集与指标自动生成图表名称。 */
  const handleAutoName = useCallback(() => {
    const dsName =
      datasets.find((d) => String(d.id) === String(datasourceId))?.table_name ?? "";
    const parts = [dsName, primaryMetricLabel, resolvedType].filter(Boolean);
    if (parts.length === 0) {
      setSliceName("");
      return;
    }
    setSliceName(parts.join(" · "));
  }, [datasets, datasourceId, primaryMetricLabel, resolvedType, setSliceName]);

  // Cmd/Ctrl+Enter 运行查询并刷新预览。
  useShortcutWithHelp(
    ["ctrl+enter", "command+enter"],
    (e) => {
      e.preventDefault();
      void handleRunQuery();
    },
    {
      label: "运行查询",
      category: "explore",
      description: "按 ⌘↵ / Ctrl+Enter 运行查询",
    },
  );

  const c = (full: number | string, comp: number | string) =>
    compact ? comp : full;

  // Pivot charts use an Excel-style 2x2 field builder on the left with the
  // live preview on the right; everything else keeps the stacked layout.
  const isPivotSplit = !compact && resolvedType === "pivot_table_v2";

  const formPane = (
    <ChartEditorForm
      datasets={datasets}
      datasourceId={datasourceId}
      metrics={metrics}
      groupby={groupby}
      groupbyColumns={groupbyColumns}
      vizType={vizType}
      metricsOptions={metricsOptions}
      dimensionOptions={dimensionOptions}
      loadingDatasets={loadingDatasets}
      loadingColumns={loadingColumns}
      compact={compact}
      onDatasourceChange={(id) => {
        setDatasourceId(id);
        setMetrics([]);
        setGroupby([]);
        setGroupbyColumns([]);
        setUserChangedType(false);
        setSavedFormData(null);
      }}
      onMetricsChange={handleMetricsChange}
      onGroupbyChange={setGroupby}
      onGroupbyColumnsChange={setGroupbyColumns}
    />
  );

  if (loadingChart) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

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
            onClick={() => window.history.back()}
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
        <Tooltip title="根据数据集与指标自动命名">
          <IconButton
            size="small"
            onClick={handleAutoName}
            sx={{ color: "text.secondary", ml: 0.5 }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
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
        onRunQuery={() => void handleRunQuery()}
        onSaveChart={() => void handleSubmit()}
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
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: isPivotSplit ? "row" : "column",
          overflow: "hidden",
        }}
      >
        {isPivotSplit ? (
          <Box
            sx={{
              width: { md: 350, lg: 390 },
              flexShrink: 0,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              borderRight: "1px solid",
              borderColor: "divider",
            }}
          >
            {formPane}
          </Box>
        ) : (
          formPane
        )}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
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
              pivotMetricKeys={pivotMetricKeys}
              groupby={groupby}
              groupbyColumns={groupbyColumns}
              chartData={chartData}
              chartTotalsRows={chartTotalsRows}
              chartSubtotalRows={chartSubtotalRows}
              loadingData={loadingData}
              chartLibReady={chartLibReady}
              option={option}
              bigNumberValue={bigNumberValue}
              primaryMetricLabel={primaryMetricLabel}
              metricFormatMap={metricFormatMap}
              page={page}
              hasMore={hasMore}
              onPageChange={(p) => setPage(p)}
              onSortChange={(sorts) => {
                const s = sorts[0];
                if (s) {
                  setPage(0);
                  setSortEntry({ column: s.column, direction: s.direction });
                } else setSortEntry(null);
              }}
            />
          )}
        </Box>
      </Box>
      {compact ? (
        <Box sx={{ p: 2, pt: 0 }}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<SaveIcon />}
            onClick={() => void handleSubmit()}
          >
            {isEditing ? "保存" : "创建"}
          </Button>
        </Box>
      ) : (
        <Box sx={{ p: 2, display: "flex", justifyContent: "flex-end", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={() => void handleCopyConfig()}
          >
            复制配置
          </Button>
          {isEditing && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => void handleCopyChartId()}
            >
              复制 ID
            </Button>
          )}
          {isEditing && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => void handleCopyChartLink()}
            >
              复制链接
            </Button>
          )}
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            onClick={() => void handleSubmit()}
          >
            {isEditing ? "保存" : "创建"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
