import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Button from "@mui/material/Button";
import AddTableIcon from "@mui/icons-material/TableChart";
import CodeIcon from "@mui/icons-material/Code";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import StorageIcon from "@mui/icons-material/Storage";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import rison from "rison";
import api from "@/api";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useNotificationStore } from "@/store/notificationStore";
import type { DatabaseDetail, TableResult } from "@/types/api";

export default function DatabaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setCustom = useBreadcrumbStore((s) => s.setCustom);
  const [db, setDb] = useState<DatabaseDetail | null>(null);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);
  const [tables, setTables] = useState<TableResult[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const notify = useNotificationStore((s) => s.notify);

  /** 复制带 schema 前缀的表名（如 schema.table），便于在 SQL 中直接引用。 */
  const copyTableName = async (schema: string, table: string) => {
    try {
      await navigator.clipboard.writeText(`${schema}.${table}`);
      notify({ severity: "success", message: `已复制表名 ${schema}.${table}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  /** 复制一条对该表的 SELECT 全表查询。 */
  const copySelectSql = async (schema: string, table: string) => {
    const sql = `SELECT * FROM ${schema}.${table};`;
    try {
      await navigator.clipboard.writeText(sql);
      notify({ severity: "success", message: "已复制 SELECT 查询" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  /** 复制当前 schema 下全部表名（带前缀，每行一个）。 */
  const copyAllTableNames = async () => {
    if (!expandedSchema || tables.length === 0) return;
    const lines = tables.map((t) => `${expandedSchema}.${t.value}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      notify({ severity: "success", message: `已复制 ${lines.length} 张表名` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  /** 复制数据库名称。 */
  const copySchemaName = async (schema: string) => {
    try {
      await navigator.clipboard.writeText(schema);
      notify({ severity: "success", message: `已复制模式名 ${schema}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  /** 复制数据库名称。 */
  const copyDatabaseName = async () => {
    try {
      await navigator.clipboard.writeText(db?.database_name ?? "");
      notify({ severity: "success", message: `已复制数据库名 ${db?.database_name}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制数据库的引擎标识（backend / driver）。 */
  const copyEngineTag = async () => {
    if (!db) return;
    const tag = `${db.backend}${db.driver ? ` / ${db.driver}` : ""}`;
    try {
      await navigator.clipboard.writeText(tag);
      notify({ severity: "success", message: `已复制引擎 ${tag}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  // 展开某个 Schema 时加载其下数据表。
  useEffect(() => {
    if (!id || !expandedSchema) {
      setTables([]);
      return;
    }
    setTablesLoading(true);
    setTables([]);
    const qs = rison.encode({ schema_name: expandedSchema });
    api
      .get<{ result: TableResult[] }>(`/database/${id}/tables/?q=${qs}`)
      .then((res) => setTables(res.data.result))
      .catch(() => setTables([]))
      .finally(() => setTablesLoading(false));
  }, [id, expandedSchema]);

  const toggleSchema = (schema: string) => {
    setExpandedSchema((prev) => (prev === schema ? null : schema));
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<{ result: DatabaseDetail }>(`/database/${id}`),
      api.get<{ result: string[] }>(`/database/${id}/schemas/`),
    ])
      .then(([dbResp, schemasResp]) => {
        setDb(dbResp.data.result);
        setSchemas(schemasResp.data.result ?? []);
        setCustom({ label: dbResp.data.result.database_name });
      })
      .catch((err) => {
        setError(err?.response?.data?.message || err.message || "加载失败");
      })
      .finally(() => setLoading(false));
    return () => setCustom(null);
  }, [id, setCustom]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 300,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!db) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          数据库不存在
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <Tooltip title="返回列表">
          <IconButton size="small" onClick={() => navigate("/database/list")}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <StorageIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {db.database_name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {db.backend} / {db.driver}
          </Typography>
        </Box>
        <Tooltip title="复制数据库名称">
          <IconButton
            size="small"
            onClick={() => void copyDatabaseName()}
            sx={{ color: "text.secondary" }}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="复制引擎标识">
          <IconButton
            size="small"
            onClick={() => void copyEngineTag()}
            sx={{ color: "text.secondary" }}
          >
            <CodeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Chip
            label={
              db.expose_in_sqllab ? "SQL 实验室已启用" : "SQL 实验室已禁用"
            }
            color={db.expose_in_sqllab ? "success" : "default"}
            size="small"
          />
          <Chip
            label={db.allow_dml ? "DML 已允许" : "DML 已禁用"}
            color={db.allow_dml ? "warning" : "default"}
            size="small"
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<CodeIcon />}
            disabled={!db.expose_in_sqllab}
            onClick={() =>
              navigate("/sqllab", {
                state: { initialDatabaseId: db.id },
              })
            }
            sx={{ textTransform: "none" }}
          >
            在 SQL 实验室中打开
          </Button>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="概览" />
        <Tab label={`Schema (${schemas.length})`} />
      </Tabs>

      {tab === 0 && (
        <TableContainer
          component={Paper}
          sx={{ borderRadius: 2, boxShadow: "var(--mui-palette-shadow-sm)" }}
        >
          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell
                  sx={{ fontWeight: 600, color: "text.secondary", width: 220 }}
                >
                  数据库名称
                </TableCell>
                <TableCell>{db.database_name}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  后端
                </TableCell>
                <TableCell>{db.backend}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  驱动
                </TableCell>
                <TableCell>{db.driver}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  UUID
                </TableCell>
                <TableCell
                  sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}
                >
                  {db.uuid}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  配置方式
                </TableCell>
                <TableCell>{db.configuration_method}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  SQL 实验室
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.expose_in_sqllab ? "已启用" : "已禁用"}
                    color={db.expose_in_sqllab ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  DML
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_dml ? "允许" : "禁用"}
                    color={db.allow_dml ? "warning" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  CTAS
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_ctas ? "允许" : "禁用"}
                    color={db.allow_ctas ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  CVAS
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_cvas ? "允许" : "禁用"}
                    color={db.allow_cvas ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  文件上传
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_file_upload ? "允许" : "禁用"}
                    color={db.allow_file_upload ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  异步查询
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.allow_run_async ? "允许" : "禁用"}
                    color={db.allow_run_async ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  缓存超时
                </TableCell>
                <TableCell>
                  {db.cache_timeout != null ? `${db.cache_timeout}s` : "未设置"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  模拟用户
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.impersonate_user ? "是" : "否"}
                    color={db.impersonate_user ? "info" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  外部管理
                </TableCell>
                <TableCell>
                  <Chip
                    label={db.is_managed_externally ? "是" : "否"}
                    color={db.is_managed_externally ? "info" : "default"}
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  SSH 隧道
                </TableCell>
                <TableCell>
                  <Chip
                    label={
                      db.engine_information.disable_ssh_tunneling
                        ? "已禁用"
                        : "可用"
                    }
                    color={
                      db.engine_information.disable_ssh_tunneling
                        ? "default"
                        : "success"
                    }
                    size="small"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>
                  动态目录
                </TableCell>
                <TableCell>
                  <Chip
                    label={
                      db.engine_information.supports_dynamic_catalog
                        ? "支持"
                        : "不支持"
                    }
                    color={
                      db.engine_information.supports_dynamic_catalog
                        ? "success"
                        : "default"
                    }
                    size="small"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 1 && (
        <Paper
          sx={{ borderRadius: 2, boxShadow: "var(--mui-palette-shadow-sm)" }}
        >
          {schemas.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                暂无 Schema
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Schema 名称</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">
                      数据表
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schemas.map((s) => {
                    const expanded = expandedSchema === s;
                    return (
                      <Box component="tbody" key={s}>
                        <TableRow
                          hover
                          onClick={() => toggleSchema(s)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                fontFamily: "monospace",
                                fontSize: "0.8125rem",
                              }}
                            >
                              {expanded ? (
                                <KeyboardArrowDownIcon
                                  sx={{ fontSize: 18, color: "primary.main" }}
                                />
                              ) : (
                                <KeyboardArrowRightIcon
                                  sx={{ fontSize: 18, color: "text.disabled" }}
                                />
                              )}
                              {s}
                              <Tooltip title="复制模式名">
                                <IconButton
                                  size="small"
                                  sx={{ p: 0.25 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void copySchemaName(s);
                                  }}
                                >
                                  <ContentCopyIcon
                                    sx={{ fontSize: 13, color: "text.disabled" }}
                                  />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ color: "text.secondary" }}>
                            {expanded && tablesLoading ? (
                              <CircularProgress size={14} />
                            ) : expanded ? (
                              tables.length
                            ) : (
                              "点击展开"
                            )}
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={2} sx={{ py: 0.5 }}>
                              {tablesLoading ? (
                                <Box sx={{ p: 2, textAlign: "center" }}>
                                  <CircularProgress size={18} />
                                </Box>
                              ) : tables.length === 0 ? (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ px: 1, py: 1, display: "block" }}
                                >
                                  该 Schema 下没有可用的数据表
                                </Typography>
                              ) : (
                                <>
                                <Box sx={{ px: 1, py: 0.5 }}>
                                  <Button
                                    size="small"
                                    variant="text"
                                    startIcon={<ContentCopyIcon />}
                                    onClick={() => void copyAllTableNames()}
                                    sx={{ textTransform: "none", fontSize: "0.75rem" }}
                                  >
                                    复制全部表名
                                  </Button>
                                </Box>
                                <Table size="small">
                                  <TableBody>
                                    {tables.map((t) => (
                                      <TableRow key={t.value} hover>
                                        <TableCell
                                          sx={{
                                            pl: 4,
                                            borderBottom: "none",
                                            fontFamily: "monospace",
                                            fontSize: "0.75rem",
                                          }}
                                        >
                                          <Box
                                            sx={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 1,
                                            }}
                                          >
                                            <AddTableIcon
                                              sx={{
                                                fontSize: 14,
                                                color: "text.disabled",
                                              }}
                                            />
                                            {t.value}
                                            <Chip
                                              label={t.type || "table"}
                                              size="small"
                                              variant="outlined"
                                              sx={{
                                                height: 16,
                                                fontSize: "0.65rem",
                                                "& .MuiChip-label": { px: 0.5 },
                                              }}
                                            />
                                          </Box>
                                        </TableCell>
                                        <TableCell
                                          align="right"
                                          sx={{ py: 0.5, borderBottom: "none" }}
                                        >
                                          <Tooltip title="复制表名">
                                            <IconButton
                                              size="small"
                                              onClick={() =>
                                                void copyTableName(s, t.value)
                                              }
                                              sx={{ mr: 0.5 }}
                                            >
                                              <ContentCopyIcon
                                                sx={{ fontSize: 15 }}
                                              />
                                            </IconButton>
                                          </Tooltip>
                                          <Tooltip title="复制 SELECT 查询">
                                            <IconButton
                                              size="small"
                                              onClick={() =>
                                                void copySelectSql(s, t.value)
                                              }
                                              sx={{ mr: 0.5 }}
                                            >
                                              <CodeIcon sx={{ fontSize: 15 }} />
                                            </IconButton>
                                          </Tooltip>
                                          <Button
                                            size="small"
                                            variant="text"
                                            startIcon={<AddTableIcon />}
                                            onClick={() =>
                                              navigate(
                                                `/dataset/create?database=${id}&schema=${encodeURIComponent(s)}&table=${encodeURIComponent(t.value)}`,
                                              )
                                            }
                                          >
                                            创建数据集
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Box>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}
    </Box>
  );
}
