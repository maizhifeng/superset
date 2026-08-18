import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import CircularProgress from "@mui/material/CircularProgress";
import NotificationsIcon from "@mui/icons-material/Notifications";
import VerifiedIcon from "@mui/icons-material/Verified";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PeopleIcon from "@mui/icons-material/People";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SummarizeIcon from "@mui/icons-material/Summarize";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Typography from "@mui/material/Typography";
import { useNotificationStore } from "@/store/notificationStore";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import ListPageLayout from "@/components/ListPageLayout";
import { ConfirmModal } from "@/superset-ui-mui/components";
import { useToolbarStore } from "@/store/toolbarStore";
import { useAlertFavorites } from "@/store/alertFavorites";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import CreateAlertDialog from "./CreateAlertDialog";

import type { AlertReport, ChartRow, Database } from "@/types/api";

/** localStorage 键：记住警报"仅看收藏"筛选开关。 */
const AR_FAV_KEY = "superset-alert-fav-filter";

export default function AlertReportList() {
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
  } = usePaginatedList<AlertReport>({
    endpoint: "/report/",
    filterColumn: "name",
    errorMessage: "加载警报和报告失败",
  });
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);
  const favIds = useAlertFavorites((s) => s.ids);
  const toggleFavorite = useAlertFavorites((s) => s.toggle);
  const [favoritesOnly, setFavoritesOnly] = useState(
    () => localStorage.getItem(AR_FAV_KEY) === "1",
  );
  const [activeOnly, setActiveOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"" | "alert" | "report">("");
  useEffect(() => {
    if (favoritesOnly) localStorage.setItem(AR_FAV_KEY, "1");
    else localStorage.removeItem(AR_FAV_KEY);
  }, [favoritesOnly]);
  const displayRows = rows
    .filter((r) => !favoritesOnly || favIds.includes(r.id))
    .filter((r) => !activeOnly || r.active)
    .filter((r) => !typeFilter || r.type === typeFilter);
  const notify = useNotificationStore((s) => s.notify);
  /** 复制当前加载的警报/报告名（每行一个）。 */
  const handleCopyAllNames = useCallback(async () => {
    const names = displayRows.map((r) => r.name).filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "暂无警报数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      notify({ severity: "success", message: `已复制 ${names.length} 个名称` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [displayRows, notify]);
  const handleCopyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      notify({ severity: "success", message: `已复制名称 ${name}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制警报/报告的 ID。 */
  const handleCopyId = async (id: number) => {
    try {
      await navigator.clipboard.writeText(String(id));
      notify({ severity: "success", message: `已复制 ID ${id}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制收件人到剪贴板。 */
  const handleCopyRecipients = async (recipients: unknown) => {
    try {
      await navigator.clipboard.writeText(String(recipients ?? ""));
      notify({ severity: "success", message: "已复制收件人" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制 cron“调度表达式。 */
  const handleCopyCrontab = async (expr: string | undefined) => {
    if (!expr) return;
    try {
      await navigator.clipboard.writeText(expr);
      notify({ severity: "success", message: `已复制调度 ${expr}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制整条的记录摘要。 */
  const handleCopyRow = async (row: AlertReport) => {
    const typeLabel = row.type === "alert" ? "警报" : "报告";
    const summary = [
      `${typeLabel}: ${row.name}`,
      row.crontab ? `调度: ${row.crontab}` : "",
      row.recipients ? `收件人: ${row.recipients}` : "",
      `状态: ${row.active ? "活跃" : "不活跃"}`,
    ]
      .filter(Boolean)
      .join(" | ");
    try {
      await navigator.clipboard.writeText(summary);
      notify({ severity: "success", message: `已复制"${row.name}"的记录` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AlertReport | null>(null);
  const [charts, setCharts] = useState<ChartRow[]>([]);
  const [databases, setDatabases] = useState<Database[]>([]);

  // 加载图表与数据库，供新建警报时选择数据源。
  useEffect(() => {
    api
      .get<{ result: ChartRow[] }>("/chart/?q=(page_size:200,page:0)")
      .then((res) => setCharts(res.data.result))
      .catch(() => setCharts([]));
    api
      .get<{ result: Database[] }>("/database/?q=(page_size:100,page:0)")
      .then((res) => setDatabases(res.data.result))
      .catch(() => setDatabases([]));
  }, []);

  const handleCreated = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);

  const toggleActive = async (row: AlertReport) => {
    if (toggleLoadingId !== null) return;
    setToggleLoadingId(row.id);
    try {
      await api.put(`/report/${row.id}`, { active: !row.active });
      fetchData();
    } catch {
      /* ignore */
    } finally {
      setToggleLoadingId(null);
    }
  };

  useEffect(() => {
    registerTools("alert_report_list", [
      {
        id: "add",
        priority: 6,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "新建警报",
        action: () => setCreateOpen(true),
        render: null,
      },
      {
        id: "fav_filter",
        priority: 2.5,
        showOnMobile: false,
        render: (
          <Tooltip title={favoritesOnly ? "显示全部警报" : "仅显示收藏的警报"}>
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
        id: "active_filter",
        priority: 2.25,
        showOnMobile: false,
        render: (
          <Tooltip title={activeOnly ? "显示全部警报" : "仅显示活跃的警报"}>
            <Button
              size="small"
              variant={activeOnly ? "contained" : "text"}
              color={activeOnly ? "success" : "inherit"}
              startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
              onClick={() => setActiveOnly((v) => !v)}
              sx={{ textTransform: "none", minWidth: 90 }}
            >
              活跃
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "type_filter",
        priority: 1.75,
        showOnMobile: false,
        render: (
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel id="alert-type-label">类型</InputLabel>
            <Select
              labelId="alert-type-label"
              label="类型"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <MenuItem value="">
                <em>全部</em>
              </MenuItem>
              <MenuItem value="alert">警报</MenuItem>
              <MenuItem value="report">报告</MenuItem>
            </Select>
          </FormControl>
        ),
      },
      {
        id: "copy_names",
        priority: 2,
        showOnMobile: false,
        render: (
          <Tooltip title="复制当前加载的警报/报告名列表">
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllNames()}
              disabled={displayRows.length === 0}
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
            placeholder="搜索警报..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("alert_report_list");
  }, [registerTools, unregisterTools, handleSearchChange, favoritesOnly, setFavoritesOnly, favIds, activeOnly, setActiveOnly, typeFilter, setTypeFilter, handleCopyAllNames, displayRows.length]);

  const columns: GridColDef[] = [
    {
      field: "id",
      headerName: "ID",
      width: 78,
      renderCell: (params) => (
        <Tooltip title="复制 ID">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              void handleCopyId(params.value as number);
            }}
            sx={{ p: 0.25, mr: 0.5 }}
          >
            <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: "name",
      headerName: "名称",
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
          {params.value ? (
            <Tooltip title="复制名称">
              <IconButton
                size="small"
                sx={{ p: 0.25 }}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyName(params.value);
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
      field: "type",
      headerName: "类型",
      flex: 0.4,
      renderCell: (params) => (
        <Chip
          icon={
            params.value === "alert" ? (
              <NotificationsIcon sx={{ fontSize: 14 }} />
            ) : (
              <VerifiedIcon sx={{ fontSize: 14 }} />
            )
          }
          label={
            params.value
              ? params.value.charAt(0).toUpperCase() + params.value.slice(1)
              : ""
          }
          size="small"
          color={params.value === "alert" ? "warning" : "info"}
          variant="outlined"
        />
      ),
    },
    {
      field: "active",
      headerName: "状态",
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value ? "活跃" : "不活跃"}
          size="small"
          color={params.value ? "success" : "default"}
          variant={params.value ? "filled" : "outlined"}
        />
      ),
    },
    {
      field: "crontab",
      headerName: "调度",
      flex: 0.4,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <ScheduleIcon sx={{ fontSize: 14, color: "text.disabled" }} />
          <span>{params.value}</span>
          {params.value ? (
            <Tooltip title="复制调度">
              <IconButton
                size="small"
                sx={{ p: 0.25 }}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyCrontab(params.value);
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
      field: "recipients",
      headerName: "收件人",
      flex: 1,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <PeopleIcon sx={{ fontSize: 14, color: "text.disabled" }} />
          <span>{params.value}</span>
          {params.value ? (
            <Tooltip title="复制收件人">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyRecipients(params.value);
                }}
                sx={{ p: 0.25 }}
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
      field: "actions",
      headerName: "",
      width: 242,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Tooltip
            title={favIds.includes(params.id as number) ? "取消收藏" : "收藏"}
          >
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
          <Tooltip title="复制名称">
            <IconButton
              size="small"
              onClick={() => void handleCopyName(params.row.name)}
            >
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制整条记录">
            <IconButton
              size="small"
              onClick={() => void handleCopyRow(params.row)}
            >
              <SummarizeIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="编辑">
            <IconButton
              size="small"
              onClick={() => setEditTarget(params.row)}
            >
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={params.row.active ? "暂停警报" : "启用警报"}>
            <span>
              <IconButton
                size="small"
                disabled={toggleLoadingId === params.row.id}
                onClick={() => void toggleActive(params.row)}
              >
                {toggleLoadingId === params.row.id ? (
                  <CircularProgress size={16} />
                ) : params.row.active ? (
                  <PauseIcon sx={{ fontSize: 16 }} />
                ) : (
                  <PlayArrowIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="删除">
            <IconButton
              size="small"
              onClick={() =>
                setDeleteTarget({
                  id: params.id as number,
                  name: params.row.name,
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
    <>
      <ListPageLayout
        loading={loading}
        error={error}
        hasData={rows.length > 0}
        emptyState={
        <>
          <EmptyState
            icon={<NotificationsIcon />}
            title="未找到警报或报告"
            description={
              searchText
                ? "请调整搜索条件"
                : "创建警报或报告以在条件满足时收到通知"
            }
            action={
              !searchText ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setCreateOpen(true)}
                >
                  新建警报
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
        toolbarPageKey="alert_report_list"
        onDelete={(row) => setDeleteTarget({ id: row.id, name: row.name })}
        onBatchDelete={(ids) => {
          void (async () => {
            await Promise.all(ids.map((id) => api.delete(`/report/${id}`)));
            fetchData();
          })();
        }}
        renderCard={(row) => (
          <>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, lineHeight: 1.3 }}
            >
              {row.name}
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
                icon={
                  row.type === "alert" ? (
                    <NotificationsIcon sx={{ fontSize: 10 }} />
                  ) : (
                    <VerifiedIcon sx={{ fontSize: 10 }} />
                  )
                }
                label={
                  row.type
                    ? `${row.type.charAt(0).toUpperCase()}${row.type.slice(1)}`
                    : ""
                }
                size="small"
                color={row.type === "alert" ? "warning" : "info"}
                variant="outlined"
                sx={{
                  height: 16,
                  fontSize: "0.75rem",
                  "& .MuiChip-label": { px: 0.5 },
                }}
              />
              <Chip
                label={row.active ? "活跃" : "不活跃"}
                size="small"
                color={row.active ? "success" : "default"}
                variant={row.active ? "filled" : "outlined"}
                sx={{
                  height: 16,
                  fontSize: "0.75rem",
                  "& .MuiChip-label": { px: 0.5 },
                }}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                <ScheduleIcon sx={{ fontSize: 10, color: "text.disabled" }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.75rem" }}
                >
                  {row.crontab}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                <PeopleIcon sx={{ fontSize: 10, color: "text.disabled" }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: "0.75rem" }}
                >
                  {row.recipients}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 0.5 }}>
              <IconButton
                size="small"
                onClick={() => setEditTarget(row)}
                sx={{ p: 0.25 }}
                aria-label="编辑"
              >
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => void toggleActive(row)}
                disabled={toggleLoadingId === row.id}
                sx={{ p: 0.25 }}
                aria-label={row.active ? "暂停警报" : "启用警报"}
              >
              {toggleLoadingId === row.id ? (
                <CircularProgress size={14} />
              ) : row.active ? (
                <PauseIcon sx={{ fontSize: 16 }} />
              ) : (
                <PlayArrowIcon sx={{ fontSize: 16 }} />
              )}
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
        title="删除警报/报告"
        description={`确定要删除"${deleteTarget?.name}"？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        confirmLoading={deleteLoading}
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      </ListPageLayout>
      <CreateAlertDialog
        open={createOpen || !!editTarget}
        editing={editTarget}
        onClose={() => {
          setCreateOpen(false);
          setEditTarget(null);
        }}
        onCreated={handleCreated}
        charts={charts.map((c) => ({ id: c.id, slice_name: c.slice_name }))}
        databases={databases.map((d) => ({
          id: d.id,
          database_name: d.database_name,
        }))}
      />
    </>
  );
}
