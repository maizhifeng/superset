import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import DeleteIcon from "@mui/icons-material/Delete";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AddIcon from "@mui/icons-material/Add";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import HistoryIcon from "@mui/icons-material/History";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import PersonIcon from "@mui/icons-material/Person";
import { downloadCsv } from "@/utils/exportCsv";
import Pagination from "@mui/material/Pagination";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Divider from "@mui/material/Divider";
import FilterBar from "@/components/FilterBar";
import ListPageLayout from "@/components/ListPageLayout";
import { useToolbarStore } from "@/store/toolbarStore";
import { useDashboardFavorites } from "@/store/dashboardFavorites";
import { useRecentDashboards } from "@/store/recentDashboards";
import { useNotificationStore } from "@/store/notificationStore";
import { ConfirmModal, Grid2 } from "@/superset-ui-mui/components";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";

import { cardAccents } from "@/theme/notion";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { DashboardListItem } from "@/types/api";

const PAGE_SIZE = 18;

export default function DashboardList() {
  const navigate = useNavigate();
  const {
    rows: dashboards,
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
  } = usePaginatedList<DashboardListItem>({
    endpoint: "/dashboard/",    filterColumn: "dashboard_title",
    pageSize: PAGE_SIZE,
    errorMessage: "加载仪表板失败",
  });
  const favIds = useDashboardFavorites((s) => s.ids);
  const toggleFavorite = useDashboardFavorites((s) => s.toggle);
  const notify = useNotificationStore((s) => s.notify);

  /** 复制某个仪表板的直达链接。 */
  const handleCopyDashboardLink = async (id: number) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dashboard/${id}`,
      );
      notify({ severity: "success", message: "已复制仪表板链接" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制某个仪表板的标题。 */
  const handleCopyTitle = async (title: string) => {
    if (!title) return;
    try {
      await navigator.clipboard.writeText(title);
      notify({ severity: "success", message: `已复制标题 ${title}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  const recentItems = useRecentDashboards((s) => s.items);
  const recentIds = useMemo(
    () => new Set(recentItems.map((x) => x.id)),
    [recentItems],
  );
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [publishFilter, setPublishFilter] = useState<"" | "published" | "draft">(
    "",
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("新建仪表板");
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);

  const getOwnerNames = (dashboard: DashboardListItem): string => {
    const owners = dashboard.owners ?? [];
    if (owners.length > 0) {
      return owners
        .map((o) =>
          [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email,
        )
        .filter(Boolean)
        .join(", ");
    }
    if (dashboard.created_by?.first_name || dashboard.created_by?.last_name) {
      return [dashboard.created_by.first_name, dashboard.created_by.last_name]
        .filter(Boolean)
        .join(" ");
    }
    return "无";
  };

  /** 导出当前筛选后的仪表板列表为 CSV。 */
  const handleExportCsv = useCallback(() => {
    const rowsToExport = dashboards.filter(
      (d) =>
        (!favoritesOnly || favIds.includes(d.id)) &&
        (!recentOnly || recentIds.has(d.id)) &&
        (!publishFilter ||
          (publishFilter === "published"
            ? d.published
            : publishFilter === "draft"
              ? !d.published
              : true)),
    );
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      ["名称", "状态", "创建人", "最后修改", "链接"],
      rowsToExport.map((d) => ({
        名称: d.dashboard_title,
        状态: d.published ? "已发布" : "草稿",
        创建人: getOwnerNames(d),
        最后修改: d.changed_on_delta_humanized ?? "",
        链接: `${window.location.origin}/dashboard/${d.id}`,
      })),
      `dashboards-${ts}.csv`,
    );
  }, [dashboards, favoritesOnly, recentOnly, publishFilter, favIds, recentIds]);

  /** 复制当前筛选后的仪表板标题（每行一个）。 */
  const handleCopyAllTitles = useCallback(async () => {
    const rowsToExport = dashboards.filter(
      (d) =>
        (!favoritesOnly || favIds.includes(d.id)) &&
        (!recentOnly || recentIds.has(d.id)) &&
        (!publishFilter ||
          (publishFilter === "published"
            ? d.published
            : publishFilter === "draft"
              ? !d.published
              : true)),
    );
    const titles = rowsToExport.map((d) => d.dashboard_title).filter(Boolean);
    if (titles.length === 0) {
      notify({ severity: "warning", message: "暂无仪表板数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(titles.join("\n"));
      notify({ severity: "success", message: `已复制 ${titles.length} 个标题` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [dashboards, favoritesOnly, recentOnly, publishFilter, favIds, recentIds, notify]);

  useEffect(() => {
    registerTools("dashboard_list", [
      {
        id: "add",
        priority: 6,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "新建仪表板",
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
        id: "export",
        priority: 4.5,
        showOnMobile: false,
        render: (
          <Tooltip title="导出当前仪表板列表为 CSV">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
              onClick={handleExportCsv}
              disabled={dashboards.length === 0}
              sx={{ textTransform: "none" }}
            >
              导出 CSV
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "copy_titles",
        priority: 1.75,
        showOnMobile: false,
        render: (
          <Tooltip title="复制当前筛选后的仪表板标题列表">
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllTitles()}
              disabled={dashboards.length === 0}
              sx={{ textTransform: "none" }}
            >
              复制标题
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
            placeholder="搜索仪表板..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("dashboard_list");
  }, [registerTools, unregisterTools, handleSearchChange, handleExportCsv, handleCopyAllTitles, dashboards.length, fetchData, loading]);

  const totalPages = Math.ceil(rowCount / PAGE_SIZE);

  const openRenameDialog = (dashboard: DashboardListItem) => {
    setRenameTarget({ id: dashboard.id, name: dashboard.dashboard_title });
    setRenameName(dashboard.dashboard_title);
    setRenameError(null);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    setRenaming(true);
    setRenameError(null);
    try {
      await api.put(`/dashboard/${renameTarget.id}`, {
        dashboard_title: renameName.trim(),
      });
      setRenameTarget(null);
      fetchData();
    } catch (err: unknown) {      setRenameError(parseErrorMessage(err, "重命名失败"));
    } finally {
      setRenaming(false);
    }
  };

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
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
              仪表板
            </Typography>
          }
          action={
            <>
              <Tooltip title="仅显示最近打开的仪表板">
                <Button
                  size="small"
                  variant={recentOnly ? "contained" : "text"}
                  color={recentOnly ? "primary" : "inherit"}
                  startIcon={
                    <HistoryIcon sx={{ fontSize: 16 }} />
                  }
                  onClick={() => setRecentOnly((v) => !v)}
                  sx={{ textTransform: "none", mr: 0.5 }}
                >
                  最近
                </Button>
              </Tooltip>
              <Tooltip title="仅显示收藏的仪表板">
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
                  sx={{ textTransform: "none" }}
                >
                  收藏
                </Button>
              </Tooltip>
              <FormControl size="small" sx={{ minWidth: 104, ml: 0.5 }}>
                <InputLabel id="dash-status-label">状态</InputLabel>
                <Select
                  labelId="dash-status-label"
                  label="状态"
                  value={publishFilter}
                  onChange={(e) => setPublishFilter(e.target.value)}
                >
                  <MenuItem value="">
                    <em>全部</em>
                  </MenuItem>
                  <MenuItem value="published">已发布</MenuItem>
                  <MenuItem value="draft">草稿</MenuItem>
                </Select>
              </FormControl>
            </>
          }
          sx={{ "& .MuiCardHeader-content": { overflow: "hidden" } }}
        />
        <Divider />
        <ListPageLayout
          loading={loading}
          error={error}
          hasData={dashboards.length > 0}
          emptyState={
            <>
              <EmptyState
                icon={<DashboardIcon />}
                title="未找到仪表板"
                description={
                  searchText ? "请调整搜索条件" : "创建仪表板将图表集中管理"
                }
                action={
                  !searchText ? (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      创建仪表板
                    </Button>
                  ) : undefined
                }
              />
              <EmptyStateShortcutHint />
            </>
          }
        >
          <Grid2 container spacing={2}>
            {dashboards
              .filter(
                (d) =>
                  (!favoritesOnly || favIds.includes(d.id)) &&
                  (!recentOnly || recentIds.has(d.id)) &&
                  (!publishFilter ||
                    (publishFilter === "published"
                      ? d.published
                      : publishFilter === "draft"
                        ? !d.published
                        : true)),
              )
              .map((dashboard, i) => (
              <Grid2 size={{ xs: 12, sm: 6, lg: 4 }} key={dashboard.id}>
                <Paper
                  sx={{
                    p: 2.5,
                    borderRadius: 1.5,
                    cursor: "pointer",
                    position: "relative",
                    border: "none",
                    borderTop: "3px solid",
                    borderTopColor: cardAccents[i % cardAccents.length],
                    bgcolor: "surface.main",
                    boxShadow: "var(--mui-palette-shadow-card)",
                    transition:
                      "box-shadow 250ms cubic-bezier(0.25,0.1,0.15,1), transform 250ms cubic-bezier(0.25,0.1,0.15,1)",
                    "&:hover": {
                      boxShadow: "var(--mui-palette-shadow-cardHover)",
                      transform: "translateY(-2px)",
                      "& .card-actions": { opacity: 1 },
                    },
                  }}
                  onClick={() => navigate(`/dashboard/${dashboard.id}`)}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      mb: 1,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 700,
                          lineHeight: 1.3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dashboard.dashboard_title}
                      </Typography>
                      <Tooltip title="复制标题">
                        <IconButton
                          size="small"
                          sx={{ p: 0.25, flexShrink: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyTitle(dashboard.dashboard_title);
                          }}
                        >
                          <ContentCopyIcon
                            sx={{
                              fontSize: 14,
                              color: "text.disabled",
                            }}
                          />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 1,
                    }}
                  >
                    {dashboard.published ? (
                      <Chip
                        label="已发布"
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{
                          height: 22,
                          "& .MuiChip-label": { fontSize: "0.75rem", px: 0.75 },
                        }}
                      />
                    ) : (
                      <Chip
                        label="草稿"
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 22,
                          "& .MuiChip-label": { fontSize: "0.75rem", px: 0.75 },
                        }}
                      />
                    )}
                    {dashboard.changed_on_delta_humanized && (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.25,
                        }}
                      >
                        <CalendarTodayIcon
                          sx={{ fontSize: 11, color: "text.disabled" }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: "0.75rem" }}
                        >
                          {dashboard.changed_on_delta_humanized}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.25,
                      mb: 1,
                    }}
                  >
                    <PersonIcon
                      sx={{ fontSize: 13, color: "text.disabled" }}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontSize: "0.75rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      所有者：{getOwnerNames(dashboard)}
                    </Typography>
                  </Box>
                  <Box
                    className="card-actions"
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      opacity: 0,
                      transition: "opacity 200ms ease",
                    }}
                  >
                    <Tooltip
                      title={favIds.includes(dashboard.id) ? "取消收藏" : "收藏"}
                    >
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(dashboard.id);
                        }}
                        sx={{
                          bgcolor: "background.paper",
                          boxShadow: "var(--mui-palette-shadow-sm)",
                          mr: 0.5,
                          color: favIds.includes(dashboard.id)
                            ? "warning.main"
                            : "text.disabled",
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        {favIds.includes(dashboard.id) ? (
                          <StarIcon sx={{ fontSize: 16 }} />
                        ) : (
                          <StarBorderIcon sx={{ fontSize: 16 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="打开仪表板">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/${dashboard.id}`);
                        }}
                        sx={{
                          bgcolor: "background.paper",
                          boxShadow: "var(--mui-palette-shadow-sm)",
                          mr: 0.5,
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <VisibilityIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="复制链接">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCopyDashboardLink(dashboard.id);
                        }}
                        sx={{
                          bgcolor: "background.paper",
                          boxShadow: "var(--mui-palette-shadow-sm)",
                          mr: 0.5,
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="重命名">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameDialog(dashboard);
                        }}
                        sx={{
                          bgcolor: "background.paper",
                          boxShadow: "var(--mui-palette-shadow-sm)",
                          mr: 0.5,
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({
                            id: dashboard.id,
                            name: dashboard.dashboard_title,
                          });
                        }}
                        sx={{
                          bgcolor: "background.paper",
                          boxShadow: "var(--mui-palette-shadow-sm)",
                          "&:hover": { bgcolor: "error.light" },
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Paper>
              </Grid2>
            ))}
          </Grid2>
          {totalPages > 1 && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                mt: 3,
                pr: { xs: 7, sm: 0 },
              }}
            >
              <Pagination
                count={totalPages}
                page={paginationModel.page + 1}
                onChange={(_, p) =>
                  setPaginationModel({ ...paginationModel, page: p - 1 })
                }
                color="primary"
                shape="rounded"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {deleteError}
            </Alert>
          )}
          <ConfirmModal
            open={!!deleteTarget}
            title="删除仪表板"
            description={`确定要删除"${deleteTarget?.name}"？此操作不可撤销。`}
            confirmText="删除"
            cancelText="取消"
            confirmLoading={deleteLoading}
            danger
            onConfirm={() => void handleDelete()}
            onCancel={() => setDeleteTarget(null)}
          />
        </ListPageLayout>
      </Card>
      <Dialog
        open={!!renameTarget}
        onClose={() => {
          if (!renaming) setRenameTarget(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>重命名仪表板</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="仪表板名称"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !renaming && renameName.trim()) {
                e.preventDefault();
                void handleRename();
              }
            }}
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
          />
          {renameError && (
            <Alert severity="error" sx={{ mt: 1.5, borderRadius: 2 }}>
              {renameError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={renaming}
            onClick={() => setRenameTarget(null)}
          >
            取消
          </Button>
          <Button
            variant="contained"
            disabled={renaming || !renameName.trim()}
            onClick={() => void handleRename()}
          >
            {renaming ? "保存中..." : "保存"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>创建仪表板</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="仪表板名称"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={creating || !createName.trim()}
            onClick={() => {
              void (async () => {
                setCreating(true);
                try {
                  const res = await api.post("/dashboard/", {
                    dashboard_title: createName.trim(),
                    published: true,
                  });
                  const newId = res.data?.id;
                  setCreateDialogOpen(false);
                  if (newId) navigate(`/dashboard/${newId}`);
                } catch {
                  /* ignore */
                }
                setCreating(false);
              })();
            }}
          >
            {creating ? "创建中..." : "创建"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
