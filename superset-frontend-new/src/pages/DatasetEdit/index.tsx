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
import Menu from "@mui/material/Menu";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CodeIcon from "@mui/icons-material/Code";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import FunctionsIcon from "@mui/icons-material/Functions";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useToolbarStore } from "@/store/toolbarStore";
import DateColumnDetector from "@/components/DateColumnDetector";
import { ConfirmModal } from "@/superset-ui-mui/components";
import SqlQueryEditor from "@/components/SqlQueryEditor";
import { formatSqlText } from "@/utils/sqlFormat";
import { detectDateColumnsFromMeta } from "@/utils/dateHeuristics";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import api, { getDataset } from "@/api";
import type { DatasetDetail, DatasetColumn } from "@/types/api";

export default function DatasetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setCustom = useBreadcrumbStore((s) => s.setCustom);
  const notify = useNotificationStore((s) => s.notify);
  const { registerTools, unregisterTools } = useToolbarStore();
  /** 复制当前数据集的 ID 到剪贴板。 */
  const handleCopyId = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      notify({ severity: "success", message: `已复制数据集 ID ${id}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制可用的查询：物理表生成 SELECT *，虚拟表复制其封装 SQL。 */
  const handleCopySql = async () => {
    if (!dataset) return;
    const table = dataset.schema
      ? `${dataset.schema}.${dataset.table_name}`
      : dataset.table_name;
    const sql =
      dataset.kind === "virtual" && dataset.sql
        ? dataset.sql
        : `SELECT * FROM ${table};`;
    try {
      await navigator.clipboard.writeText(sql);
      notify({ severity: "success", message: "已复制查询 SQL" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  /** 复制数据集的全部列名（每行一个）。 */
  const handleCopyColumnNames = async () => {
    if (!dataset) return;
    const names = dataset.columns.map((c) => c.column_name);
    if (names.length === 0) {
      notify({ severity: "warning", message: "该数据集暂无列" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      notify({ severity: "success", message: `已复制 ${names.length} 个列名` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制数据集的全部指标名（每行一个）。 */
  const handleCopyAllMetricNames = async () => {
    if (!dataset) return;
    const names = dataset.metrics.map((m) => m.metric_name).filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "该数据集暂无指标" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      notify({
        severity: "success",
        message: `已复制 ${names.length} 个指标名`,
      });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制某个指标的算式。 */
  const handleCopyMetricFormula = async (metric: DatasetMetric) => {
    try {
      await navigator.clipboard.writeText(metric.expression ?? "");
      notify({
        severity: "success",
        message: `已复制指标"${metric.metric_name}"的算式`,
      });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制某个列的列名。 */
  const handleCopyColumnName = async (name: string, type?: string) => {
    if (!name) return;
    try {
      await navigator.clipboard.writeText(type ? `${name} (${type})` : name);
      notify({ severity: "success", message: `已复制列名 ${name}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  interface ExtraConfig {
    profit_sharing?: {
      papp_name_column?: string;
      channel_name_column?: string;
    };
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
  const [metricError, setMetricError] = useState<string | null>(null);
  const [columnSearch, setColumnSearch] = useState("");
  const [resetSqlConfirmOpen, setResetSqlConfirmOpen] = useState(false);
  const [copyMenuAnchor, setCopyMenuAnchor] = useState<HTMLElement | null>(
    null,
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getDataset<DatasetDetail>(id)
      .then((d) => {
        setDataset(d);
        setCustom({ label: `编辑：${d.table_name}` });
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
  const backend = dataset?.database?.backend;
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

      const extraObj: Record<string, any> = { ...extraConfig };
      try {
        const oldExtra = JSON.parse(dataset?.extra ?? "{}");
        if (oldExtra.federated) {
          extraObj.federated = oldExtra.federated;
        }
      } catch {
        /* keep extraConfig as-is */
      }
      const extraStr =
        Object.keys(extraObj).length > 0 ? JSON.stringify(extraObj) : null;
      const payload: {
        table_name: string;
        description: string | null;
        sql: string | null;
        extra: string | null;
        columns?: {
          id?: number;
          column_name: string;
          type?: string;
          is_dttm?: boolean;
          expression?: string | null;
          extra?: string | null;
        }[];
        metrics?: {
          id?: number;
          metric_name: string;
          expression: string;
          verbose_name: string | null;
          description: string | null;
          d3format: string | null;
        }[];
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

  /** 格式化编辑器中的 SQL；解析失败时保留原文并提示。 */
  const handleFormatSql = useCallback(() => {
    const sql = formRef.current.sql;
    if (!sql.trim()) return;
    let formatted: string;
    try {
      formatted = formatSqlText(sql, backend);
    } catch {
      notify({ severity: "error", message: "SQL 解析失败，暂时无法格式化" });
      return;
    }
    setForm((f) => ({ ...f, sql: formatted }));
  }, [backend, notify]);

  /** 复制编辑器中的当前 SQL（可能包含尚未保存的草稿）。 */
  const handleCopyEditorSql = useCallback(async () => {
    const sql = formRef.current.sql;
    if (!sql.trim()) {
      notify({ severity: "warning", message: "当前 SQL 为空" });
      return;
    }
    try {
      await navigator.clipboard.writeText(sql);
      notify({ severity: "success", message: "已复制当前 SQL" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [notify]);

  /** 丢弃未保存的 SQL，恢复为数据集已保存的版本。 */
  const handleResetSql = useCallback(() => {
    if (!dataset) return;
    setForm((f) => ({ ...f, sql: dataset.sql ?? "" }));
    setResetSqlConfirmOpen(false);
    notify({ severity: "info", message: "已还原为已保存的 SQL" });
  }, [dataset, notify]);

  const handleAddMetric = useCallback(() => {
    setNewMetric({
      metric_name: "",
      expression: "",
      verbose_name: "",
      description: "",
      d3format: "",
    });
    setMetricError(null);
    setAddMetricOpen(true);
  }, []);

  const handleEditMetric = useCallback((metric: DatasetMetric) => {
    setEditMetric(metric);
    setEditMetricOpen(true);
  }, []);

  const handleEditMetricSubmit = useCallback(() => {
    if (
      !editMetric ||
      !editMetric.metric_name.trim() ||
      !editMetric.expression.trim()
    )
      return;
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
    const name = newMetric.metric_name.trim();
    const exists = dataset?.metrics?.some(
      (m) => m.metric_name.toLowerCase() === name.toLowerCase() && m.id !== 0,
    );
    if (exists) {
      setMetricError("已存在同名指标，请更换名称");
      return;
    }
    const added: DatasetMetric = {
      id: 0,
      metric_name: name,
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
  }, [newMetric, dataset?.metrics]);

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
      <Box
        sx={{
          p: 3,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      </Box>
    );

  const cardHeaderSx = {
    "& .MuiCardHeader-title": { fontSize: "0.8125rem", fontWeight: 600 },
  };
  /** 额外配置页中带说明的分区标题样式。 */
  const extraSectionHeaderSx = {
    "& .MuiCardHeader-title": { fontSize: "0.875rem", fontWeight: 600 },
    "& .MuiCardHeader-subheader": {
      fontSize: "0.75rem",
      color: "text.secondary",
      mt: 0.25,
    },
  };
  const availableColumns = (dataset?.columns ?? []).filter(
    (c) => c.column_name && c.is_active !== false,
  );
  const availableMetrics = (dataset?.metrics ?? []).filter(
    (m) =>
      m.metric_name &&
      [
        "分成比例",
        "渠道分成",
        "渠道商分成",
        "研发分成",
        "IP分成",
        "分成方式",
        "上线时间",
        "首测起始时间",
        "二测起始时间",
        "三测起始时间",
      ].includes(m.metric_name),
  );
  const hasAvailableSources =
    availableColumns.length > 0 || availableMetrics.length > 0;

  return (
    <Box
      sx={{
        flex: 1,
        p: 3,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
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
        <Tooltip title="复制">
          <IconButton
            size="small"
            aria-label="复制"
            onClick={(event) => setCopyMenuAnchor(event.currentTarget)}
            sx={{ color: "text.secondary" }}
          >
            <ContentCopyIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={copyMenuAnchor}
          open={Boolean(copyMenuAnchor)}
          onClose={() => setCopyMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
        >
          {[
            {
              key: "id",
              label: "复制数据集 ID",
              icon: <ContentCopyIcon sx={{ fontSize: 16 }} />,
              action: () => void handleCopyId(),
            },
            {
              key: "sql",
              label: "复制查询 SQL",
              icon: <CodeIcon sx={{ fontSize: 16 }} />,
              action: () => void handleCopySql(),
            },
            {
              key: "columns",
              label: "复制全部列名",
              icon: <ViewColumnIcon sx={{ fontSize: 16 }} />,
              action: () => void handleCopyColumnNames(),
            },
            {
              key: "metrics",
              label: "复制全部指标名",
              icon: <FunctionsIcon sx={{ fontSize: 16 }} />,
              action: () => void handleCopyAllMetricNames(),
            },
          ].map((item) => (
            <MenuItem
              key={item.key}
              onClick={() => {
                setCopyMenuAnchor(null);
                item.action();
              }}
              sx={{ fontSize: "0.8125rem" }}
            >
              <ListItemIcon sx={{ minWidth: 30 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </MenuItem>
          ))}
        </Menu>
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
          onClick={() => void handleSave()}
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
        <Card
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
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
          <CardContent
            sx={{
              pt: 2,
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {tabValue === 0 && (
              <Box sx={{ px: 0.5, pb: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="搜索数据列..."
                  value={columnSearch}
                  onChange={(e) => {
                    setColumnSearch(e.target.value);
                    setPage(0);
                  }}
                  sx={{
                    maxWidth: 320,
                    "& .MuiOutlinedInput-root": { fontSize: "0.8125rem" },
                  }}
                />
              </Box>
            )}
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
                        ["日期列", "17%", "center"],
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
                      .filter((col) =>
                        (col.column_name || "")
                          .toLowerCase()
                          .includes(columnSearch.trim().toLowerCase()),
                      )
                      .sort((a, b) =>
                        (a.column_name || "").localeCompare(
                          b.column_name || "",
                        ),
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
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.25,
                              }}
                            >
                              {col.column_name}
                              <Tooltip title="复制列名">
                                <IconButton
                                  size="small"
                                  sx={{ p: 0.25 }}
                                  onClick={() =>
                                    void handleCopyColumnName(
                                      col.column_name,
                                      col.type ?? "",
                                    )
                                  }
                                >
                                  <ContentCopyIcon
                                    sx={{
                                      fontSize: 13,
                                      color: "text.disabled",
                                    }}
                                  />
                                </IconButton>
                              </Tooltip>
                            </Box>
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
                          <TableCell
                            sx={{ fontSize: "0.75rem", textAlign: "center" }}
                          >
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
                          <TableCell
                            sx={{ fontSize: "0.75rem", textAlign: "center" }}
                          >
                            {(() => {
                              const colId = col.id;
                              const hasMod =
                                Object.prototype.hasOwnProperty.call(
                                  modifiedColumns,
                                  colId,
                                );
                              const modified = modifiedColumns[colId];
                              const currentExtra = hasMod
                                ? (modified?.extra ?? null)
                                : col.extra;
                              let parsed: Record<string, unknown> = {};
                              try {
                                parsed = currentExtra
                                  ? JSON.parse(currentExtra)
                                  : {};
                              } catch {
                                /* ignore */
                              }
                              const checked = parsed.dashboard_filter === true;
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
                        (a.metric_name || "").localeCompare(
                          b.metric_name || "",
                        ),
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
                              title={
                                <Typography
                                  sx={{
                                    fontFamily: "monospace",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {m.expression}
                                </Typography>
                              }
                              placement="bottom-start"
                              slotProps={{
                                popper: {
                                  sx: {
                                    "& .MuiTooltip-tooltip": { maxWidth: 600 },
                                  },
                                },
                              }}
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
                              onClick={() => void handleCopyMetricFormula(m)}
                              sx={{ p: 0.25 }}
                            >
                              <ContentCopyIcon fontSize="inherit" />
                            </IconButton>
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
            {(tabValue === 0 || tabValue === 1) &&
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
              )}
            {tabValue === 2 && (
              <Box
                sx={{
                  p: { xs: 1.5, md: 2 },
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Card
                  variant="outlined"
                  sx={{ width: "100%", maxWidth: 760, flexShrink: 0 }}
                >
                  <CardContent
                    sx={{
                      p: { xs: 2, md: 2.5 },
                      "&:last-child": { pb: { xs: 2, md: 2.5 } },
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      component="h2"
                      sx={{ fontWeight: 600, fontSize: "0.875rem" }}
                    >
                      数据集描述
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.5, mb: 2 }}
                    >
                      简要说明数据的统计口径与适用场景，帮助同事快速理解这份数据。
                    </Typography>
                    <TextField
                      size="small"
                      label="描述"
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      fullWidth
                      multiline
                      minRows={8}
                      maxRows={12}
                      placeholder="例如：合并后的广告投放日报，按日期与渠道汇总充值、消耗与留存指标。"
                      helperText={
                        <Box
                          component="span"
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: 2,
                          }}
                        >
                          <span>用于图表与数据集列表中的说明</span>
                          <span>{form.description.length} 字</span>
                        </Box>
                      }
                    />
                  </CardContent>
                </Card>
              </Box>
            )}
            {tabValue === 3 && dataset?.kind !== "physical" && (
              <SqlQueryEditor
                value={form.sql}
                onChange={(sql) => setForm((f) => ({ ...f, sql }))}
                backend={dataset.database?.backend}
                databaseName={dataset.database?.database_name}
                subtitle="虚拟数据集 · 保存后会按新的 SQL 重新解析数据列"
                dirty={form.sql !== (dataset.sql ?? "")}
                placeholder="在此输入 SQL，例如 SELECT * FROM schema.table"
                onFormat={handleFormatSql}
                onCopy={() => void handleCopyEditorSql()}
                onReset={() => setResetSqlConfirmOpen(true)}
                onSave={() => void handleSave()}
              />
            )}
            {tabValue === (dataset?.kind !== "physical" ? 4 : 3) && (
              <Box
                sx={{
                  p: { xs: 1.5, md: 2 },
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <Card variant="outlined" sx={{ flexShrink: 0 }}>
                  <CardHeader
                    title="分成配置"
                    subheader="指定分成报表使用的游戏名称列与渠道名称列，保存后按这两个字段计算分成。"
                    sx={extraSectionHeaderSx}
                  />
                  <CardContent
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                      gap: 2,
                      pt: 0,
                    }}
                  >
                    <TextField
                      size="small"
                      label="游戏名称列名"
                      placeholder="例如 主游戏"
                      helperText="对应字段 papp_name_column"
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
                      label="渠道名称列名"
                      placeholder="例如 渠道商"
                      helperText="对应字段 channel_name_column"
                      value={
                        extraConfig.profit_sharing?.channel_name_column ?? ""
                      }
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
                <Card variant="outlined" sx={{ flexShrink: 0 }}>
                  <CardHeader
                    title="计算列"
                    subheader="用公式基于已有列与指标派生新的可分析列，添加后可参与图表计算。"
                    sx={extraSectionHeaderSx}
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
                  <CardContent
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      pt: 0,
                    }}
                  >
                    {(extraConfig.computed_columns ?? []).length === 0 && (
                      <Box
                        sx={{
                          p: 3,
                          textAlign: "center",
                          border: 1,
                          borderStyle: "dashed",
                          borderColor: "divider",
                          borderRadius: 1.5,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontSize: "0.8125rem", fontWeight: 500 }}
                        >
                          暂无计算列
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mt: 0.5 }}
                        >
                          点击右上角「添加计算列」创建第一条计算列。
                        </Typography>
                      </Box>
                    )}
                    {(extraConfig.computed_columns ?? []).map((cc, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 1.5,
                          p: 2,
                          display: "flex",
                          flexDirection: "column",
                          gap: 1.5,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                          }}
                        >
                          <Typography
                            variant="subtitle2"
                            sx={{ fontSize: "0.8125rem", fontWeight: 600 }}
                          >
                            计算列 {idx + 1}
                          </Typography>
                          <Tooltip title="删除计算列">
                            <IconButton
                              size="small"
                              color="error"
                              aria-label={`删除计算列 ${idx + 1}`}
                              onClick={() => {
                                setExtraConfig((prev) => ({
                                  ...prev,
                                  computed_columns: (
                                    prev.computed_columns ?? []
                                  ).filter((_, i) => i !== idx),
                                }));
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        <Box
                          sx={{
                            display: "flex",
                            gap: 1.5,
                            alignItems: "flex-start",
                          }}
                        >
                          <TextField
                            size="small"
                            label="名称"
                            placeholder="例如 分成后成本"
                            value={cc.name}
                            onChange={(e) => {
                              setExtraConfig((prev) => {
                                const cols = [...(prev.computed_columns ?? [])];
                                cols[idx] = {
                                  ...cols[idx],
                                  name: e.target.value,
                                };
                                return { ...prev, computed_columns: cols };
                              });
                            }}
                            sx={{ flex: 1 }}
                          />
                          <FormControl size="small" sx={{ minWidth: 100 }}>
                            <InputLabel
                              id={`computed-column-type-label-${idx}`}
                            >
                              类型
                            </InputLabel>
                            <Select
                              labelId={`computed-column-type-label-${idx}`}
                              id={`computed-column-type-${idx}`}
                              value={cc.type}
                              label="类型"
                              onChange={(e) => {
                                setExtraConfig((prev) => {
                                  const cols = [
                                    ...(prev.computed_columns ?? []),
                                  ];
                                  cols[idx] = {
                                    ...cols[idx],
                                    type: e.target.value,
                                  };
                                  return { ...prev, computed_columns: cols };
                                });
                              }}
                            >
                              <MenuItem value="float">float</MenuItem>
                              <MenuItem value="int">int</MenuItem>
                              <MenuItem value="str">str</MenuItem>
                            </Select>
                          </FormControl>
                        </Box>
                        <TextField
                          size="small"
                          label="公式"
                          placeholder="ad_real_cost * float(渠道商分成 or '100') / 100"
                          value={cc.formula}
                          onChange={(e) => {
                            setExtraConfig((prev) => {
                              const cols = [...(prev.computed_columns ?? [])];
                              cols[idx] = {
                                ...cols[idx],
                                formula: e.target.value,
                              };
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
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              fontWeight: 600,
                              fontSize: "0.75rem",
                            }}
                          >
                            可用列与指标
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.25, mb: 1 }}
                          >
                            点击名称会追加到公式末尾。
                          </Typography>
                          <Box
                            sx={{
                              maxHeight: 160,
                              overflow: "auto",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 0.75,
                              p: 1,
                              border: 1,
                              borderColor: "divider",
                              borderRadius: 1.5,
                              bgcolor: "grey.50",
                            }}
                          >
                            {!hasAvailableSources && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ px: 0.5, py: 1 }}
                              >
                                暂无可用的列或指标
                              </Typography>
                            )}
                            {availableColumns.map((c) => (
                              <Chip
                                key={`column-${c.column_name}`}
                                size="small"
                                variant="outlined"
                                label={
                                  <Box
                                    component="span"
                                    sx={{
                                      display: "inline-flex",
                                      alignItems: "baseline",
                                      gap: 0.5,
                                    }}
                                  >
                                    <span>{c.column_name}</span>
                                    {c.verbose_name &&
                                      c.verbose_name !== c.column_name && (
                                        <Box
                                          component="span"
                                          sx={{
                                            fontSize: "0.65rem",
                                            color: "text.secondary",
                                          }}
                                        >
                                          / {c.verbose_name}
                                        </Box>
                                      )}
                                  </Box>
                                }
                                onClick={() => {
                                  setExtraConfig((prev) => {
                                    const cols = [
                                      ...(prev.computed_columns ?? []),
                                    ];
                                    cols[idx] = {
                                      ...cols[idx],
                                      formula:
                                        cols[idx].formula + c.column_name,
                                    };
                                    return {
                                      ...prev,
                                      computed_columns: cols,
                                    };
                                  });
                                }}
                                sx={{
                                  fontFamily: "monospace",
                                  fontSize: "0.7rem",
                                  bgcolor: "background.paper",
                                }}
                              />
                            ))}
                            {availableMetrics.map((m) => (
                              <Chip
                                key={`metric-${m.metric_name}`}
                                size="small"
                                variant="outlined"
                                color="info"
                                label={
                                  <Box
                                    component="span"
                                    sx={{
                                      display: "inline-flex",
                                      alignItems: "baseline",
                                      gap: 0.5,
                                    }}
                                  >
                                    <span>{m.metric_name}</span>
                                    {m.verbose_name &&
                                      m.verbose_name !== m.metric_name && (
                                        <Box
                                          component="span"
                                          sx={{
                                            fontSize: "0.65rem",
                                            color: "text.secondary",
                                          }}
                                        >
                                          / {m.verbose_name}
                                        </Box>
                                      )}
                                  </Box>
                                }
                                onClick={() => {
                                  setExtraConfig((prev) => {
                                    const cols = [
                                      ...(prev.computed_columns ?? []),
                                    ];
                                    cols[idx] = {
                                      ...cols[idx],
                                      formula:
                                        cols[idx].formula + m.metric_name,
                                    };
                                    return {
                                      ...prev,
                                      computed_columns: cols,
                                    };
                                  });
                                }}
                                sx={{
                                  fontFamily: "monospace",
                                  fontSize: "0.7rem",
                                  bgcolor: "background.paper",
                                }}
                              />
                            ))}
                          </Box>
                        </Box>
                      </Box>
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
          <Box
            sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: "divider" }}
          >
            <Typography variant="h6">添加指标</Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {metricError && (
                <Alert severity="error" sx={{ borderRadius: 1.5 }}>
                  {metricError}
                </Alert>
              )}
              <Card
                elevation={0}
                sx={{
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <CardHeader title="基本信息" sx={cardHeaderSx} />
                <CardContent
                  sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <TextField
                    size="small"
                    label="指标名称"
                    fullWidth
                    autoFocus
                    value={newMetric.metric_name}
                    onChange={(e) =>
                      setNewMetric((f) => ({
                        ...f,
                        metric_name: e.target.value,
                      }))
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
                      setNewMetric((f) => ({
                        ...f,
                        expression: e.target.value,
                      }))
                    }
                  />
                </CardContent>
              </Card>
              <Card
                elevation={0}
                sx={{
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <CardHeader title="可选配置" sx={cardHeaderSx} />
                <CardContent
                  sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <TextField
                    size="small"
                    label="显示名称"
                    fullWidth
                    value={newMetric.verbose_name}
                    onChange={(e) =>
                      setNewMetric((f) => ({
                        ...f,
                        verbose_name: e.target.value,
                      }))
                    }
                  />
                  <TextField
                    size="small"
                    label="描述"
                    fullWidth
                    value={newMetric.description}
                    onChange={(e) =>
                      setNewMetric((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
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
          <Box
            sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: "divider" }}
          >
            <Typography variant="h6">编辑指标</Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Card
                elevation={0}
                sx={{
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <CardHeader title="基本信息" sx={cardHeaderSx} />
                <CardContent
                  sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
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
              <Card
                elevation={0}
                sx={{
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <CardHeader title="可选配置" sx={cardHeaderSx} />
                <CardContent
                  sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
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
      <ConfirmModal
        open={resetSqlConfirmOpen}
        title="还原 SQL"
        description="确定要丢弃当前未保存的 SQL 修改吗？此操作不可撤销。"
        confirmText="还原"
        cancelText="取消"
        danger
        onConfirm={handleResetSql}
        onCancel={() => setResetSqlConfirmOpen(false)}
      />
      {success && (
        <Snackbar
          open
          autoHideDuration={3000}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          onClose={() => setSuccess(false)}
        >
          <Alert
            severity="success"
            variant="filled"
            sx={{ borderRadius: 2 }}
            onClose={() => setSuccess(false)}
          >
            数据集已保存
          </Alert>
        </Snackbar>
      )}
      {error && (
        <Snackbar
          open
          autoHideDuration={6000}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          onClose={() => setError(null)}
        >
          <Alert
            severity="error"
            variant="filled"
            sx={{ borderRadius: 2 }}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}
