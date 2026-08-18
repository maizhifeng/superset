import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import CodeIcon from "@mui/icons-material/Code";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import StorageIcon from "@mui/icons-material/Storage";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import { downloadCsv } from "@/utils/exportCsv";
import { useNotificationStore } from "@/store/notificationStore";
import Typography from "@mui/material/Typography";
import type { GridColDef, GridRowParams } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { useToolbarStore } from "@/store/toolbarStore";
import { useDatabaseFavorites } from "@/store/databaseFavorites";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import ListPageLayout from "@/components/ListPageLayout";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { ConfirmModal } from "@/superset-ui-mui/components";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";

import type { Database } from "@/types/api";

/** localStorage 键：记住用户选择的数据库后端/引擎过滤条件。 */
const BACKEND_FILTER_KEY = "superset-database-backend-filter";

/** localStorage 键：记住数据库"仅看收藏"筛选开关。 */
const FAV_KEY = "superset-database-fav-filter";

export default function DatabaseList() {
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createUri, setCreateUri] = useState("");
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const notify = useNotificationStore((s) => s.notify);

  /** 复制数据库名称到剪贴板。 */
  const handleCopyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      notify({ severity: "success", message: `已复制数据库名 ${name}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制数据库的引擎标识。 */
  const handleCopyBackend = async (backend: string) => {
    if (!backend) return;
    try {
      await navigator.clipboard.writeText(backend);
      notify({ severity: "success", message: `已复制引擎 ${backend}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制数据库详情页链接。 */
  const handleCopyLink = async (id: number) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/database/${id}`);
      notify({ severity: "success", message: "已复制数据库链接" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  const runTestConnection = async () => {
    if (!createUri.trim() || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      await api.post("/database/test_connection/", {
        sqlalchemy_uri: createUri.trim(),
      });
      setTestResult({ ok: true, message: "连接成功" });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: unknown } })?.response?.data ??
        (err as { message?: string })?.message ??
        "连接失败";
      setTestResult({ ok: false, message: String(msg) });
    } finally {
      setTesting(false);
    }
  };
  const {
    rows,
    rowCount,
    loading,
    error,
    searchText,
    paginationModel,
    deleteTarget,
    deleteLoading,
    deleteError,
    setPaginationModel,
    setDeleteTarget,
    handleSearchChange,
    handleDelete,
    fetchData,
  } = usePaginatedList<Database>({
    endpoint: "/database/",
    filterColumn: "database_name",
    errorMessage: "加载数据库失败",
  });
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);
  const favIds = useDatabaseFavorites((s) => s.ids);
  const toggleFavorite = useDatabaseFavorites((s) => s.toggle);
  const [favoritesOnly, setFavoritesOnly] = useState(
    () => localStorage.getItem(FAV_KEY) === "1",
  );
  const [sqllabOnly, setSqllabOnly] = useState(false);
  const [dmlOnly, setDmlOnly] = useState(false);
  const [backendFilter, setBackendFilter] = useState(
    () => localStorage.getItem(BACKEND_FILTER_KEY) ?? "",
  );
  const visibleRows = (backendFilter
    ? rows.filter((r) => r.backend === backendFilter)
    : rows
  )
    .filter((r) => !favoritesOnly || favIds.includes(r.id))
    .filter((r) => !sqllabOnly || r.expose_in_sqllab)
    .filter((r) => !dmlOnly || r.allow_dml);
  const backendOptions = Array.from(
    new Set(rows.map((r) => r.backend).filter(Boolean)),
  );

  /** 复制当前筛选后的数据库名（每行一个）。 */
  const handleCopyAllNames = useCallback(async () => {
    const names = visibleRows.map((r) => r.database_name).filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "暂无数据库数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      notify({ severity: "success", message: `已复制 ${names.length} 个数据库名` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [visibleRows, notify]);

  /** 导出当前筛选后的数据库列表为 CSV。 */
  const handleExportCsv = useCallback(() => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      ["数据库", "后端", "SQL 实验室", "DML", "最后修改"],
      visibleRows.map((d) => ({
        数据库: d.database_name,
        后端: d.backend ?? "",
        "SQL 实验室": d.expose_in_sqllab ? "已启用" : "已禁用",
        DML: d.allow_dml ? "是" : "否",
        最后修改: d.changed_on_delta_humanized ?? "",
      })),
      `databases-${ts}.csv`,
    );
  }, [visibleRows]);

  useEffect(() => {
    if (backendFilter) localStorage.setItem(BACKEND_FILTER_KEY, backendFilter);
    else localStorage.removeItem(BACKEND_FILTER_KEY);
  }, [backendFilter]);

  useEffect(() => {
    if (favoritesOnly) localStorage.setItem(FAV_KEY, "1");
    else localStorage.removeItem(FAV_KEY);
  }, [favoritesOnly]);

  useEffect(() => {
    registerTools("database_list", [
      {
        id: "add",
        priority: 6,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "新建数据库",
        action: () => setCreateDialogOpen(true),
        render: null,
      },
      {
        id: "refresh",
        priority: 5.5,
        showOnMobile: false,
        render: (
          <Tooltip title="刷新列表">
            <IconButton size="small" onClick={() => fetchData()} disabled={loading}>
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        ),
      },
      {
        id: "backend_filter",
        priority: 4,
        showOnMobile: false,
        render:
          backendOptions.length > 0 ? (
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="db-backend-label">后端</InputLabel>
              <Select
                labelId="db-backend-label"
                label="后端"
                value={backendFilter}
                onChange={(e) => setBackendFilter(e.target.value)}
              >
                <MenuItem value="">
                  <em>全部</em>
                </MenuItem>
                {backendOptions.map((b) => (
                  <MenuItem key={b as string} value={b as string}>
                    {b as string}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null,
      },
      {
        id: "fav_filter",
        priority: 3,
        showOnMobile: false,
        render: (
          <Tooltip title={favoritesOnly ? "显示全部数据库" : "仅显示收藏的数据库"}>
            <Button
              size="small"
              variant={favoritesOnly ? "contained" : "text"}
              color={favoritesOnly ? "warning" : "inherit"}
              startIcon={
                favoritesOnly ? (
                  <StarIcon sx={{ fontSize: 16 }} />
                ) : (
                  <StarBorderIcon sx={{ fontSize: 16 }} />
                )
              }
              onClick={() => setFavoritesOnly((v) => !v)}
              sx={{ textTransform: "none", minWidth: 90 }}
            >
              收藏
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "sqllab_filter",
        priority: 2.75,
        showOnMobile: false,
        render: (
          <Tooltip title={sqllabOnly ? "显示全部数据库" : "仅显示 SQL 实验室可用的数据库"}>
            <Button
              size="small"
              variant={sqllabOnly ? "contained" : "text"}
              color={sqllabOnly ? "info" : "inherit"}
              startIcon={<CodeIcon sx={{ fontSize: 16 }} />}
              onClick={() => setSqllabOnly((v) => !v)}
              sx={{ textTransform: "none", minWidth: 90 }}
            >
              SQL 实验室
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "dml_filter",
        priority: 2.65,
        showOnMobile: false,
        render: (
          <Tooltip title={dmlOnly ? "显示全部数据库" : "仅显示允许 DML 的数据库"}>
            <Button
              size="small"
              variant={dmlOnly ? "contained" : "text"}
              color={dmlOnly ? "success" : "inherit"}
              startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
              onClick={() => setDmlOnly((v) => !v)}
              sx={{ textTransform: "none", minWidth: 90 }}
            >
              DML
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "export",
        priority: 2,
        showOnMobile: false,
        render: (
          <Tooltip title="导出当前数据库列表为 CSV">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
              onClick={handleExportCsv}
              disabled={visibleRows.length === 0}
              sx={{ textTransform: "none" }}
            >
              导出 CSV
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "copy_names",
        priority: 1.75,
        showOnMobile: false,
        render: (
          <Tooltip title="复制当前筛选后的数据库名列表">
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllNames()}
              disabled={visibleRows.length === 0}
              sx={{ textTransform: "none" }}
            >
              复制名称
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "search",
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar
            value=""
            onChange={handleSearchChange}
            placeholder="搜索数据库..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("database_list");
  }, [registerTools, unregisterTools, handleSearchChange, backendOptions, backendFilter, favoritesOnly, setFavoritesOnly, sqllabOnly, setSqllabOnly, dmlOnly, setDmlOnly, handleExportCsv, handleCopyAllNames, visibleRows.length, fetchData, loading]);

  const columns: GridColDef[] = [
    { field: "id", headerName: "ID", width: 70 },
    {
      field: "database_name",
      headerName: "数据库",
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: "0.8125rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {params.value}
          </Typography>
          <Tooltip title="复制数据库名">
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              onClick={(e) => {
                e.stopPropagation();
                void handleCopyName(params.value);
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    {
      field: "backend",
      headerName: "后端",
      flex: 0.4,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Chip label={params.value} size="small" variant="outlined" />
          {params.value ? (
            <Tooltip title="复制引擎">
              <IconButton
                size="small"
                sx={{ p: 0.25 }}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyBackend(params.value);
                }}
              >
                <ContentCopyIcon
                  sx={{ fontSize: 13, color: "text.disabled" }}
                />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      ),
    },
    {
      field: "expose_in_sqllab",
      headerName: "SQL 实验室",
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value ? "已启用" : "已禁用"}
          color={params.value ? "success" : "default"}
          size="small"
          variant={params.value ? "filled" : "outlined"}
        />
      ),
    },
    {
      field: "allow_dml",
      headerName: "DML",
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value ? "是" : "否"}
          color={params.value ? "success" : "default"}
          size="small"
          variant={params.value ? "filled" : "outlined"}
        />
      ),
    },
    {
      field: "changed_on_delta_humanized",
      headerName: "最后修改",
      flex: 0.4,
    },
    {
      field: "actions",
      headerName: "",
      width: 225,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Tooltip title={favIds.includes(params.id as number) ? "取消收藏" : "收藏"}>
            <IconButton
              size="small"
              onClick={() => toggleFavorite(params.id as number)}
              sx={{
                color: favIds.includes(params.id as number)
                  ? "warning.main"
                  : "text.disabled",
              }}
            >
              {favIds.includes(params.id as number) ? (
                <StarIcon sx={{ fontSize: 16 }} />
              ) : (
                <StarBorderIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="复制数据库名">
            <IconButton
              size="small"
              onClick={() => void handleCopyName(params.row.database_name)}
            >
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制数据库链接">
            <IconButton
              size="small"
              onClick={() => void handleCopyLink(params.id as number)}
            >
              <LinkIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          {params.row.expose_in_sqllab && (
            <Tooltip title="在 SQL 实验室中打开">
              <IconButton
                size="small"
                onClick={() =>
                  navigate("/sqllab", {
                    state: { initialDatabaseId: params.id as number },
                  })
                }
              >
                <CodeIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="删除">
            <IconButton
              size="small"
              onClick={() =>
                setDeleteTarget({
                  id: params.id as number,
                  name: params.row.database_name,
                })
              }
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        p: { xs: 1.5, md: 3 },
        pt: { xs: 1.5, md: 2 },
      }}
    >
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        <CardHeader
          title={
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
                数据库
              </Typography>
              <Typography variant="caption" color="text.secondary">
                共 {rowCount} 项
              </Typography>
            </Box>
          }
          sx={{ "& .MuiCardHeader-content": { overflow: "hidden" } }}
        />
        <Divider />
        <ListPageLayout
          loading={loading}
          error={error}
          hasData={rows.length > 0}
          emptyState={
            <>
              <EmptyState
                icon={<StorageIcon />}
                title="未连接数据库"
                description={
                  searchText ? "请调整搜索条件" : "连接数据库开始探索您的数据"
                }
                action={
                  !searchText ? (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      连接数据库
                    </Button>
                  ) : undefined
                }
              />
              <EmptyStateShortcutHint />
            </>
          }
        >
          <ResponsiveDataGrid
            rows={visibleRows}
            columns={columns}
            loading={loading}
            autoHeight
            paginationModel={paginationModel}
            rowCount={rowCount}
            paginationMode="server"
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[25, 50, 100]}
            toolbarPageKey="database_list"
            onRowClick={(params: GridRowParams) =>
              navigate(`/database/${params.id}`)
            }
            onEdit={(row) => navigate(`/database/${row.id}`)}
            onDelete={(row) =>
              setDeleteTarget({ id: row.id, name: row.database_name })
            }
            onBatchDelete={(ids) => {
              void (async () => {
                await Promise.all(
                  ids.map((id) => api.delete(`/database/${id}`)),
                );
                fetchData();
              })();
            }}
            renderCard={(row) => (
              <>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, lineHeight: 1.3 }}
                >
                  {row.database_name}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    columnGap: 0.25,
                    mt: 0.25,
                  }}
                >
                  <Chip
                    label={row.backend}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 16,
                      fontSize: "0.75rem",
                      "& .MuiChip-label": { px: 0.5 },
                    }}
                  />
                  <Chip
                    label={row.expose_in_sqllab ? "已启用" : "已禁用"}
                    size="small"
                    color={row.expose_in_sqllab ? "success" : "default"}
                    variant={row.expose_in_sqllab ? "filled" : "outlined"}
                    sx={{
                      height: 16,
                      fontSize: "0.75rem",
                      "& .MuiChip-label": { px: 0.5 },
                    }}
                  />
                  <Chip
                    label={row.allow_dml ? "DML: 是" : "DML: 否"}
                    size="small"
                    color={row.allow_dml ? "success" : "default"}
                    variant={row.allow_dml ? "filled" : "outlined"}
                    sx={{
                      height: 16,
                      fontSize: "0.75rem",
                      "& .MuiChip-label": { px: 0.5 },
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ fontSize: "0.75rem" }}
                  >
                    {row.changed_on_delta_humanized ?? ""}
                  </Typography>
                </Box>
              </>
            )}
          />
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {deleteError}
            </Alert>
          )}
          <ConfirmModal
            open={!!deleteTarget}
            title="删除数据库"
            description={`确定要删除"${deleteTarget?.name}"？此操作不可撤销。`}
            confirmText="删除"
            cancelText="取消"
            confirmLoading={deleteLoading}
            danger
            onConfirm={() => void handleDelete()}
            onCancel={() => setDeleteTarget(null)}
          />
          <Dialog
            open={createDialogOpen}
            onClose={() => setCreateDialogOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>连接数据库</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                fullWidth
                label="数据库名称"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                variant="outlined"
                size="small"
                sx={{ mt: 1, mb: 2 }}
              />
              <TextField
                fullWidth
                label="数据库连接串"
                value={createUri}
                onChange={(e) => {
                  setCreateUri(e.target.value);
                  setTestResult(null);
                }}
                variant="outlined"
                size="small"
                placeholder="postgresql://user:pass@host:port/dbname"
              />
              <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={testing ? <CircularProgress size={14} /> : <CheckCircleIcon />}
                  disabled={!createUri.trim() || testing}
                  onClick={() => void runTestConnection()}
                  sx={{ textTransform: "none" }}
                >
                  {testing ? "测试中..." : "测试连接"}
                </Button>
                {testResult && (
                  <Alert
                    severity={testResult.ok ? "success" : "error"}
                    sx={{ flex: 1, borderRadius: 1.5, py: 0 }}
                  >
                    {testResult.ok
                      ? testResult.message
                      : "连接失败：请检查连接串与网络"}
                  </Alert>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateDialogOpen(false)}>取消</Button>
              <Button
                variant="contained"
                disabled={creating || !createName.trim() || !createUri.trim()}
                onClick={() => {
                  void (async () => {
                    setCreating(true);
                    try {
                      const res = await api.post("/database/", {
                        database_name: createName.trim(),
                        sqlalchemy_uri: createUri.trim(),
                      });
                      setCreateDialogOpen(false);
                      if (res.data?.id) fetchData();
                    } catch {
                      /* ignore */
                    }
                    setCreating(false);
                  })();
                }}
              >
                {creating ? "连接中..." : "连接"}
              </Button>
            </DialogActions>
          </Dialog>
        </ListPageLayout>
      </Card>
    </Box>
  );
}
