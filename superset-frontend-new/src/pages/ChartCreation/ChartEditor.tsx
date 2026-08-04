import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
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
  } = useChartEditor({
    onChartSaved,
    initialData,
    compact,
    buildDashboardAdhocFilters,
  });

  const c = (full: number | string, comp: number | string) =>
    compact ? comp : full;

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
        <Box sx={{ p: 2, display: "flex", justifyContent: "flex-end" }}>
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
