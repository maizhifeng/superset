import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import Switch from "@mui/material/Switch";
import InputAdornment from "@mui/material/InputAdornment";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CasinoIcon from "@mui/icons-material/Casino";
import DeleteIcon from "@mui/icons-material/Delete";
import PeopleIcon from "@mui/icons-material/People";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import LockIcon from "@mui/icons-material/Lock";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RefreshIcon from "@mui/icons-material/Refresh";
import MailIcon from "@mui/icons-material/Mail";
import DownloadIcon from "@mui/icons-material/Download";
import { downloadCsv } from "@/utils/exportCsv";
import PauseIcon from "@mui/icons-material/Pause";
import CircularProgress from "@mui/material/CircularProgress";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import PageHeader from "@/components/PageHeader";
import { useToolbarStore } from "@/store/toolbarStore";
import { useNotificationStore } from "@/store/notificationStore";
import ListPageLayout from "@/components/ListPageLayout";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { ConfirmModal } from "@/superset-ui-mui/components";
import RolePermissionsDialog, {
  RolePermissionsContent,
  type RolePermissionsTarget,
} from "@/components/RolePermissionsDialog";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";

/** "最后登录"相对时间标签与列表数据的自动刷新周期（毫秒）。 */
const LAST_LOGIN_REFRESH_MS = 30_000;

