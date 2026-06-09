import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import SaveIcon from "@mui/icons-material/Save";
import AddIcon from "@mui/icons-material/Add";
import type { DatasetMetric } from "@/types/api";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Checkbox from "@mui/material/Checkbox";
import Collapse from "@mui/material/Collapse";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useToolbarStore } from "@/contexts/ToolbarContext";
import PageSpeedDial from "@/components/PageSpeedDial";
import DateColumnDetector from "@/components/DateColumnDetector";
import { detectDateColumnsFromMeta } from "@/utils/dateHeuristics";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import api, { getDataset } from "@/api";
import type { DatasetDetail, DatasetColumn } from "@/types/api";

export default function DatasetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setCustom = useBreadcrumbStore((s) => s.setCustom);
  const { registerTools, unregisterTools } = useToolbarStore();
  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    table_name: "",
    description: "",
    sql: "",
  });
  const [detectedDateColumns, setDetectedDateColumns] = useState<
    {
      columnName: string;
      format: "YYYYMMDD" | "unix_seconds" | "unix_ms";
      confidence: number;
    }[]
  >([]);
  const [modifiedColumns, setModifiedColumns] = useState<
    Record<number, Partial<DatasetColumn>>
  >({});
  const [addMetricOpen, setAddMetricOpen] = useState(false);
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [newMetric, setNewMetric] = useState({
    metric_name: "",
    expression: "",
    verbose_name: "",
    description: "",
    d3format: "",
  });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getDataset<DatasetDetail>(id)
      .then((d) => {
        setDataset(d);
        setCustom({ label: `Edit: ${d.table_name}` });
        setForm({
          table_name: d.table_name,
          description: d.description ?? "",
          sql: d.sql ?? "",
        });
        setDetectedDateColumns(detectDateColumnsFromMeta(d.columns));
        setLoading(false);
      })
      .catch((err) => {
        setError(parseErrorMessage(err, "加载数据集失败"));
        setLoading(false);
      });
  }, [id, setCustom]);

  const formRef = useRef(form);
  formRef.current = form;
  const columnsRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const rowsPerPage = 50;

  const totalRows = dataset
    ? dataset.metrics.length + dataset.columns.length
    : 0;

  const handleSave = useCallback(async () => {
    if (!id) return;
    const f = formRef.current;
    setError(null);
    setSuccess(false);
    try {
      const sqlChanged = dataset && f.sql !== dataset.sql;
      const endpoint = sqlChanged
        ? `/dataset/${id}?override_columns=true`
        : `/dataset/${id}`;

      const payload: Record<string, unknown> = {
        table_name: f.table_name,
        description: f.description || null,
        sql: f.sql || null,
      };
      if (sqlChanged && dataset) {
        payload.columns = dataset.columns.map((col) => ({
          column_name: col.column_name,
          type: col.type,
          is_dttm: col.is_dttm,
          extra: col.extra,
        }));
      } else {
        const modKeys = Object.keys(modifiedColumns);
        if (modKeys.length > 0 && dataset) {
          payload.columns = dataset.columns.map((col) => ({
            ...(modifiedColumns[col.id] ?? {}),
            id: col.id,
            column_name: col.column_name,
            extra: modifiedColumns[col.id]?.extra ?? col.extra,
          }));
        }
      }
      if (dataset) {
        payload.metrics = dataset.metrics.map((m) => ({
          ...(m.id ? { id: m.id } : {}),
          metric_name: m.metric_name,
          expression: m.expression,
          verbose_name: m.verbose_name ?? null,
          description: m.description ?? null,
          d3format: m.d3format ?? null,
        }));
      }
      await api.put(endpoint, payload);
      setSuccess(true);
      setTimeout(() => navigate("/dataset/list"), 1200);
    } catch (err: unknown) {
      const msg = parseErrorMessage(err, "保存失败");
      setError(msg);
    }
  }, [id, navigate, modifiedColumns, dataset]);

  const handleAddMetric = useCallback(() => {
    setNewMetric({
      metric_name: "",
      expression: "",
      verbose_name: "",
      description: "",
      d3format: "",
    });
    setAddMetricOpen(true);
  }, []);

  const handleAddMetricSubmit = useCallback(() => {
    if (!newMetric.metric_name.trim() || !newMetric.expression.trim()) return;
    const added: DatasetMetric = {
      id: 0,
      metric_name: newMetric.metric_name.trim(),
      expression: newMetric.expression.trim(),
      verbose_name: newMetric.verbose_name.trim() || null,
      description: newMetric.description.trim() || null,
      d3format: newMetric.d3format.trim() || null,
      currency: null,
    };
    setDataset((prev) =>
      prev ? { ...prev, metrics: [...prev.metrics, added] } : prev,
    );
    setAddMetricOpen(false);
  }, [newMetric]);

  useEffect(() => {
    registerTools("dataset_edit", [
      {
        id: "add-metric",
        priority: 20,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "添加指标",
        action: handleAddMetric,
        render: null,
      },
      {
        id: "save",
        priority: 30,
        showOnMobile: true,
        primary: true,
        fabIcon: <SaveIcon />,
        fabLabel: "保存",
        action: handleSave,
        render: null,
      },
    ]);
    return () => unregisterTools("dataset_edit");
  }, [registerTools, unregisterTools, handleSave, handleAddMetric]);

  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  if (error && !dataset)
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      </Box>
    );

  const cardHeaderSx = {
    "& .MuiCardHeader-title": { fontSize: "0.8125rem", fontWeight: 600 },
  };

  return (
    <Box sx={{ p: 3 }}>
      {success && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
          数据集已保存
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {detectedDateColumns.length > 0 && id && (
        <Box sx={{ mb: 2 }}>
          <DateColumnDetector
            datasetId={Number(id)}
            detectedColumns={detectedDateColumns}
            onColumnCreated={() => {
              getDataset<DatasetDetail>(id)
                .then((d) => {
                  setDataset(d);
                  setDetectedDateColumns(detectDateColumnsFromMeta(d.columns));
                })
                .catch(() => {});
            }}
            onDismiss={() => setDetectedDateColumns([])}
          />
        </Box>
      )}

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <TextField
          size="small"
          label="表名称"
          value={form.table_name}
          onChange={(e) =>
            setForm((f) => ({ ...f, table_name: e.target.value }))
          }
          sx={{ flex: 2, minWidth: 180 }}
        />
        <TextField
          size="small"
          label="描述"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          sx={{ flex: 2, minWidth: 180 }}
        />
        <TextField
          size="small"
          label="数据库连接"
          value={`${dataset?.database.database_name} · ${dataset?.schema ?? "public"}`}
          slotProps={{ input: { readOnly: true } }}
          sx={{ flex: 1, minWidth: 180 }}
        />
      </Box>

      <Box sx={{ mt: 1.5 }}>
        {dataset?.kind !== "physical" && (
          <Card
            sx={{
              mb: 1.5,
              "& .MuiCardHeader-action": { alignSelf: "center", mr: 1 },
            }}
          >
            <CardHeader
              title="SQL"
              sx={cardHeaderSx}
              action={
                <IconButton
                  size="small"
                  onClick={() => setSqlExpanded((p) => !p)}
                >
                  {sqlExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              }
            />
            <Collapse in={sqlExpanded}>
              <CardContent sx={{ pt: 0 }}>
                <TextField
                  size="small"
                  value={form.sql}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sql: e.target.value }))
                  }
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={6}
                  sx={{
                    "& textarea": {
                      fontFamily: "monospace",
                      fontSize: "0.8125rem",
                      lineHeight: 1.5,
                    },
                  }}
                />
              </CardContent>
            </Collapse>
          </Card>
        )}

        {dataset &&
          (dataset.metrics.length > 0 || dataset.columns.length > 0) && (
            <Card sx={{ mt: 1.5 }}>
              <CardHeader title={`字段 (${totalRows})`} sx={cardHeaderSx} />
              <CardContent sx={{ pt: 0 }}>
                <TableContainer
                  ref={columnsRef}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    maxHeight: "calc(100vh - 370px)",
                    overflow: "auto",
                  }}
                >
                  <Table size="small" stickyHeader sx={{ tableLayout: "fixed" }}>
                    <TableHead>
                      <TableRow>
                        {[
                          ["ID", "6%"],
                          ["名称", "12%"],
                          ["类型", "6%"],
                          ["数据类型", "8%"],
                          ["显示名称", "10%"],
                          ["表达式", "22%"],
                          ["描述", "18%"],
                          ["is_dttm", "6%"],
                          ["仪表板筛选", "6%"],
                        ].map(([h, w]) => (
                          <TableCell
                            key={h}
                            sx={{
                              fontWeight: 700,
                              bgcolor: "grey.50",
                              fontSize: "0.75rem",
                              width: w,
                              py: 1,
                            }}
                          >
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[
                        ...dataset.metrics.map((m) => ({
                          ...m,
                          _kind: "metric" as const,
                        })),
                        ...dataset.columns.map((c) => ({
                          ...c,
                          _kind: "column" as const,
                          _type: c.type || "—",
                        })),
                      ]
                        .sort((a, b) => {
                          if (a._kind !== b._kind)
                            return a._kind === "metric" ? -1 : 1;
                          const aExpr = !!(
                            a as typeof a & { expression?: string | null }
                          ).expression;
                          const bExpr = !!(
                            b as typeof b & { expression?: string | null }
                          ).expression;
                          if (aExpr !== bExpr) return aExpr ? -1 : 1;
                          const aName =
                            a._kind === "metric"
                              ? (a as typeof a & { metric_name: string }).metric_name
                              : (a as typeof a & { column_name: string }).column_name;
                          const bName =
                            b._kind === "metric"
                              ? (b as typeof b & { metric_name: string }).metric_name
                              : (b as typeof b & { column_name: string }).column_name;
                          return (aName || "").localeCompare(bName || "");
                        })
                        .slice(page * rowsPerPage, (page + 1) * rowsPerPage)
                        .map((row) => (
                          <TableRow
                            key={`${row._kind}-${row.id}`}
                            hover
                            sx={{ "&:last-child td": { border: 0 } }}
                          >
                            <TableCell
                              sx={{
                                fontSize: "0.75rem",
                                color: "text.secondary",
                              }}
                            >
                              {row.id ?? "—"}
                            </TableCell>
                            <TableCell
                              sx={{ fontSize: "0.75rem", fontWeight: 500 }}
                            >
                              {row._kind === "metric"
                                ? (row as typeof row & { metric_name: string })
                                    .metric_name
                                : (row as typeof row & { column_name: string })
                                    .column_name}
                            </TableCell>
                            <TableCell sx={{ fontSize: "0.75rem" }}>
                              <Chip
                                label={row._kind}
                                size="small"
                                color={
                                  row._kind === "metric" ? "primary" : "default"
                                }
                                variant="outlined"
                                sx={{ height: 20, fontSize: "0.75rem" }}
                              />
                            </TableCell>
                            <TableCell sx={{ fontSize: "0.75rem" }}>
                              {row._kind === "column" ? (
                                <Chip
                                  label={
                                    (row as typeof row & { _type: string })
                                      ._type
                                  }
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    height: 20,
                                    fontSize: "0.75rem",
                                    maxWidth: 100,
                                  }}
                                />
                              ) : (
                                ((row as typeof row & { d3format?: string })
                                  .d3format ?? "")
                              )}
                            </TableCell>
                            <TableCell sx={{ fontSize: "0.75rem" }}>
                              {row.verbose_name ?? ""}
                            </TableCell>
                            <TableCell
                              sx={{
                                fontSize: "0.75rem",
                                fontFamily: "monospace",
                                maxWidth: 250,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <Tooltip
                                title={<Typography sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{row.expression ?? ""}</Typography>}
                                placement="bottom-start"
                                slotProps={{ popper: { sx: { '& .MuiTooltip-tooltip': { maxWidth: 600 } } } }}
                              >
                                <span>{row.expression ?? ""}</span>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              sx={{
                                fontSize: "0.75rem",
                                maxWidth: 200,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {row.description ?? ""}
                            </TableCell>
                            <TableCell sx={{ fontSize: "0.75rem", textAlign: "center" }}>
                              {row._kind === "column" && (() => {
                                const colId = (
                                  row as typeof row & { id: number }
                                ).id;
                                const modified = modifiedColumns[colId];
                                const checked =
                                  modified?.is_dttm ??
                                  !!(row as typeof row & { is_dttm: boolean }).is_dttm;
                                return (
                                  <Checkbox
                                    size="small"
                                    checked={checked}
                                    onChange={(_, chk) => {
                                      setModifiedColumns((prev) => ({
                                        ...prev,
                                        [colId]: {
                                          ...prev[colId],
                                          is_dttm: chk,
                                        },
                                      }));
                                    }}
                                    sx={{ p: 0.25 }}
                                  />
                                );
                              })()}
                            </TableCell>
                            <TableCell
                              sx={{ fontSize: "0.75rem", maxWidth: 200 }}
                            >
                              {row._kind === "column" &&
                                (() => {
                                  const colId = (
                                    row as typeof row & { id: number }
                                  ).id;
                                  const hasMod =
                                    Object.prototype.hasOwnProperty.call(
                                      modifiedColumns,
                                      colId,
                                    );
                                  const modified = modifiedColumns[colId];
                                  const currentExtra = hasMod
                                    ? modified?.extra ?? null
                                    : (
                                        row as typeof row & {
                                          extra?: string | null;
                                        }
                                      ).extra;
                                  let parsed: Record<string, unknown> = {};
                                  try {
                                    parsed = currentExtra
                                      ? JSON.parse(currentExtra)
                                      : {};
                                  } catch {
                                    /* ignore */
                                  }
                                  const checked =
                                    parsed.dashboard_filter === true;
                                  return (
                                    <Checkbox
                                      size="small"
                                      checked={checked}
                                      onChange={(_, chk) => {
                                        const newExtra = JSON.stringify({
                                          ...parsed,
                                          dashboard_filter: chk,
                                        });
                                        setModifiedColumns((prev) => ({
                                          ...prev,
                                          [colId]: {
                                            ...prev[colId],
                                            extra: newExtra,
                                          },
                                        }));
                                      }}
                                      sx={{ p: 0.25 }}
                                    />
                                  );
                                })()}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    py: 0.75,
                    px: 2,
                    borderTop: "1px solid",
                    borderColor: "divider",
                    bgcolor: "grey.50",
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: "0.75rem" }}
                  >
                    {page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, totalRows)} of {totalRows}
                  </Typography>
                  <IconButton
                    size="small"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    sx={{ ml: 1 }}
                  >
                    <ChevronLeftIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={(page + 1) * rowsPerPage >= totalRows}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRightIcon fontSize="small" />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          )}
      </Box>
      <PageSpeedDial pageKeys="dataset_edit" />
      <Dialog
        open={addMetricOpen}
        onClose={() => setAddMetricOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>添加指标</DialogTitle>
        <DialogContent sx={{ "& > *": { mt: 1.5 } }}>
          <TextField
            size="small"
            label="指标名称"
            fullWidth
            value={newMetric.metric_name}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, metric_name: e.target.value }))
            }
          />
          <TextField
            size="small"
            label="表达式"
            fullWidth
            value={newMetric.expression}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, expression: e.target.value }))
            }
            sx={{ mt: 1.5 }}
          />
          <TextField
            size="small"
            label="显示名称"
            fullWidth
            value={newMetric.verbose_name}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, verbose_name: e.target.value }))
            }
            sx={{ mt: 1.5 }}
          />
          <TextField
            size="small"
            label="描述"
            fullWidth
            value={newMetric.description}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, description: e.target.value }))
            }
            sx={{ mt: 1.5 }}
          />
          <TextField
            size="small"
            label="D3 格式"
            fullWidth
            value={newMetric.d3format}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, d3format: e.target.value }))
            }
            sx={{ mt: 1.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddMetricOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleAddMetricSubmit}
            disabled={
              !newMetric.metric_name.trim() || !newMetric.expression.trim()
            }
          >
            添加
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
