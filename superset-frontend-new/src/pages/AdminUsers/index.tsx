import { useEffect, useState } from "react";
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
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import Switch from "@mui/material/Switch";
import DeleteIcon from "@mui/icons-material/Delete";
import PeopleIcon from "@mui/icons-material/People";
import LockIcon from "@mui/icons-material/Lock";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { useToolbarStore } from "@/store/toolbarStore";
import ListPageLayout from "@/components/ListPageLayout";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { ConfirmModal } from "@/superset-ui-mui/components";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { useAuthStore } from "@/store/authStore";
import { protectedRoutePaths } from "@/config/routePermissions";
import type { AdminUser, AdminRole } from "@/types/api";

export default function AdminUsers() {
  const navigate = useNavigate();
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

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [editRoles, setEditRoles] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const [routeTarget, setRouteTarget] = useState<AdminUser | null>(null);
  const routeOverrides = useUserRouteOverrides((s) => s.overrides);
  const setOverride = useUserRouteOverrides((s) => s.setOverride);

  const [switchTarget, setSwitchTarget] = useState<AdminUser | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    api.get<{ result: AdminRole[] }>("/security/roles/?q=(page_size:200)").then((res) => {
      if (res.data?.result) setRoles(res.data.result);
    });
  }, []);

  useEffect(() => {
    registerTools("admin_users", [
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
  }, [registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    {
      field: "id",
      headerName: "ID",
      width: 60,
      headerAlign: "center",
      align: "center",
    },
    { field: "username", headerName: "用户名", flex: 1, minWidth: 100 },
    { field: "email", headerName: "邮箱", flex: 1.5, minWidth: 140 },
    {
      field: "is_active",
      headerName: "状态",
      width: 70,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Chip
          label={params.value ? "活跃" : "禁用"}
          color={params.value ? "success" : "default"}
          size="small"
          variant={params.value ? "filled" : "outlined"}
        />
      ),
    },
    {
      field: "roles",
      headerName: "角色",
      flex: 1,
      minWidth: 100,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {params.value?.map((r: { id: number; name: string }) => (
            <Chip key={r.id} label={r.name} size="small" variant="outlined" />
          ))}
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
        <Typography variant="body2" color="text.secondary" noWrap>
          {params.value
            ? new Date(params.value).toLocaleDateString() +
              " " +
              new Date(params.value).toLocaleTimeString()
            : "-"}
        </Typography>
      ),
    },
    {
      field: "actions",
      headerName: "操作",
      width: 310,
      sortable: false,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          <Button
            size="small"
            variant="outlined"
            sx={{ whiteSpace: "nowrap", minWidth: 0, fontSize: "0.75rem" }}
            onClick={(e) => {
              e.stopPropagation();
              setEditTarget(params.row);
              setEditRoles(params.row.roles?.map((r: { id: number }) => r.id) ?? []);
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
                setDeleteTarget({ id: params.id as number, name: params.row.username });
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
      hasData={rows.length > 0}
      emptyState={
        <>
          <EmptyState
            icon={<PeopleIcon />}
            title="用户管理"
            description={searchText ? "请调整搜索条件" : "暂无用户数据"}
          />
          <EmptyStateShortcutHint />
        </>
      }
    >
      <ResponsiveDataGrid
        rows={rows}
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
        onConfirm={handleDelete}
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>取消</Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={async () => {
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
            onClick={async () => {
              if (!switchTarget) return;
              setSwitching(true);
              try {
                await switchToUser(switchTarget.username);
                setSwitchTarget(null);
                navigate("/");
              } catch {
                setSwitching(false);
              }
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
                ? routeOverrides[routeTarget.username] ?? {}
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
                    bgcolor: isOverridden
                      ? "action.selected"
                      : "transparent",
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
    </ListPageLayout>
  );
}
