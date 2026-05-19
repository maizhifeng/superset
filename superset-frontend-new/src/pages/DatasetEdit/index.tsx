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
import TablePagination from "@mui/material/TablePagination";
import Checkbox from "@mui/material/Checkbox";
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
        setError(parseErrorMessage(err, "Failed to load dataset"));
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
      const payload: Record<string, unknown> = {
        table_name: f.table_name,
        description: f.description || null,
        sql: f.sql || null,
      };
      const modKeys = Object.keys(modifiedColumns);
      if (modKeys.length > 0 && dataset) {
        payload.columns = dataset.columns.map((col) => ({
          ...modifiedColumns[col.id],
          id: col.id,
          column_name: col.column_name,
        }));
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
      await api.put(`/dataset/${id}`, payload);
      setSuccess(true);
      setTimeout(() => navigate("/dataset/list"), 1200);
    } catch (err: unknown) {
      const msg = parseErrorMessage(err, "Save failed");
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
        fabLabel: "Add Metric",
        action: handleAddMetric,
        render: null,
      },
      {
        id: "save",
        priority: 30,
        showOnMobile: true,
        primary: true,
        fabIcon: <SaveIcon />,
        fabLabel: "Save",
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
          Dataset saved
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
          label="Table Name"
          value={form.table_name}
          onChange={(e) =>
            setForm((f) => ({ ...f, table_name: e.target.value }))
          }
          sx={{ flex: 2, minWidth: 180 }}
        />
        <TextField
          size="small"
          label="Description"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          sx={{ flex: 2, minWidth: 180 }}
        />
        <TextField
          size="small"
          label="Database Connection"
          value={`${dataset?.database.database_name} · ${dataset?.schema ?? "public"}`}
          slotProps={{ input: { readOnly: true } }}
          sx={{ flex: 1, minWidth: 180 }}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1.5, mt: 1.5 }}>
        {dataset?.kind !== "physical" && (
          <Card sx={{ flex: 3, minWidth: 0 }}>
            <CardHeader title="SQL" sx={cardHeaderSx} />
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
          </Card>
        )}

        {dataset &&
          (dataset.metrics.length > 0 || dataset.columns.length > 0) && (
            <Card
              sx={{ flex: dataset?.kind !== "physical" ? 7 : 1, minWidth: 0 }}
            >
              <CardHeader title={`Fields (${totalRows})`} sx={cardHeaderSx} />
              <CardContent sx={{ pt: 0 }}>
                <TableContainer
                  ref={columnsRef}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    maxHeight: "calc(100vh - 320px)",
                    overflowX: "auto",
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {[
                          "ID",
                          "Name",
                          "Kind",
                          "Type",
                          "Verbose Name",
                          "Expression",
                          "Description",
                          "Dashboard Filter",
                        ].map((h) => (
                          <TableCell
                            key={h}
                            sx={{
                              fontWeight: 700,
                              bgcolor: "grey.50",
                              fontSize: "0.75rem",
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
                          return (a.id || 0) - (b.id || 0);
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
                              {row.expression ?? ""}
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
                            <TableCell
                              sx={{ fontSize: "0.75rem", maxWidth: 200 }}
                            >
                              {row._kind === "column" &&
                                (() => {
                                  const colId = (
                                    row as typeof row & { id: number }
                                  ).id;
                                  const modified = modifiedColumns[colId];
                                  const currentExtra =
                                    modified?.extra ??
                                    (
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
                                        const newExtra = chk
                                          ? JSON.stringify({
                                              dashboard_filter: true,
                                            })
                                          : null;
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
                <TablePagination
                  component="div"
                  count={totalRows}
                  page={page}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[]}
                />
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
        <DialogTitle>Add Metric</DialogTitle>
        <DialogContent sx={{ "& > *": { mt: 1.5 } }}>
          <TextField
            size="small"
            label="Metric Name"
            fullWidth
            value={newMetric.metric_name}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, metric_name: e.target.value }))
            }
          />
          <TextField
            size="small"
            label="Expression"
            fullWidth
            value={newMetric.expression}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, expression: e.target.value }))
            }
            sx={{ mt: 1.5 }}
          />
          <TextField
            size="small"
            label="Verbose Name"
            fullWidth
            value={newMetric.verbose_name}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, verbose_name: e.target.value }))
            }
            sx={{ mt: 1.5 }}
          />
          <TextField
            size="small"
            label="Description"
            fullWidth
            value={newMetric.description}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, description: e.target.value }))
            }
            sx={{ mt: 1.5 }}
          />
          <TextField
            size="small"
            label="D3 Format"
            fullWidth
            value={newMetric.d3format}
            onChange={(e) =>
              setNewMetric((f) => ({ ...f, d3format: e.target.value }))
            }
            sx={{ mt: 1.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddMetricOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddMetricSubmit}
            disabled={
              !newMetric.metric_name.trim() || !newMetric.expression.trim()
            }
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