/** 把时间格式化为"刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期"。 */
function relativeTime(value: string, now: number): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} 天前`;
  return d.toLocaleDateString();
}

import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { useAuthStore } from "@/store/authStore";
import { protectedRoutePaths } from "@/config/routePermissions";
import type { AdminUser, AdminRole } from "@/types/api";

export default function AdminUsers() {
  const navigate = useNavigate();
  const currentUsername = useAuthStore((s) => s.user?.username);
  const switchToUser = useAuthStore((s) => s.switchToUser);
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
  } = usePaginatedList<AdminUser>({
    endpoint: "/security/users/",
    filterColumn: "username",
    errorMessage: "加载用户列表失败",
  });

  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);

  // 定时刷新：让"最后登录"的相对时间随时间推进，并及时反映用户的新登录。
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) {
        setNowTick(Date.now());
        fetchData({ silent: true });
      }
    }, LAST_LOGIN_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  const [activeOnly, setActiveOnly] = useState(false);
  const filteredRows = activeOnly
    ? rows.filter((r) => r.active ?? r.is_active)
    : rows;
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [editRoles, setEditRoles] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);

  const toggleActive = async (user: AdminUser) => {
    if (toggleLoadingId !== null) return;
    setToggleLoadingId(user.id);
    try {
      await api.put(`/security/users/${user.id}`, {
        active: !(user.active ?? true),
      });
      fetchData();
    } catch {
      /* ignore */
    } finally {
      setToggleLoadingId(null);
    }
  };

  const [routeTarget, setRouteTarget] = useState<AdminUser | null>(null);
  const routeOverrides = useUserRouteOverrides((s) => s.overrides);
  const setOverride = useUserRouteOverrides((s) => s.setOverride);

  const [switchTarget, setSwitchTarget] = useState<AdminUser | null>(null);
  const [switching, setSwitching] = useState(false);

  const [permRole, setPermRole] = useState<RolePermissionsTarget | null>(null);

  const notify = useNotificationStore((s) => s.notify);
  /** 复制用户名到剪贴板。 */
  const handleCopyUsername = async (username: string) => {
    try {
      await navigator.clipboard.writeText(username);
      notify({ severity: "success", message: "已复制用户名" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制邮箱到剪贴板。 */
  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      notify({ severity: "success", message: "已复制邮箱" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制用户 ID 到剪贴板。 */
  const handleCopyUserId = async (id: unknown) => {
    try {
      await navigator.clipboard.writeText(String(id));
      notify({ severity: "success", message: "已复制用户 ID" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制用户的角色名（逗号分隔）。 */
  const handleCopyUserRoles = async (roles: { name: string }[] | undefined) => {
    const names = (roles ?? []).map((r) => r.name).filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "该用户暂无角色" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join(", "));
      notify({ severity: "success", message: `已复制 ${names.length} 个角色` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 导出当前加载的用户列表为 CSV。 */
  const handleExportCsv = useCallback(() => {
    if (filteredRows.length === 0) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      ["ID", "用户名", "邮箱", "状态", "最近登录", "角色"],
      filteredRows.map((r) => ({
        ID: r.id,
        用户名: r.username,
        邮箱: r.email,
        状态: r.active ? "活跃" : "不活跃",
        最近登录: r.last_login ?? "",
        角色: (r.roles ?? []).map((ro) => ro.name).join(", "),
      })),
      `users-${ts}.csv`,
    );
  }, [filteredRows]);

  /** 复制当前加载的用户名（每行一个）。 */
  const handleCopyAllUsernames = useCallback(async () => {
    const names = filteredRows.map((r) => r.username).filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "暂无用户数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      notify({
        severity: "success",
        message: `已复制 ${names.length} 个用户名`,
      });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [filteredRows, notify]);
  /** 复制当前加载的用户邮箱（每行一个）。 */
  const handleCopyAllEmails = useCallback(async () => {
    const emails = filteredRows.map((r) => r.email).filter(Boolean);
    if (emails.length === 0) {
      notify({ severity: "warning", message: "暂无邮箱数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(emails.join("\n"));
      notify({
        severity: "success",
        message: `已复制 ${emails.length} 个邮箱`,
      });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [filteredRows, notify]);
  /** 生成一个随机初始密码并填入创建表单。 */
  const generatePassword = () => {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let pwd = "";
    const len = 12;
    for (let i = 0; i < len; i += 1) {
      pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    setCreateForm((f) => ({ ...f, password: pwd }));
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    active: true,
    roleIds: [] as number[],
  });
  const [creating, setCreating] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ result: AdminRole[] }>("/security/roles/?q=(page_size:200)")
      .then((res) => {
        if (res.data?.result) setRoles(res.data.result);
      });
  }, []);

  useEffect(() => {
    registerTools("admin_users", [
      {
        id: "add",
        priority: 6,
        showOnMobile: true,
        fabIcon: <PersonAddIcon />,
        fabLabel: "新建用户",
        action: () => setCreateOpen(true),
        render: null,
      },
      {
        id: "refresh",
        priority: 5.5,
        showOnMobile: false,
        render: (
          <Tooltip title="刷新列表">
            <IconButton
              size="small"
              onClick={() => fetchData()}
              disabled={loading}
            >
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        ),
      },
      {
        id: "active_filter",
        priority: 2.5,
        showOnMobile: false,
        render: (
          <Tooltip title={activeOnly ? "显示全部用户" : "仅显示活跃用户"}>
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
        id: "export",
        priority: 2,
        showOnMobile: false,
        render: (
          <Tooltip title="导出当前用户列表为 CSV">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
              sx={{ textTransform: "none" }}
            >
              导出 CSV
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "copy_usernames",
        priority: 1.75,
        showOnMobile: false,
        render: (
          <Tooltip title="复制当前加载的用户名列表">
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllUsernames()}
              disabled={filteredRows.length === 0}
              sx={{ textTransform: "none" }}
            >
              复制用户名
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "copy_emails",
        priority: 1.6,
        showOnMobile: false,
        render: (
          <Tooltip title="复制当前加载的用户邮箱列表">
            <Button
              size="small"
              variant="outlined"
              startIcon={<MailIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllEmails()}
              disabled={filteredRows.length === 0}
              sx={{ textTransform: "none" }}
            >
              复制邮箱
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
            placeholder="搜索用户..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("admin_users");
  }, [
    registerTools,
    unregisterTools,
    handleSearchChange,
    fetchData,
    loading,
    handleExportCsv,
    handleCopyAllUsernames,
    handleCopyAllEmails,
    activeOnly,
    setActiveOnly,
    filteredRows.length,
  ]);

  const columns: GridColDef[] = [
    {
      field: "id",
      headerName: "ID",
      width: 66,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Tooltip title="复制用户 ID">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              void handleCopyUserId(params.value);
            }}
            sx={{ p: 0.25 }}
          >
            <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: "username",
      headerName: "用户名",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography noWrap variant="body2" sx={{ fontSize: "0.8125rem" }}>
            {params.value}
          </Typography>
          <Tooltip title="复制用户名">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                void handleCopyUsername(params.value);
              }}
              sx={{ p: 0.25 }}
            >
              <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    {
      field: "email",
      headerName: "邮箱",
      flex: 1.5,
      minWidth: 150,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography noWrap variant="body2" sx={{ fontSize: "0.8125rem" }}>
            {params.value}
          </Typography>
          {params.value ? (
            <Tooltip title="复制邮箱">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyEmail(params.value);
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
      field: "active",
      headerName: "状态",
      width: 70,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => {
        const isActive = params.value ?? params.row.is_active;
        return (
          <Chip
            label={isActive ? "活跃" : "禁用"}
            color={isActive ? "success" : "default"}
            size="small"
            variant={isActive ? "filled" : "outlined"}
          />
        );
      },
    },
    {
      field: "roles",
      headerName: "角色",
      flex: 1,
      minWidth: 100,
      renderCell: (params) => (
        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {params.value?.map((r: { id: number; name: string }) => (
            <Chip
              key={r.id}
              label={r.name}
              size="small"
              variant="outlined"
              clickable
              title="点击查看权限细则"
              onClick={(e) => {
                e.stopPropagation();
                setPermRole({ id: r.id, name: r.name });
              }}
            />
          ))}
          <Tooltip title="复制角色">
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              onClick={(e) => {
                e.stopPropagation();
                void handleCopyUserRoles(params.value);
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    {
      field: "last_login",
      headerName: "最后登录",
      flex: 0.8,
      minWidth: 100,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Tooltip
          title={
            params.value ? new Date(params.value).toLocaleString() : "从未登录"
          }
          disableHoverListener={!params.value}
        >
          <Typography variant="body2" color="text.secondary" noWrap>
            {params.value ? relativeTime(params.value, nowTick) : "-"}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: "actions",
      headerName: "操作",
      width: 380,
      sortable: false,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          <Tooltip title={params.row.active ? "停用该用户" : "启用该用户"}>
            <span>
              <IconButton
                size="small"
                disabled={
                  toggleLoadingId === params.row.id ||
                  params.row.username === currentUsername
                }
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleActive(params.row);
                }}
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
          <Button
            size="small"
            variant="outlined"
            sx={{ whiteSpace: "nowrap", minWidth: 0, fontSize: "0.75rem" }}
            onClick={(e) => {
              e.stopPropagation();
              setEditTarget(params.row);
              setEditRoles(
                params.row.roles?.map((r: { id: number }) => r.id) ?? [],
              );
            }}
          >
            编辑角色
          </Button>
          <Button
            size="small"
            variant="contained"
            color="warning"
            startIcon={<SwapHorizIcon sx={{ fontSize: 14 }} />}
            sx={{ whiteSpace: "nowrap", minWidth: 0, fontSize: "0.75rem" }}
            onClick={(e) => {
              e.stopPropagation();
              setSwitchTarget(params.row);
            }}
          >
            切换
          </Button>
          <Button
            size="small"
            variant="outlined"
            sx={{ whiteSpace: "nowrap", minWidth: 0, fontSize: "0.75rem" }}
            onClick={(e) => {
              e.stopPropagation();
              setRouteTarget(params.row);
            }}
          >
            路由权限
          </Button>
          <Tooltip title="删除">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget({
                  id: params.id as number,
                  name: params.row.username,
                });
              }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <ListPageLayout
      loading={loading}
      error={error}
      hasData={filteredRows.length > 0}
      emptyState={
        <>
          <EmptyState
            icon={<PeopleIcon />}
            title="用户管理"
            description={searchText ? "请调整搜索条件" : "暂无用户数据"}
            action={
              !searchText ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setCreateOpen(true)}
                >
                  新建用户
                </Button>
              ) : undefined
            }
          />
          <EmptyStateShortcutHint />
        </>
      }
    >
      <PageHeader title="用户管理" />
      <ResponsiveDataGrid
        rows={filteredRows}
        columns={columns}
        loading={loading}
        autoHeight
        paginationModel={paginationModel}
        rowCount={rowCount}
        paginationMode="server"
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100]}
        toolbarPageKey="admin_users"
      />
      {deleteError && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {deleteError}
        </Alert>
      )}
      <ConfirmModal
        open={!!deleteTarget}
        title="删除用户"
        description={`确定要删除用户"${deleteTarget?.name}"？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        confirmLoading={deleteLoading}
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      <Dialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>编辑用户角色 — {editTarget?.username}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>角色</InputLabel>
            <Select
              multiple
              value={editRoles}
              onChange={(e) => setEditRoles(e.target.value as number[])}
              input={<OutlinedInput label="角色" />}
              renderValue={(selected) => (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {selected.map((id) => {
                    const role = roles.find((r) => r.id === id);
                    return role ? (
                      <Chip key={id} label={role.name} size="small" />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  <Checkbox checked={editRoles.includes(role.id)} />
                  <ListItemText primary={role.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {editRoles.length > 0 && (
            <Box
              sx={{
                mt: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
                maxHeight: 320,
                overflow: "auto",
                borderTop: "1px solid",
                borderColor: "divider",
                pt: 1.5,
              }}
            >
              <Typography variant="subtitle2">所选角色权限细则</Typography>
              {editRoles.map((id) => {
                const role = roles.find((r) => r.id === id);
                return role ? (
                  <RolePermissionsContent key={id} role={role} compact />
                ) : null;
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>取消</Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={() => {
              void (async () => {
                if (!editTarget) return;
                setSaving(true);
                try {
                  await api.put(`/security/users/${editTarget.id}`, {
                    roles: editRoles.map((id) => id),
                  });
                  setEditTarget(null);
                  fetchData();
                } catch {
                  /* ignore */
                }
                setSaving(false);
              })();
            }}
          >
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!switchTarget}
        onClose={() => setSwitchTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <SwapHorizIcon color="warning" />
            切换到用户 — {switchTarget?.username}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            确定要以 <strong>{switchTarget?.username}</strong> 的身份登录？
            当前管理员会话将被保存，可通过用户菜单"切换回管理员"恢复。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSwitchTarget(null)}>取消</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={switching}
            onClick={() => {
              void (async () => {
                if (!switchTarget) return;
                setSwitching(true);
                try {
                  await switchToUser(switchTarget.username);
                  setSwitchTarget(null);
                  navigate("/");
                } catch {
                  setSwitching(false);
                }
              })();
            }}
          >
            {switching ? "切换中..." : "切换"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!routeTarget}
        onClose={() => setRouteTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <LockIcon />
            路由权限 — {routeTarget?.username}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            开启开关以授予该用户对此路由的访问权限。未设置的路由默认根据角色权限判断。
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {protectedRoutePaths.map((path) => {
              const userOverrides = routeTarget
                ? (routeOverrides[routeTarget.username] ?? {})
                : {};
              const isOverridden = userOverrides[path] !== undefined;
              const isGranted = userOverrides[path] === true;

              return (
                <Box
                  key={path}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    py: 1,
                    px: 1.5,
                    borderRadius: 1,
                    bgcolor: isOverridden ? "action.selected" : "transparent",
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {path}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      允许
                    </Typography>
                    <Switch
                      size="small"
                      checked={isGranted}
                      onChange={(e) => {
                        if (!routeTarget) return;
                        setOverride(
                          routeTarget.username,
                          path,
                          e.target.checked,
                        );
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRouteTarget(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
      <RolePermissionsDialog
        role={permRole}
        onClose={() => setPermRole(null)}
      />
      <Dialog
        open={createOpen}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PersonAddIcon color="primary" />
            新建用户
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 1 }}
          >
            <TextField
              autoFocus
              fullWidth
              required
              label="用户名"
              value={createForm.username}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, username: e.target.value }))
              }
              variant="outlined"
              size="small"
            />
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <TextField
                fullWidth
                required
                label="姓"
                value={createForm.lastName}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, lastName: e.target.value }))
                }
                variant="outlined"
                size="small"
              />
              <TextField
                fullWidth
                required
                label="名"
                value={createForm.firstName}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, firstName: e.target.value }))
                }
                variant="outlined"
                size="small"
              />
            </Box>
            <TextField
              fullWidth
              required
              label="邮箱"
              type="email"
              value={createForm.email}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, email: e.target.value }))
              }
              variant="outlined"
              size="small"
            />
            <TextField
              fullWidth
              required
              label="密码"
              type={showCreatePassword ? "text" : "password"}
              value={createForm.password}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, password: e.target.value }))
              }
              variant="outlined"
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Tooltip title="生成随机密码">
                        <IconButton
                          size="small"
                          onClick={generatePassword}
                          tabIndex={-1}
                        >
                          <CasinoIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label={
                          showCreatePassword ? "隐藏密码" : "显示密码"
                        }
                        onClick={() => setShowCreatePassword((v) => !v)}
                        tabIndex={-1}
                      >
                        {showCreatePassword ? (
                          <VisibilityOffIcon sx={{ fontSize: 18 }} />
                        ) : (
                          <VisibilityIcon sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <FormControl fullWidth>
              <InputLabel>角色</InputLabel>
              <Select
                multiple
                value={createForm.roleIds}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    roleIds: e.target.value as number[],
                  }))
                }
                input={<OutlinedInput label="角色" />}
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {selected.map((id) => {
                      const role = roles.find((r) => r.id === id);
                      return role ? (
                        <Chip key={id} label={role.name} size="small" />
                      ) : null;
                    })}
                  </Box>
                )}
              >
                {roles.map((role) => (
                  <MenuItem key={role.id} value={role.id}>
                    <Checkbox checked={createForm.roleIds.includes(role.id)} />
                    <ListItemText primary={role.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Switch
                size="small"
                checked={createForm.active}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, active: e.target.checked }))
                }
              />
              <Typography variant="body2" color="text.secondary">
                启用该用户（允许登录）
              </Typography>
            </Box>
            {createError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {createError}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button disabled={creating} onClick={() => setCreateOpen(false)}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={
              creating ||
              !createForm.username.trim() ||
              !createForm.email.trim() ||
              !createForm.firstName.trim() ||
              !createForm.lastName.trim() ||
              !createForm.password ||
              createForm.roleIds.length === 0
            }
            onClick={() => {
              void (async () => {
                setCreating(true);
                setCreateError(null);
                try {
                  await api.post("/security/users/", {
                    username: createForm.username.trim(),
                    email: createForm.email.trim(),
                    first_name: createForm.firstName.trim(),
                    last_name: createForm.lastName.trim(),
                    password: createForm.password,
                    active: createForm.active,
                    roles: createForm.roleIds,
                  });
                  setCreateOpen(false);
                  setCreateForm({
                    username: "",
                    email: "",
                    firstName: "",
                    lastName: "",
                    password: "",
                    active: true,
                    roleIds: [],
                  });
                  notify({
                    severity: "success",
                    message: `用户 ${createForm.username.trim()} 创建成功`,
                  });
                  fetchData();
                } catch (err: unknown) {
                  setCreateError(parseErrorMessage(err, "创建用户失败"));
                }
                setCreating(false);
              })();
            }}
          >
            {creating ? "创建中..." : "创建"}
          </Button>
        </DialogActions>
      </Dialog>
    </ListPageLayout>
  );
}
