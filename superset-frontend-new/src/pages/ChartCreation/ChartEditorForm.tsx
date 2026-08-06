import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import type { Dataset } from "@/types/api";
import PickerField from "./PickerField";
import PivotLayoutBuilder from "./PivotLayoutBuilder";

interface FieldOption {
  value: string;
  label: string;
  group: string;
}

interface ChartEditorFormProps {
  datasets: Dataset[];
  datasourceId: string;
  metrics: string[];
  groupby: string[];
  groupbyColumns: string[];
  vizType: string;
  metricsOptions: FieldOption[];
  dimensionOptions: { value: string; label: string; group: string }[];
  loadingDatasets: boolean;
  loadingColumns: boolean;
  compact?: boolean;
  onDatasourceChange: (id: string) => void;
  onMetricsChange: (v: string[]) => void;
  onGroupbyChange: (v: string[]) => void;
  onGroupbyColumnsChange: (v: string[]) => void;
}

export default function ChartEditorForm({
  datasets,
  datasourceId,
  metrics,
  groupby,
  groupbyColumns,
  vizType,
  metricsOptions,
  dimensionOptions,
  loadingDatasets,
  loadingColumns,
  compact,
  onDatasourceChange,
  onMetricsChange,
  onGroupbyChange,
  onGroupbyColumnsChange,
}: ChartEditorFormProps) {
  const c = (full: number | string, comp: number | string) =>
    compact ? comp : full;
  const isPivot = vizType === "pivot_table_v2";

  const dimPicker = (
    label: string,
    selected: string[],
    onChange: (v: string[]) => void,
    placeholder: string,
  ) => (
    <CardContent sx={{ p: c(0.75, 0.75) }}>
      {loadingColumns ? (
        <CircularProgress size={16} />
      ) : (
        <PickerField
          label={label}
          options={datasourceId ? dimensionOptions : []}
          selected={selected}
          onChange={onChange}
          placeholder={placeholder}
          compact
          hideHeader
          hideGroups
        />
      )}
    </CardContent>
  );

  const isPivotSplit = isPivot && !compact;
  const datasetCard = (
    <Card
      elevation={0}
      sx={{
        // In the stacked layout `flex: 1` splits width evenly with the other
        // cards; in the pivot side panel the card must size to its content
        // so the layout grid below it fills the remaining height.
        flex: isPivotSplit ? undefined : 1,
        minWidth: { md: 180 },
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <CardHeader
        sx={{
          px: c(0.75, 0.75),
          py: isPivotSplit ? 0.15 : c(0.25, 0.25),
          bgcolor: "grey.50",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
        title={
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontSize: compact ? "0.6rem" : undefined,
            }}
          >
            数据集
          </Typography>
        }
      />
      <CardContent sx={{ p: isPivotSplit ? 0.5 : c(0.75, 0.75) }}>
        <PickerField
          label="数据集"
          options={datasets.map((d) => ({
            value: String(d.id),
            label: d.table_name,
          }))}
          selected={datasourceId ? [datasourceId] : []}
          onChange={(vals) => {
            onDatasourceChange(vals[0] || "");
          }}
          loading={loadingDatasets}
          placeholder="选择数据集..."
          singleSelect
          hideGroups
          hideHeader
          dense={isPivotSplit}
        />
      </CardContent>
    </Card>
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: c(0.5, 0.75),
        px: c(1, 1),
        py: c(0.5, 0.5),
        borderBottom: isPivot && !compact ? "none" : "1px solid",
        borderColor: "divider",
        flex: isPivot && !compact ? 1 : undefined,
        flexShrink: isPivot && !compact ? undefined : 0,
        minHeight: isPivot && !compact ? 0 : undefined,
      }}
    >
      {isPivot && !compact ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flex: 1,
            minHeight: 0,
          }}
        >
          {datasetCard}
          <PivotLayoutBuilder
            dimensionOptions={datasourceId ? dimensionOptions : []}
            metricOptions={datasourceId ? metricsOptions : []}
            rowDims={groupby}
            colDims={groupbyColumns}
            metrics={metrics}
            loading={loadingColumns}
            onRowDimsChange={onGroupbyChange}
            onColDimsChange={onGroupbyColumnsChange}
            onMetricsChange={onMetricsChange}
          />
        </Box>
      ) : (
        <Box sx={{ display: "flex", gap: c(1, 0.75), flexWrap: "wrap" }}>
          {!compact && datasetCard}
          <Card
            elevation={0}
            sx={{
              flex: 1,
              minWidth: { md: 180 },
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <CardHeader
              sx={{
                px: c(0.75, 0.75),
                py: c(0.25, 0.25),
                bgcolor: "grey.50",
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
              title={
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontSize: compact ? "0.6rem" : undefined,
                  }}
                >
                  {isPivot ? "行维度" : "分组"}
                </Typography>
              }
            />
            {dimPicker(
              isPivot ? "行维度" : "分组",
              groupby,
              onGroupbyChange,
              "添加维度...",
            )}
          </Card>

          {isPivot && (
            <Card
              elevation={0}
              sx={{
                flex: 1,
                minWidth: { md: 180 },
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                overflow: "hidden",
              }}
            >
              <CardHeader
                sx={{
                  px: c(0.75, 0.75),
                  py: c(0.25, 0.25),
                  bgcolor: "grey.50",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
                title={
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: compact ? "0.6rem" : undefined,
                    }}
                  >
                    列维度
                  </Typography>
                }
              />
              {dimPicker(
                "列维度",
                groupbyColumns,
                onGroupbyColumnsChange,
                "添加维度...",
              )}
            </Card>
          )}

          <Card
            elevation={0}
            sx={{
              flex: 1,
              minWidth: { md: 180 },
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <CardHeader
              sx={{
                px: c(0.75, 0.75),
                py: c(0.25, 0.25),
                bgcolor: "grey.50",
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
              title={
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontSize: compact ? "0.6rem" : undefined,
                  }}
                >
                  指标
                </Typography>
              }
            />
            <CardContent sx={{ p: c(0.75, 0.75) }}>
              {loadingColumns ? (
                <CircularProgress size={16} />
              ) : (
                <PickerField
                  label="指标"
                  options={datasourceId ? metricsOptions : []}
                  selected={metrics}
                  onChange={onMetricsChange}
                  placeholder="添加指标..."
                  hideHeader
                  hideGroups
                  compact
                />
              )}
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}
