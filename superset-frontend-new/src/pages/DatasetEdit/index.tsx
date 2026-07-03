import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import Snackbar from "@mui/material/Snackbar";
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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { DatasetMetric } from "@/types/api";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Checkbox from "@mui/material/Checkbox";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useToolbarStore } from "@/store/toolbarStore";
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
  interface ExtraConfig {
    profit_sharing?: { papp_name_column?: string; channel_name_column?: string };
    computed_columns?: { name: string; formula: string; type: string }[];
  }

  const [form, setForm] = useState({
    table_name: "",
    description: "",
    sql: "",
  });
  const [extraConfig, setExtraConfig] = useState<ExtraConfig>({});

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
        try {
          const parsed = JSON.parse(d.extra ?? "{}");
          setExtraConfig({
            profit_sharing: parsed.profit_sharing,
            computed_columns: parsed.computed_columns,
          });
        } catch {
          setExtraConfig({});
        }
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

      const extraStr =
        extraConfig.profit_sharing || (extraConfig.computed_columns?.length ?? 0) > 0
          ? JSON.stringify(extraConfig)
          : null;
      const payload: {
        table_name: string;
        description: string | null;
        sql: string | null;
        extra: string | null;
        columns?: { id?: number; column_name: string; type?: string; is_dttm?: boolean; expression?: string | null; extra?: string | null }[];
        metrics?: { id?: number; metric_name: string; expression: string; verbose_name: string | null; description: string | null; d3format: string | null }[];
      } = {
        table_name: f.table_name,
        description: f.description || null,
        sql: f.sql || null,
        extra: extraStr,
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
    }, [id, navigate, modifiedColumns, dataset, extraConfig]);

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
    ]);
    return () => unregisterTools("dataset_edit");
  }, [registerTools, unregisterTools, handleAddMetric]);

  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  if (error && !dataset)
    return (
    <Box sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      </Box>
    );

  const cardHeaderSx = {
    "& .MuiCardHeader-title": { fontSize: "0.8125rem", fontWeight: 600 },
  };

  return (
    <Box sx={{ flex: 1, p: 3, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
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
          mx: -3,
          mb: 2,
        }}
      >
        <IconButton
          size="small"
          onClick={() => navigate(-1)}
          sx={{ bgcolor: "grey.200", color: "text.primary" }}
        >
          <ArrowBackIcon sx={{ fontSize: 20 }} />
        </IconButton>
        <TextField
          placeholder="数据集名称..."
          value={form.table_name}
          onChange={(e) =>
            setForm((f) => ({ ...f, table_name: e.target.value }))
          }
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
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          size="small"
          startIcon={<SaveIcon />}
          onClick={handleSave}
        >
          保存
        </Button>
      </Box>

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

      {dataset && (
        <Card sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
              <Tab
                label="描述"
                sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
              />
              {dataset.kind !== "physical" && (
                <Tab
                  label="SQL"
                  sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
                />
              )}
              <Tab
                label="额外配置"
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
              <CardContent sx={{ pt: 2, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {tabValue === 0 && (
                  <TableContainer
                    ref={columnsRef}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                      flex: 1,
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
                      flex: 1,
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
                {(tabValue === 0 || tabValue === 1) && (
                  (tabValue === 0
                    ? dataset.columns.length > rowsPerPage
                    : dataset.metrics.length > rowsPerPage) && (
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
                ))}
                {tabValue === 2 && (
                  <Box sx={{ p: 1.5, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <TextField
                      size="small"
                      label="描述"
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      fullWidth
                      multiline
                      variant="outlined"
                      sx={{
                        flex: 1,
                        "& .MuiOutlinedInput-root": { height: "100%", display: "flex", flexDirection: "column" },
                        "& textarea": { flex: 1, overflow: "auto !important" },
                      }}
                    />
                  </Box>
                )}
                {tabValue === 3 && dataset?.kind !== "physical" && (
                  <Box sx={{ p: 1.5, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <TextField
                      size="small"
                      value={form.sql}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, sql: e.target.value }))
                      }
                      fullWidth
                      multiline
                      variant="outlined"
                      sx={{
                        flex: 1,
                        "& .MuiOutlinedInput-root": { height: "100%", display: "flex", flexDirection: "column" },
                        "& textarea": {
                          flex: 1,
                          overflow: "auto !important",
                          fontFamily: "monospace",
                          fontSize: "0.8125rem",
                          lineHeight: 1.5,
                        },
                      }}
                    />
                  </Box>
                )}
                {tabValue === (dataset?.kind !== "physical" ? 4 : 3) && (
                  <Box sx={{ p: 1.5, flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardHeader title="分成配置" sx={cardHeaderSx} />
                      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <TextField
                          size="small"
                          label="游戏名称列名 (papp_name_column)"
                          placeholder="例如 主游戏"
                          value={extraConfig.profit_sharing?.papp_name_column ?? ""}
                          onChange={(e) => {
                            setExtraConfig((prev) => ({
                              ...prev,
                              profit_sharing: {
                                ...(prev.profit_sharing ?? {}),
                                papp_name_column: e.target.value,
                              },
                            }));
                          }}
                        />
                        <TextField
                          size="small"
                          label="渠道名称列名 (channel_name_column)"
                          placeholder="例如 渠道商"
                          value={extraConfig.profit_sharing?.channel_name_column ?? ""}
                          onChange={(e) => {
                            setExtraConfig((prev) => ({
                              ...prev,
                              profit_sharing: {
                                ...(prev.profit_sharing ?? {}),
                                channel_name_column: e.target.value,
                              },
                            }));
                          }}
                        />
                      </CardContent>
                    </Card>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardHeader
                        title="计算列"
                        sx={cardHeaderSx}
                        action={
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={() => {
                              setExtraConfig((prev) => ({
                                ...prev,
                                computed_columns: [
                                  ...(prev.computed_columns ?? []),
                                  { name: "", formula: "", type: "float" },
                                ],
                              }));

                            }}
                          >
                            添加计算列
                          </Button>
                        }
                      />
                      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {(extraConfig.computed_columns ?? []).length === 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                            暂无计算列。点击"添加计算列"创建。
                          </Typography>
                        )}
                        {(extraConfig.computed_columns ?? []).map((cc, idx) => (
                          <Card
                            key={idx}
                            variant="outlined"
                            sx={{ borderRadius: 2, borderColor: "divider" }}
                          >
                            <CardContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                              <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                                <TextField
                                  size="small"
                                  label="名称"
                                  placeholder="例如 分成后成本"
                                  value={cc.name}
                                  onChange={(e) => {
                                    setExtraConfig((prev) => {
                                      const cols = [...(prev.computed_columns ?? [])];
                                      cols[idx] = { ...cols[idx], name: e.target.value };
                                      return { ...prev, computed_columns: cols };
                                    });

                                  }}
                                  sx={{ flex: 1 }}
                                />
                                <FormControl size="small" sx={{ minWidth: 100 }}>
                                  <InputLabel>类型</InputLabel>
                                  <Select
                                    value={cc.type}
                                    label="类型"
                                    onChange={(e) => {
                                      setExtraConfig((prev) => {
                                        const cols = [...(prev.computed_columns ?? [])];
                                        cols[idx] = { ...cols[idx], type: e.target.value };
                                        return { ...prev, computed_columns: cols };
                                      });

                                    }}
                                  >
                                    <MenuItem value="float">float</MenuItem>
                                    <MenuItem value="int">int</MenuItem>
                                    <MenuItem value="str">str</MenuItem>
                                  </Select>
                                </FormControl>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => {
                                    setExtraConfig((prev) => ({
                                      ...prev,
                                      computed_columns: (prev.computed_columns ?? []).filter(
                                        (_, i) => i !== idx,
                                      ),
                                    }));

                                  }}
                                  sx={{ mt: 0.5 }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>
                              <TextField
                                size="small"
                                label="公式"
                                placeholder="ad_real_cost * float(渠道商分成 or '100') / 100"
                                value={cc.formula}
                                onChange={(e) => {
                                  setExtraConfig((prev) => {
                                    const cols = [...(prev.computed_columns ?? [])];
                                    cols[idx] = { ...cols[idx], formula: e.target.value };
                                    return { ...prev, computed_columns: cols };
                                  });
                                }}
                                multiline
                                rows={2}
                                sx={{
                                  "& textarea": {
                                    fontFamily: "monospace",
                                    fontSize: "0.8125rem",
                                  },
                                }}
                              />
                              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ width: "100%", fontWeight: 600, fontSize: "0.7rem" }}>
                                  可用列:
                                </Typography>
                                {(dataset?.columns ?? [])
                                  .filter((c) => c.column_name && c.is_active !== false)
                                  .map((c) => (
                                    <Box
                                      key={c.column_name}
                                      component="span"
                                      onClick={() => {
                                        setExtraConfig((prev) => {
                                          const cols = [...(prev.computed_columns ?? [])];
                                          cols[idx] = { ...cols[idx], formula: cols[idx].formula + c.column_name };
                                          return { ...prev, computed_columns: cols };
                                        });
                                      }}
                                      sx={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 0.25,
                                        px: 0.5,
                                        py: 0.25,
                                        borderRadius: 0.5,
                                        bgcolor: "grey.100",
                                        fontSize: "0.65rem",
                                        cursor: "pointer",
                                        fontFamily: "monospace",
                                        border: "1px solid",
                                        borderColor: "divider",
                                        "&:hover": { bgcolor: "grey.200" },
                                      }}
                                    >
                                      {c.column_name}
                                      {c.verbose_name && c.verbose_name !== c.column_name && (
                                        <Typography component="span" variant="caption" sx={{ fontSize: "0.6rem", color: "text.secondary", ml: 0.25 }}>
                                          / {c.verbose_name}
                                        </Typography>
                                      )}
                                    </Box>
                                  ))}
                                {(dataset?.metrics ?? [])
                                  .filter((m) => m.metric_name && ["分成比例", "渠道分成", "渠道商分成", "研发分成", "IP分成", "分成方式", "上线时间"].includes(m.metric_name))
                                  .map((m) => (
                                    <Box
                                      key={m.metric_name}
                                      component="span"
                                      onClick={() => {
                                        setExtraConfig((prev) => {
                                          const cols = [...(prev.computed_columns ?? [])];
                                          cols[idx] = { ...cols[idx], formula: cols[idx].formula + m.metric_name };
                                          return { ...prev, computed_columns: cols };
                                        });
                                      }}
                                      sx={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 0.25,
                                        px: 0.5,
                                        py: 0.25,
                                        borderRadius: 0.5,
                                        bgcolor: "grey.100",
                                        color: "info.main",
                                        fontSize: "0.65rem",
                                        cursor: "pointer",
                                        fontFamily: "monospace",
                                        border: "1px solid",
                                        borderColor: "info.main",
                                        "&:hover": { bgcolor: "grey.200" },
                                      }}
                                    >
                                      {m.metric_name}
                                      {m.verbose_name && m.verbose_name !== m.metric_name && (
                                        <Typography component="span" variant="caption" sx={{ fontSize: "0.6rem", color: "text.secondary", ml: 0.25 }}>
                                          / {m.verbose_name}
                                        </Typography>
                                      )}
                                    </Box>
                                  ))}
                              </Box>
                            </CardContent>
                          </Card>
                        ))}
                      </CardContent>
                    </Card>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}
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
      {success && (
        <Snackbar open autoHideDuration={3000} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} onClose={() => setSuccess(false)}>
          <Alert severity="success" variant="filled" sx={{ borderRadius: 2 }} onClose={() => setSuccess(false)}>
            数据集已保存
          </Alert>
        </Snackbar>
      )}
      {error && (
        <Snackbar open autoHideDuration={6000} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} onClose={() => setError(null)}>
          <Alert severity="error" variant="filled" sx={{ borderRadius: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}
