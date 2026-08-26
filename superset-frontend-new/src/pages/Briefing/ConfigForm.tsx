import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import api from "@/api";
import type { ReportParamValues, ReportType } from "./params";

const REPORT_TYPE_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "daily", label: "日报（按天）" },
  { value: "weekly", label: "周报（自然周 周日~周六）" },
];

interface DatasetOption {
  id: number;
  name: string;
  table_name: string;
  schema: string;
  database_name: string;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Grid size={{ xs: 12, sm: 6 }}>
      <TextField
        size="small"
        label={label}
        fullWidth
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Grid>
  );
}

export default function ConfigForm({
  value,
  onChange,
}: {
  value: ReportParamValues;
  onChange: (next: ReportParamValues) => void;
}) {
  const [local, setLocal] = useState(value);
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDatasets(true);
    api
      .get<{ result: DatasetOption[] }>("/briefing/datasets")
      .then((res) => {
        if (!cancelled) setDatasets(res.data.result ?? []);
      })
      .catch(() => {
        if (!cancelled) setDatasets([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDatasets(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof ReportParamValues>(
    field: K,
    v: ReportParamValues[K],
  ) => {
    const next = { ...local, [field]: v };
    setLocal(next);
    onChange(next);
  };

  const setText = (field: keyof ReportParamValues) => (v: string) =>
    set(field, v as never);

  // Multi-dataset selection: rows from every chosen dataset are merged
  // (UNION ALL) by the backend.  The first selection's table coordinates are
  // captured for display and the backend's run-time resolution fallback.
  const handleDatasetsChange = (rawIds: string | number[]) => {
    const ids = (Array.isArray(rawIds) ? rawIds : [rawIds])
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);
    const selected = datasets.find((d) => d.id === ids[0]) ?? null;
    const next: ReportParamValues = {
      ...local,
      datasource_ids: ids,
      datasource_id: ids[0] ?? "",
      table_name: selected?.table_name ?? "",
      schema: selected?.schema ?? "",
      database_name: selected?.database_name ?? "",
    };
    setLocal(next);
    onChange(next);
  };

  const datasetOptions = useMemo(
    () =>
      datasets.map((d) => (
        <MenuItem key={d.id} value={d.id}>
          {d.table_name ?? d.name}
        </MenuItem>
      )),
    [datasets],
  );

  const isWeekly = local.report_type === "weekly";

  return (
    <Box sx={{ pt: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        基本信息
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="report-type-label">报告类型 *</InputLabel>
            <Select
              labelId="report-type-label"
              label="报告类型 *"
              value={local.report_type}
              onChange={(e) => set("report_type", e.target.value)}
            >
              {REPORT_TYPE_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Field
          label="报告名称 *"
          value={local.name}
          onChange={setText("name")}
        />
        <Grid size={{ xs: 12 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="dataset-label">数据集（可多选）</InputLabel>
            <Select
              labelId="dataset-label"
              label="数据集（可多选）"
              multiple
              value={local.datasource_ids}
              onChange={(e) => handleDatasetsChange(e.target.value)}
              disabled={loadingDatasets}
              renderValue={(ids) => {
                const list = ids;
                if (list.length === 0) return <em>使用默认数据集</em>;
                // Selected datasets render as removable chips inside the
                // input (MUI multiple-select chip pattern).
                return (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {list.map((id) => (
                      <Chip
                        key={id}
                        size="small"
                        label={
                          datasets.find((d) => d.id === id)?.table_name ??
                          `数据集 #${id}`
                        }
                        onDelete={() =>
                          handleDatasetsChange(list.filter((v) => v !== id))
                        }
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    ))}
                  </Box>
                );
              }}
            >
              {loadingDatasets && (
                <MenuItem value="" disabled>
                  <CircularProgress size={16} />
                </MenuItem>
              )}
              {datasetOptions}
            </Select>
          </FormControl>
        </Grid>
        <Field
          label="Top N 项目数"
          value={local.top_projects_count}
          onChange={setText("top_projects_count")}
        />
        {isWeekly ? (
          <Field
            label="历史周数"
            value={local.weeks_of_history}
            onChange={setText("weeks_of_history")}
          />
        ) : (
          <Field
            label="历史天数"
            value={local.days_of_history}
            onChange={setText("days_of_history")}
          />
        )}
        <Field
          label="描述"
          value={local.description}
          onChange={setText("description")}
        />
      </Grid>

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        告警阈值
      </Typography>
      <Grid container spacing={2}>
        <Field
          label="紧急阈值 %"
          value={local.alert_critical_threshold}
          onChange={setText("alert_critical_threshold")}
        />
        <Field
          label="预警阈值 %"
          value={local.alert_warning_threshold}
          onChange={setText("alert_warning_threshold")}
        />
        <Field
          label="ROI 紧急线"
          value={local.roi_critical_line}
          onChange={setText("roi_critical_line")}
        />
        <Field
          label="ROI 预警线"
          value={local.roi_warning_line}
          onChange={setText("roi_warning_line")}
        />
      </Grid>
    </Box>
  );
}
