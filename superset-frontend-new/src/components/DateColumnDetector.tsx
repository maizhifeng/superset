import { useState } from "react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import EventNoteIcon from "@mui/icons-material/EventNote";
import CodeIcon from "@mui/icons-material/Code";
import api, { getDataset } from "@/api";
import { useNotificationStore } from "@/store/notificationStore";
import type { DateColumnInfo } from "@/utils/dateHeuristics";
import { generateDateExpression } from "@/utils/dateHeuristics";

interface DateColumnDetectorProps {
  datasetId: number;
  detectedColumns: DateColumnInfo[];
  onColumnCreated: () => void;
  onDismiss: () => void;
}

export default function DateColumnDetector({
  datasetId,
  detectedColumns,
  onColumnCreated,
  onDismiss,
}: DateColumnDetectorProps) {
  const [creating, setCreating] = useState(false);
  const [createdNames, setCreatedNames] = useState<Set<string>>(new Set());
  const notify = useNotificationStore((s) => s.notify);

  if (detectedColumns.length === 0) return null;

  const pending = detectedColumns.filter(
    (c) => !createdNames.has(c.columnName),
  );
  if (pending.length === 0) return null;

  const target = pending[0];
  const newColName = `${target.columnName}_calc`;
  const expression = generateDateExpression(target.columnName, target.format);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const dataset = await getDataset<{
        columns: { column_name?: string }[];
        metrics: {
          id?: number | null;
          metric_name?: string;
          expression?: string;
          description?: string | null;
          verbose_name?: string | null;
          uuid?: string | null;
        }[];
      }>(datasetId);
      const existingCols = dataset.columns ?? [];

      const existingNames = new Set(
        existingCols.map((c: { column_name?: string }) => c.column_name),
      );
      if (existingNames.has(newColName)) {
        setCreatedNames((prev) => new Set(prev).add(target.columnName));
        notify({
          severity: "info",
          message: `列 "${newColName}" 已存在`,
        });
        onColumnCreated();
        setCreating(false);
        return;
      }

      const pythonDateFormat =
        target.format === "YYYYMMDD"
          ? "%Y-%m-%d"
          : target.format === "unix_ms"
            ? "epoch_ms"
            : "epoch_s";

      const newColumn = {
        column_name: newColName,
        type: "DATE",
        expression,
        is_dttm: true,
        groupby: true,
        filterable: true,
        is_active: true,
        python_date_format: pythonDateFormat,
        description: `自动解析日期从 ${target.columnName} (${target.format})`,
      };

      const columnsPayload = [
        ...existingCols.map(
          (col: {
            id?: number | null;
            column_name?: string;
            type?: string | null;
            expression?: string | null;
            is_dttm?: boolean | null;
            groupby?: boolean | null;
            filterable?: boolean | null;
            is_active?: boolean | null;
            description?: string | null;
            python_date_format?: string | null;
            uuid?: string | null;
          }) => ({
            id: col.id ?? undefined,
            column_name: col.column_name,
            type: col.type ?? null,
            expression: col.expression ?? null,
            is_dttm: col.is_dttm ?? false,
            groupby: col.groupby ?? true,
            filterable: col.filterable ?? true,
            is_active: col.is_active ?? true,
            description: col.description ?? null,
            python_date_format: col.python_date_format ?? null,
            uuid: col.uuid ?? null,
          }),
        ),
        newColumn,
      ];

      await api.put(`/dataset/${datasetId}`, {
        columns: columnsPayload,
        metrics: (dataset.metrics ?? []).map(
          (m: {
            id?: number | null;
            metric_name?: string;
            expression?: string;
            description?: string | null;
            verbose_name?: string | null;
            uuid?: string | null;
          }) => ({
            id: m.id ?? undefined,
            metric_name: m.metric_name,
            expression: m.expression,
            description: m.description ?? null,
            verbose_name: m.verbose_name ?? null,
            uuid: m.uuid ?? null,
          }),
        ),
      });

      setCreatedNames((prev) => new Set(prev).add(target.columnName));
      notify({
        severity: "success",
        message: `计算列 "${newColName}" 已创建`,
      });
      onColumnCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建计算列失败";
      notify({ severity: "error", message: msg });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {pending.map((col) => {
        const cn = `${col.columnName}_calc`;
        const expr = generateDateExpression(col.columnName, col.format);
        return (
          <Alert
            key={col.columnName}
            severity="info"
            icon={<EventNoteIcon />}
            sx={{ "& .MuiAlert-message": { width: "100%" } }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  检测到日期列：{col.columnName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Format: {col.format} &middot; Confidence:{" "}
                  {Math.round(col.confidence * 100)}%
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    mt: 0.5,
                    bgcolor: "grey.50",
                    p: 0.5,
                    borderRadius: 1,
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    color: "text.secondary",
                  }}
                >
                  <CodeIcon sx={{ fontSize: 12 }} />
                  {cn}: {expr}
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={creating}
                  onClick={() => void handleCreate()}
                >
                  {creating ? (
                    <CircularProgress size={14} sx={{ mr: 0.5 }} />
                  ) : null}
                  创建
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={creating}
                  onClick={onDismiss}
                >
                  跳过
                </Button>
              </Box>
            </Box>
          </Alert>
        );
      })}
    </Box>
  );
}
