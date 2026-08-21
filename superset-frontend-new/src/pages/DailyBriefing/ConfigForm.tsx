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
import CircularProgress from "@mui/material/CircularProgress";
import api from "@/api";
import type { ReportParamValues } from "./params";

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
      .get<{ result: DatasetOption[] }>("/daily-report/datasets")
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

  const set = (field: keyof ReportParamValues) => (v: string) => {
    const next = { ...local, [field]: v };
    setLocal(next);
    onChange(next);
  };

  // Selecting a dataset also captures its table/schema/database coordinates so
  // the backend can resolve the datasource at run time.
  const handleDatasetChange = (rawId: string | number) => {
    const id = rawId === "" ? "" : Number(rawId);
    const selected = datasets.find((d) => d.id === id) ?? null;
    const next: ReportParamValues = {
      ...local,
      datasource_id: id,
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

  return (
    <Box sx={{ pt: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        基本信息
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="dataset-label">数据集 *</InputLabel>
            <Select
              labelId="dataset-label"
              label="数据集 *"
              value={local.datasource_id}
              onChange={(e) => handleDatasetChange(e.target.value)}
              disabled={loadingDatasets}
            >
              {loadingDatasets && (
                <MenuItem value="" disabled>
                  <CircularProgress size={16} />
                </MenuItem>
              )}
              <MenuItem value="">
                <em>使用默认数据集</em>
              </MenuItem>
              {datasetOptions}
            </Select>
          </FormControl>
        </Grid>
        <Field label="报告名称 *" value={local.name} onChange={set("name")} />
        <Field
          label="Top N 项目数"
          value={local.top_projects_count}
          onChange={set("top_projects_count")}
        />
        <Field
          label="历史天数"
          value={local.days_of_history}
          onChange={set("days_of_history")}
        />
        <Field
          label="描述"
          value={local.description}
          onChange={set("description")}
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
          onChange={set("alert_critical_threshold")}
        />
        <Field
          label="预警阈值 %"
          value={local.alert_warning_threshold}
          onChange={set("alert_warning_threshold")}
        />
        <Field
          label="ROI 紧急线"
          value={local.roi_critical_line}
          onChange={set("roi_critical_line")}
        />
        <Field
          label="ROI 预警线"
          value={local.roi_warning_line}
          onChange={set("roi_warning_line")}
        />
      </Grid>
    </Box>
  );
}
