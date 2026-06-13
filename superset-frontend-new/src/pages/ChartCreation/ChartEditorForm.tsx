import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import type { Dataset } from "@/types/api";
import PickerField from "./PickerField";

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
  metricsOptions: FieldOption[];
  dimensionOptions: { value: string; label: string; group: string }[];
  loadingDatasets: boolean;
  loadingColumns: boolean;
  compact?: boolean;
  onDatasourceChange: (id: string) => void;
  onMetricsChange: (v: string[]) => void;
  onGroupbyChange: (v: string[]) => void;
}

export default function ChartEditorForm({
  datasets,
  datasourceId,
  metrics,
  groupby,
  metricsOptions,
  dimensionOptions,
  loadingDatasets,
  loadingColumns,
  compact,
  onDatasourceChange,
  onMetricsChange,
  onGroupbyChange,
}: ChartEditorFormProps) {
  const c = (full: number | string, comp: number | string) =>
    compact ? comp : full;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: c(0.5, 0.75),
        px: c(1, 1),
        py: c(0.5, 0.5),
        borderBottom: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: "flex", gap: c(1, 0.75) }}>
          {!compact && (
          <Card
            elevation={0}
            sx={{
              flex: 1,
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
                   数据集
                 </Typography>
               }
             />
             <CardContent sx={{ p: c(0.75, 0.75) }}>
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
               />
             </CardContent>
           </Card>
          )}
          <Card
            elevation={0}
            sx={{
              flex: 1,
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
                   分组
                </Typography>
              }
            />
            <CardContent sx={{ p: c(0.75, 0.75) }}>
              {loadingColumns ? (
                <CircularProgress size={16} />
              ) : (
                <PickerField
                  label="分组"
                  options={datasourceId ? dimensionOptions : []}
                  selected={groupby}
                  onChange={onGroupbyChange}
                  placeholder="添加维度..."
                  compact
                  hideHeader
                  hideGroups
                />
              )}
            </CardContent>
          </Card>

          <Card
            elevation={0}
            sx={{
              flex: 1,
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
    </Box>
  );
}
