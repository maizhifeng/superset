import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import SaveIcon from "@mui/icons-material/Save";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
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
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
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
  const [editMetricOpen, setEditMetricOpen] = useState(false);
  const [editMetric, setEditMetric] = useState<DatasetMetric | null>(null);
  const [tabValue, setTabValue] = useState(0);
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

  const handleEditMetric = useCallback((metric: DatasetMetric) => {
    setEditMetric(metric);
    setEditMetricOpen(true);
  }, []);

  const handleEditMetricSubmit = useCallback(() => {
    if (!editMetric || !editMetric.metric_name.trim() || !editMetric.expression.trim()) return;
    setDataset((prev) =>
      prev
        ? {
            ...prev,
            metrics: prev.metrics.map((m) =>
              m.id === editMetric.id ? editMetric : m,
            ),
          }
        : prev,
    );
    setEditMetricOpen(false);
    setEditMetric(null);
  }, [editMetric]);

  const handleDeleteMetric = useCallback((target: DatasetMetric) => {
    setDataset((prev) =>
      prev
        ? {
            ...prev,
            metrics: prev.metrics.filter((m) => m.id !== target.id),
          }
        : prev,
    );
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
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: 1,
                  borderColor: "divider",
                  px: 2,
                  minHeight: 48,
                }}
              >
                <Tabs
                  value={tabValue}
                  onChange={(_, v) => {
                    setTabValue(v);
                    setPage(0);
                  }}
                >
                  <Tab
                    label={`数据列 (${dataset.columns.length})`}
                    sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
                  />
                  <Tab
                    label={`指标 (${dataset.metrics.length})`}
                    sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
                  />
                </Tabs>
                {tabValue === 1 && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddMetric}
                  >
                    添加指标
                  </Button>
                )}
              </Box>
              <CardContent sx={{ pt: 2 }}>
                {tabValue === 0 && (
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
                            ["名称", "22%"],
                            ["数据类型", "14%"],
                            ["描述", "30%"],
                            ["is_dttm", "17%", "center"],
                            ["仪表板筛选", "17%", "center"],
                          ].map(([h, w, align]) => (
                            <TableCell
                              key={h}
                              sx={{
                                fontWeight: 700,
                                bgcolor: "grey.50",
                                fontSize: "0.75rem",
                                width: w,
                                py: 1,
                                textAlign: align,
                              }}
                            >
                              {h}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dataset.columns
                          .sort((a, b) =>
                            (a.column_name || "").localeCompare(b.column_name || "")
                          )
                          .slice(page * rowsPerPage, (page + 1) * rowsPerPage)
                          .map((col) => (
                            <TableRow
                              key={col.id}
                              hover
                              sx={{ "&:last-child td": { border: 0 } }}
                            >
                              <TableCell
                                sx={{ fontSize: "0.75rem", fontWeight: 500 }}
                              >
                                {col.column_name}
                              </TableCell>
                              <TableCell sx={{ fontSize: "0.75rem" }}>
                                <Chip
                                  label={col.type || "—"}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    height: 20,
                                    fontSize: "0.75rem",
                                    maxWidth: 120,
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ fontSize: "0.75rem" }}>
                                {col.description ?? ""}
                              </TableCell>
                              <TableCell sx={{ fontSize: "0.75rem", textAlign: "center" }}>
                                {(() => {
                                  const colId = col.id;
                                  const modified = modifiedColumns[colId];
                                  const checked =
                                    modified?.is_dttm ?? !!col.is_dttm;
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
                              <TableCell sx={{ fontSize: "0.75rem", textAlign: "center" }}>
                                {(() => {
                                  const colId = col.id;
                                  const hasMod = Object.prototype.hasOwnProperty.call(
                                    modifiedColumns, colId,
                                  );
                                  const modified = modifiedColumns[colId];
                                  const currentExtra = hasMod
                                    ? modified?.extra ?? null
                                    : col.extra;
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
                )}
                {tabValue === 1 && (
                  <TableContainer
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
                            ["名称", "12%"],
                            ["表达式", "36%"],
                            ["显示名称", "10%"],
                            ["描述", "20%"],
                            ["D3 格式", "8%"],
                            ["操作", "14%", "center"],
                          ].map(([h, w, align]) => (
                            <TableCell
                              key={h}
                              sx={{
                                fontWeight: 700,
                                bgcolor: "grey.50",
                                fontSize: "0.75rem",
                                width: w,
                                py: 1,
                                textAlign: align,
                              }}
                            >
                              {h}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dataset.metrics
                          .sort((a, b) =>
                            (a.metric_name || "").localeCompare(b.metric_name || "")
                          )
                          .slice(page * rowsPerPage, (page + 1) * rowsPerPage)
                          .map((m) => (
                            <TableRow
                              key={m.id}
                              hover
                              sx={{ "&:last-child td": { border: 0 } }}
                            >
                              <TableCell
                                sx={{ fontSize: "0.75rem", fontWeight: 500 }}
                              >
                                {m.metric_name}
                              </TableCell>
                              <TableCell
                                sx={{
                                  fontSize: "0.75rem",
                                  fontFamily: "monospace",
                                  maxWidth: 350,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <Tooltip
                                  title={<Typography sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{m.expression}</Typography>}
                                  placement="bottom-start"
                                  slotProps={{ popper: { sx: { '& .MuiTooltip-tooltip': { maxWidth: 600 } } } }}
                                >
                                  <span>{m.expression}</span>
                                </Tooltip>
                              </TableCell>
                              <TableCell sx={{ fontSize: "0.75rem" }}>
                                {m.verbose_name ?? ""}
                              </TableCell>
                              <TableCell sx={{ fontSize: "0.75rem" }}>
                                {m.description ?? ""}
                              </TableCell>
                              <TableCell sx={{ fontSize: "0.75rem" }}>
                                {m.d3format ?? ""}
                              </TableCell>
                              <TableCell
                                sx={{
                                  fontSize: "0.75rem",
                                  whiteSpace: "nowrap",
                                  textAlign: "center",
                                  px: 0.5,
                                }}
                              >
                                <IconButton
                                  size="small"
                                  onClick={() => handleEditMetric(m)}
                                  sx={{ p: 0.25 }}
                                >
                                  <EditIcon fontSize="inherit" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteMetric(m)}
                                  sx={{ p: 0.25, color: "error.main" }}
                                >
                                  <DeleteIcon fontSize="inherit" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
                {tabValue === 0
                  ? dataset.columns.length > rowsPerPage
                  : dataset.metrics.length > rowsPerPage && (
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
                      {page * rowsPerPage + 1}–
                      {Math.min(
                        (page + 1) * rowsPerPage,
                        tabValue === 0
                          ? dataset.columns.length
                          : dataset.metrics.length,
                      )}{" "}
                      of{" "}
                      {tabValue === 0
                        ? dataset.columns.length
                        : dataset.metrics.length}
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
                      disabled={
                        (page + 1) * rowsPerPage >=
                        (tabValue === 0
                          ? dataset.columns.length
                          : dataset.metrics.length)
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRightIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}
      </Box>
      <PageSpeedDial pageKeys="dataset_edit" />
      <Drawer
        open={addMetricOpen}
        onClose={() => setAddMetricOpen(false)}
        variant="temporary"
        anchor="right"
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100vw", sm: 480 },
              height: "100vh",
              borderRight: "none",
              borderTopLeftRadius: 12,
              borderBottomLeftRadius: 12,
            },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="h6">添加指标</Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                <CardHeader title="基本信息" sx={cardHeaderSx} />
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <TextField
                    size="small"
                    label="指标名称"
                    fullWidth
                    autoFocus
                    value={newMetric.metric_name}
                    onChange={(e) =>
                      setNewMetric((f) => ({ ...f, metric_name: e.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="表达式"
                    fullWidth
                    multiline
                    rows={4}
                    value={newMetric.expression}
                    onChange={(e) =>
                      setNewMetric((f) => ({ ...f, expression: e.target.value }))
                    }
                  />
                </CardContent>
              </Card>
              <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                <CardHeader title="可选配置" sx={cardHeaderSx} />
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <TextField
                    size="small"
                    label="显示名称"
                    fullWidth
                    value={newMetric.verbose_name}
                    onChange={(e) =>
                      setNewMetric((f) => ({ ...f, verbose_name: e.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="描述"
                    fullWidth
                    value={newMetric.description}
                    onChange={(e) =>
                      setNewMetric((f) => ({ ...f, description: e.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="D3 格式"
                    fullWidth
                    placeholder="例如 .1%"
                    value={newMetric.d3format}
                    onChange={(e) =>
                      setNewMetric((f) => ({ ...f, d3format: e.target.value }))
                    }
                  />
                </CardContent>
              </Card>
            </Box>
          </Box>
          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              justifyContent: "flex-end",
              gap: 1,
            }}
          >
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
          </Box>
        </Box>
      </Drawer>
      <Drawer
        open={editMetricOpen}
        onClose={() => setEditMetricOpen(false)}
        variant="temporary"
        anchor="right"
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100vw", sm: 480 },
              height: "100vh",
              borderRight: "none",
              borderTopLeftRadius: 12,
              borderBottomLeftRadius: 12,
            },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="h6">编辑指标</Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                <CardHeader title="基本信息" sx={cardHeaderSx} />
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <TextField
                    size="small"
                    label="指标名称"
                    fullWidth
                    autoFocus
                    value={editMetric?.metric_name ?? ""}
                    onChange={(e) =>
                      setEditMetric((prev) =>
                        prev ? { ...prev, metric_name: e.target.value } : prev,
                      )
                    }
                  />
                  <TextField
                    size="small"
                    label="表达式"
                    fullWidth
                    multiline
                    rows={4}
                    value={editMetric?.expression ?? ""}
                    onChange={(e) =>
                      setEditMetric((prev) =>
                        prev ? { ...prev, expression: e.target.value } : prev,
                      )
                    }
                  />
                </CardContent>
              </Card>
              <Card elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                <CardHeader title="可选配置" sx={cardHeaderSx} />
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <TextField
                    size="small"
                    label="显示名称"
                    fullWidth
                    value={editMetric?.verbose_name ?? ""}
                    onChange={(e) =>
                      setEditMetric((prev) =>
                        prev ? { ...prev, verbose_name: e.target.value } : prev,
                      )
                    }
                  />
                  <TextField
                    size="small"
                    label="描述"
                    fullWidth
                    value={editMetric?.description ?? ""}
                    onChange={(e) =>
                      setEditMetric((prev) =>
                        prev ? { ...prev, description: e.target.value } : prev,
                      )
                    }
                  />
                  <TextField
                    size="small"
                    label="D3 格式"
                    fullWidth
                    placeholder="例如 .1%"
                    value={editMetric?.d3format ?? ""}
                    onChange={(e) =>
                      setEditMetric((prev) =>
                        prev ? { ...prev, d3format: e.target.value } : prev,
                      )
                    }
                  />
                </CardContent>
              </Card>
            </Box>
          </Box>
          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              borderTop: 1,
              borderColor: "divider",
              display: "flex",
              justifyContent: "flex-end",
              gap: 1,
            }}
          >
            <Button onClick={() => setEditMetricOpen(false)}>取消</Button>
            <Button
              variant="contained"
              onClick={handleEditMetricSubmit}
              disabled={
                !editMetric?.metric_name.trim() ||
                !editMetric?.expression.trim()
              }
            >
              保存
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
