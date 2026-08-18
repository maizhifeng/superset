import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format as formatSql } from "sql-formatter";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import Typography from "@mui/material/Typography";
import CodeIcon from "@mui/icons-material/Code";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import ListPageLayout from "@/components/ListPageLayout";
import { ConfirmModal } from "@/superset-ui-mui/components";
import { useToolbarStore } from "@/store/toolbarStore";
import { useSavedQueryFavorites } from "@/store/savedQueryFavorites";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { useNotificationStore } from "@/store/notificationStore";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { downloadCsv } from "@/utils/exportCsv";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { SavedQuery } from "@/types/api";

/** localStorage 键：记住已保存查询"仅看收藏"筛选开关。 */
const SQ_FAV_KEY = "superset-saved-query-fav-filter";

export default function SavedQueryList() {
  const navigate = useNavigate();
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
  } = usePaginatedList<SavedQuery>({
    endpoint: "/saved_query/",
    filterColumn: "label",
    errorMessage: "加载保存的查询失败",
  });
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);
  const notify = useNotificationStore((s) => s.notify);

  /** 复制 SQL 到剪贴板，成功后按需提示。 */
  const handleCopySql = useCallback(
    async (sql: string, label: string) => {
      try {
        await navigator.clipboard.writeText(sql);
        notify({
          severity: "success",
          message: `已复制"${label}"的 SQL`,
        });
      } catch {
        notify({
          severity: "error",
          message: "复制失败，请手动选择复制",
        });
      }
    },
    [notify],
  );

  /** 复制查询 ID 到剪贴板。 */
  const handleCopyId = useCallback(
    async (id: unknown) => {
      try {
        await navigator.clipboard.writeText(String(id));
        notify({ severity: "success", message: "已复制查询 ID" });
      } catch {
        notify({ severity: "error", message: "复制失败" });
      }
    },
    [notify],
  );

  /** 复制该查询所属数据库的名称。 */
  const handleCopyDbName = useCallback(
    async (dbName: string | undefined) => {
      if (!dbName) return;
      try {
        await navigator.clipboard.writeText(dbName);
        notify({ severity: "success", message: `已复制数据库名 ${dbName}` });
      } catch {
        notify({ severity: "error", message: "复制失败" });
      }
    },
    [notify],
  );

  const openInSqlLab = useCallback(
    (sql: string) => {
      navigate("/sqllab", { state: { initialSql: sql } });
    },
    [navigate],
  );

  /** 将保存的 SQL 下载为 .sql 文件。 */
  const handleDownloadSql = useCallback(
    (sql: string, label: string) => {
      const blob = new Blob([sql], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(label || "query").replace(/[\\/:*?"<>|]/g, "_")}.sql`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [],
  );

  /** 在 SQL 实验室打开并直接运行：先取回该查询的数据库 id，再带 auto-run 跳转。 */
  const handleRunSaved = useCallback(
    async (id: number) => {
      try {
        const res = await api.get<{
          result?: {
            db_id?: number;
            sql?: string;
            database?: { id?: number };
          };
        }>(`/saved_query/${id}`);
        const detail = res.data?.result;
        navigate("/sqllab", {
          state: {
            initialSql: detail?.sql ?? "",
            initialDatabaseId: detail?.database?.id ?? detail?.db_id,
            initialRun: true,
          },
        });
      } catch {
        notify({ severity: "error", message: "无法加载该查询" });
      }
    },
    [navigate, notify],
  );

  const favIds = useSavedQueryFavorites((s) => s.ids);
  const toggleFavorite = useSavedQueryFavorites((s) => s.toggle);
  const [favoritesOnly, setFavoritesOnly] = useState(
    () => localStorage.getItem(SQ_FAV_KEY) === "1",
  );
  const [dbFilter, setDbFilter] = useState("");
  useEffect(() => {
    if (favoritesOnly) localStorage.setItem(SQ_FAV_KEY, "1");
    else localStorage.removeItem(SQ_FAV_KEY);
  }, [favoritesOnly]);
  const displayRows = rows
    .filter((r) => !favoritesOnly || favIds.includes(r.id))
    .filter((r) => !dbFilter || r.database?.database_name === dbFilter);
  const databaseOptions = Array.from(
    new Set(rows.map((r) => r.database?.database_name).filter(Boolean)),
  );

  /** 复制当前加载的查询标签（每行一个）。 */
  const handleCopyAllLabels = useCallback(async () => {
    const labels = displayRows.map((r) => r.label).filter(Boolean);
    if (labels.length === 0) {
      notify({ severity: "warning", message: "暂无查询数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(labels.join("\n"));
      notify({ severity: "success", message: `已复制 ${labels.length} 个标签` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [displayRows, notify]);

  /** 导出当前加载的保存查询列表为 CSV。 */
  const handleExportCsv = useCallback(() => {
    if (displayRows.length === 0) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      ["ID", "标签", "数据库", "最后修改"],
      displayRows.map((r) => ({
        ID: r.id,
        标签: r.label ?? "",
        数据库: r.database?.database_name ?? "",
        最后修改: r.changed_on_delta_humanized ?? "",
      })),
      `saved-queries-${ts}.csv`,
    );
  }, [displayRows]);

  const [editTarget, setEditTarget] = useState<SavedQuery | null>(null);
  const [editName, setEditName] = useState("");
  const [editSql, setEditSql] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = (row: SavedQuery) => {
    setEditTarget(row);
    setEditName(row.label ?? "");
    setEditSql(row.sql ?? "");
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editTarget || savingEdit) return;
    if (!editName.trim()) {
      setEditError("标签不能为空");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.put(`/saved_query/${editTarget.id}`, {
        label: editName.trim(),
        sql: editSql,
      });
      setEditTarget(null);
      fetchData();
    } catch (err: unknown) {
      setEditError((err as { message?: string })?.message ?? "保存失败");
    } finally {
      setSavingEdit(false);
    }
  };

  /** 在编辑对话框中格式化当前 SQL。 */
  const formatEditSql = useCallback(() => {
    try {
      setEditSql(formatSql(editSql || ""));
    } catch {
      /* sql 无法解析时保持原样 */
    }
  }, [editSql]);

  useEffect(() => {
    registerTools("saved_query_list", [
      {
        id: "add",
        priority: 6,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "打开 SQL 实验室",
        action: () => navigate("/sqllab"),
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
        id: "export",
        priority: 2,
        showOnMobile: false,
        render: (
          <Tooltip title="导出当前查询列表为 CSV">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
              onClick={handleExportCsv}
              disabled={displayRows.length === 0}
              sx={{ textTransform: "none" }}
            >
              导出 CSV
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "copy_labels",
        priority: 1.6,
        showOnMobile: false,
        render: (
          <Tooltip title="复制当前加载的查询标签列表">
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllLabels()}
              disabled={displayRows.length === 0}
              sx={{ textTransform: "none" }}
            >
              复制标签
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "fav_filter",
        priority: 1.75,
        showOnMobile: false,
        render: (
          <Tooltip title={favoritesOnly ? "显示全部查询" : "仅显示收藏的查询"}>
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
        id: "db_filter",
        priority: 1.8,
        showOnMobile: false,
        render: databaseOptions.length > 0 ? (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel id="sq-db-label">数据库</InputLabel>
            <Select
              labelId="sq-db-label"
              label="数据库"
              value={dbFilter}
              onChange={(e) => setDbFilter(e.target.value)}
            >
              <MenuItem value="">
                <em>全部</em>
              </MenuItem>
              {databaseOptions.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null,
      },
      {
        id: "search",
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar
            value=""
            onChange={handleSearchChange}
            placeholder="搜索保存的查询..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("saved_query_list");
  }, [registerTools, unregisterTools, handleSearchChange, handleExportCsv, handleCopyAllLabels, favoritesOnly, setFavoritesOnly, favIds, dbFilter, setDbFilter, databaseOptions, displayRows.length, rows.length, fetchData, loading, navigate]);

  const columns: GridColDef[] = [
    {
      field: "id",
      headerName: "ID",
      width: 70,
      renderCell: (params) => (
        <Tooltip title="复制查询 ID">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              void handleCopyId(params.value);
            }}
            sx={{ p: 0.25 }}
          >
            <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: "label",
      headerName: "标签",
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {params.value}
          </Typography>
          {params.value ? (
            <Tooltip title="复制标签">
              <IconButton
                size="small"
                sx={{ p: 0.25 }}
                onClick={(e) => {
                  e.stopPropagation();
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(params.value);
                      notify({ severity: "success", message: `已复制标签 ${params.value}` });
                    } catch {
                      notify({ severity: "error", message: "复制失败" });
                    }
                  })();
                }}
              >
                <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      ),
    },
    {
      field: "sql",
      headerName: "SQL 预览",
      flex: 2,
      renderCell: (params) => {
        const sql = params.value ?? "";
        const truncated = sql.length > 100 ? `${sql.slice(0, 100)}...` : sql;
        return (
          <Tooltip
            title={
              <Box
                component="pre"
                sx={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  maxWidth: 500,
                  whiteSpace: "pre-wrap",
                  m: 0,
                }}
              >
                {sql}
              </Box>
            }
            placement="left"
            arrow
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                overflow: "hidden",
              }}
            >
              <CodeIcon
                sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }}
              />
              <Typography
                variant="body2"
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {truncated}
              </Typography>
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: "database",
      headerName: "数据库",
      flex: 0.4,
      renderCell: (params) => {
        const dbName = params.row.database?.database_name ?? "";
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            <Typography
              variant="body2"
              sx={{ fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {dbName}
            </Typography>
            {dbName ? (
              <Tooltip title="复制数据库名">
                <IconButton
                  size="small"
                  sx={{ p: 0.25 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopyDbName(dbName);
                  }}
                >
                  <ContentCopyIcon
                    sx={{ fontSize: 13, color: "text.disabled" }}
                  />
                </IconButton>
              </Tooltip>
            ) : null}
          </Box>
        );
      },
    },
    {
      field: "changed_on_delta_humanized",
      headerName: "最后修改",
      flex: 0.4,
    },
    {
      field: "actions",
      headerName: "",
      width: 210,
      sortable: false,
      renderCell: (params) => {
        const sql = params.row.sql ?? "";
        const label = params.row.label ?? "";
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            <Tooltip
              title={
                favIds.includes(params.id as number) ? "取消收藏" : "收藏"
              }
            >
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(params.id as number);
                }}
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
            <Tooltip title="在 SQL 实验室中打开">
              <IconButton
                size="small"
                onClick={() => openInSqlLab(sql)}
                disabled={!sql}
              >
                <OpenInNewIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="复制 SQL">
              <IconButton
                size="small"
                onClick={() => void handleCopySql(sql, label)}
                disabled={!sql}
              >
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="打开并运行">
              <IconButton
                size="small"
                onClick={() => void handleRunSaved(params.id as number)}
                disabled={!sql}
              >
                <PlayArrowIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="下载 SQL 文件">
              <IconButton
                size="small"
                onClick={() => handleDownloadSql(sql, label)}
                disabled={!sql}
              >
                <DownloadIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="编辑">
              <IconButton
                size="small"
                onClick={() =>
                  openEdit({
                    id: params.id as number,
                    label: params.row.label,
                    sql: params.row.sql ?? "",
                    database: params.row.database,
                    changed_on_delta_humanized:
                      params.row.changed_on_delta_humanized,
                  })
                }
              >
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="删除">
              <IconButton
                size="small"
                onClick={() =>
                  setDeleteTarget({
                    id: params.id as number,
                    name: params.row.label,
                  })
                }
              >
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  return (
    <ListPageLayout
      loading={loading}
      error={error}
      hasData={rows.length > 0}
      emptyState={
        <>
          <EmptyState
            icon={<SaveIcon />}
            title="未找到保存的查询"
            description={
              searchText
                ? "请调整搜索条件"
                : "在SQL实验室中保存查询以在此处查看"
            }
            action={
              !searchText ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => navigate("/sqllab")}
                >
                  打开 SQL 实验室
                </Button>
              ) : undefined
            }
          />
          <EmptyStateShortcutHint />
        </>
      }
    >
      <ResponsiveDataGrid
        rows={displayRows}
        columns={columns}
        loading={loading}
        autoHeight
        paginationModel={paginationModel}
        rowCount={rowCount}
        paginationMode="server"
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100]}
        toolbarPageKey="saved_query_list"
        onDelete={(row) => setDeleteTarget({ id: row.id, name: row.label })}
        onBatchDelete={(ids) => {
          void (async () => {
            await Promise.all(
              ids.map((id) => api.delete(`/saved_query/${id}`)),
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
              {row.label}
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                columnGap: 0.25,
                mt: 0.25,
                overflow: "hidden",
              }}
            >
              <CodeIcon
                sx={{ fontSize: 10, color: "text.disabled", flexShrink: 0 }}
              />
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  color: "text.secondary",
                  fontSize: "0.75rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {(row.sql?.length ?? 0) > 60
                  ? `${row.sql.slice(0, 60)}...`
                  : row.sql}
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", flexShrink: 0 }}
              >
                {row.database?.database_name ?? ""}
                {row.changed_on_delta_humanized
                  ? ` · ${row.changed_on_delta_humanized}`
                  : ""}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                mt: 0.5,
              }}
            >
              <IconButton
                size="small"
                onClick={() => openInSqlLab(row.sql ?? "")}
                disabled={!row.sql}
                aria-label="在 SQL 实验室中打开"
              >
                <OpenInNewIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => void handleCopySql(row.sql ?? "", row.label)}
                disabled={!row.sql}
                aria-label="复制 SQL"
              >
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => openEdit(row)}
                aria-label="编辑"
              >
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
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
        title="删除保存的查询"
        description={`确定要删除"${deleteTarget?.name}"？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        confirmLoading={deleteLoading}
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      <Dialog
        open={!!editTarget}
        onClose={() => !savingEdit && setEditTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>编辑保存的查询</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="标签"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              autoFocus
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                SQL
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Tooltip title="格式化 SQL">
                <Button
                  size="small"
                  variant="text"
                  startIcon={<CodeIcon sx={{ fontSize: 15 }} />}
                  onClick={formatEditSql}
                  sx={{ textTransform: "none", minHeight: 0 }}
                >
                  格式化
                </Button>
              </Tooltip>
            </Box>
            <TextField
              label="SQL 内容"
              value={editSql}
              onChange={(e) => setEditSql(e.target.value)}
              variant="outlined"
              multiline
              minRows={6}
              size="small"
              fullWidth
              sx={{ fontFamily: "monospace" }}
            />
            {editError && (
              <Alert severity="error" onClose={() => setEditError(null)} sx={{ borderRadius: 1.5 }}>
                {editError}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)} disabled={savingEdit}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={savingEdit || !editName.trim()}
            onClick={() => void handleSaveEdit()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </ListPageLayout>
  );
}
