import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import SecurityIcon from "@mui/icons-material/Security";
import InfoIcon from "@mui/icons-material/InfoOutlined";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import CodeIcon from "@mui/icons-material/Code";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import RefreshIcon from "@mui/icons-material/Refresh";
import PeopleIcon from "@mui/icons-material/People";
import DownloadIcon from "@mui/icons-material/Download";
import { downloadCsv } from "@/utils/exportCsv";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import PageHeader from "@/components/PageHeader";
import { useToolbarStore } from "@/store/toolbarStore";
import ListPageLayout from "@/components/ListPageLayout";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { ConfirmModal } from "@/superset-ui-mui/components";
import RolePermissionsDialog, {
  type RolePermissionsTarget,
} from "@/components/RolePermissionsDialog";
import api from "@/api";
import { useNotificationStore } from "@/store/notificationStore";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { AdminRole } from "@/types/api";

export default function AdminRoles() {
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
  } = usePaginatedList<AdminRole>({
    endpoint: "/security/roles/search/",
    filterColumn: "name",
    errorMessage: "加载角色列表失败",
  });

  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);
  const notify = useNotificationStore((s) => s.notify);
  const [hasUsersOnly, setHasUsersOnly] = useState(false);
  const filteredRoles = hasUsersOnly
    ? rows.filter((r) => (r.user_ids?.length ?? 0) > 0)
    : rows;

  /** 复制角色名到剪贴板。 */
  const handleCopyRoleName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      notify({ severity: "success", message: `已复制角色名 ${name}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制角色配置（名称 + 权限 id 列表）为 JSON。 */
  const handleCopyRoleConfig = async (
    name: string,
    permissionIds: number[],
  ) => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ role: name, permission_ids: permissionIds }, null, 2),
      );
      notify({ severity: "success", message: "已复制角色配置 (JSON)" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制角色的权限 id 列表（逗号分隔）。 */
  const handleCopyPermissionIds = async (permissionIds: number[]) => {
    if (permissionIds.length === 0) {
      notify({ severity: "warning", message: "该角色暂无权限" });
      return;
    }
    try {
      await navigator.clipboard.writeText(permissionIds.join(","));
      notify({
        severity: "success",
        message: `已复制 ${permissionIds.length} 个权限 ID`,
      });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  /** 导出当前加载的角色列表为 CSV。 */
  const handleExportCsv = useCallback(() => {
    if (filteredRoles.length === 0) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      ["ID", "角色名称", "用户数", "权限数"],
      filteredRoles.map((r) => ({
        ID: r.id,
        角色名称: r.name,
        用户数: r.user_ids?.length ?? 0,
        权限数: r.permission_ids?.length ?? 0,
      })),
      `roles-${ts}.csv`,
    );
  }, [filteredRoles]);

  /** 复制所有角色的权限 id（去重、逗号分隔）。 */
  const handleCopyAllPermissionIds = useCallback(async () => {
    const ids = Array.from(
      new Set(filteredRoles.flatMap((r) => r.permission_ids ?? [])),
    );
    if (ids.length === 0) {
      notify({ severity: "warning", message: "暂无权限数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(ids.join(","));
      notify({ severity: "success", message: `已复制 ${ids.length} 个权限 ID` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [filteredRoles, notify]);

  /** 复制当前加载的角色名（每行一个）。 */
  const handleCopyAllRoleNames = useCallback(async () => {
    const names = filteredRoles.map((r) => r.name).filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "暂无角色数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      notify({ severity: "success", message: `已复制 ${names.length} 个角色名` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [filteredRoles, notify]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [permTarget, setPermTarget] = useState<RolePermissionsTarget | null>(
    null,
  );
  const [duplicateTarget, setDuplicateTarget] = useState<{
    id: number;
    name: string;
    permissionIds: number[];
  } | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    registerTools("admin_roles", [
      {
        id: "add",
        priority: 6,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "新建角色",
        action: () => setCreateOpen(true),
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
        id: "users_filter",
        priority: 2.5,
        showOnMobile: false,
        render: (
          <Tooltip title={hasUsersOnly ? "显示全部角色" : "仅显示有用户分配的角色"}>
            <Button
              size="small"
              variant={hasUsersOnly ? "contained" : "text"}
              color={hasUsersOnly ? "info" : "inherit"}
              startIcon={<PeopleIcon sx={{ fontSize: 16 }} />}
              onClick={() => setHasUsersOnly((v) => !v)}
              sx={{ textTransform: "none", minWidth: 90 }}
            >
              有用户
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "export",
        priority: 2,
        showOnMobile: false,
        render: (
          <Tooltip title="导出当前角色列表为 CSV">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
              onClick={handleExportCsv}
              disabled={filteredRoles.length === 0}
              sx={{ textTransform: "none" }}
            >
              导出 CSV
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "copy_role_names",
        priority: 1.75,
        showOnMobile: false,
        render: (
          <Tooltip title="复制当前加载的角色名列表">
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllRoleNames()}
              disabled={filteredRoles.length === 0}
              sx={{ textTransform: "none" }}
            >
              复制角色名
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "copy_perm_ids",
        priority: 1.5,
        showOnMobile: false,
        render: (
          <Tooltip title="复制所有角色的权限 ID（去重）">
            <Button
              size="small"
              variant="outlined"
              startIcon={<FormatListNumberedIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllPermissionIds()}
              disabled={filteredRoles.length === 0}
              sx={{ textTransform: "none" }}
            >
              复制权限 ID
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
            placeholder="搜索角色..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("admin_roles");
  }, [registerTools, unregisterTools, handleSearchChange, fetchData, loading, handleExportCsv, handleCopyAllRoleNames, handleCopyAllPermissionIds, hasUsersOnly, setHasUsersOnly, filteredRoles.length]);

  const columns: GridColDef[] = [
    {
      field: "id",
      headerName: "ID",
      width: 70,
      headerAlign: "center",
      align: "center",
    },
    {
      field: "name",
      headerName: "角色名称",
      flex: 1,
      minWidth: 140,
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
          <Tooltip title="复制角色名">
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              onClick={(e) => {
                e.stopPropagation();
                void handleCopyRoleName(params.value);
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    {
      field: "user_ids",
      headerName: "用户数",
      width: 90,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Chip
          label={params.value?.length ?? 0}
          size="small"
          color="primary"
          variant="outlined"
        />
      ),
    },
    {
      field: "permission_ids",
      headerName: "权限数",
      width: 90,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Chip
          label={params.value?.length ?? 0}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: "actions",
      headerName: "操作",
      width: 226,
      sortable: false,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.25, alignItems: "center" }}>
          <Tooltip title="复制角色名">
            <IconButton
              size="small"
              onClick={() => void handleCopyRoleName(params.row.name)}
            >
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="权限细则">
            <IconButton
              size="small"
              onClick={() =>
                setPermTarget({
                  id: params.id as number,
                  name: params.row.name,
                  permissionIds: params.row.permission_ids,
                })
              }
            >
              <InfoIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制权限 ID 列表">
            <IconButton
              size="small"
              onClick={() => void handleCopyPermissionIds(params.row.permission_ids ?? [])}
            >
              <FormatListNumberedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制角色">
            <IconButton
              size="small"
              onClick={() => {
                setDuplicateName(`${params.row.name}_副本`);
                setDuplicateTarget({
                  id: params.id as number,
                  name: params.row.name,
                  permissionIds: params.row.permission_ids ?? [],
                });
              }}
            >
              <FileCopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制配置 (JSON)">
            <IconButton
              size="small"
              onClick={() =>
                void handleCopyRoleConfig(
                  params.row.name,
                  params.row.permission_ids ?? [],
                )
              }
            >
              <CodeIcon sx={{ fontSize: 16 }} />
            </IconButton>
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
    <ListPageLayout
      loading={loading}
      error={error}
      hasData={filteredRoles.length > 0}
      emptyState={
        <>
          <EmptyState
            icon={<SecurityIcon />}
            title="角色管理"
            description={searchText ? "请调整搜索条件" : "暂无角色数据"}
            action={
              !searchText ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setCreateOpen(true)}
                >
                  新建角色
                </Button>
              ) : undefined
            }
          />
          <EmptyStateShortcutHint />
        </>
      }
    >
      <PageHeader title="角色管理" />
      <ResponsiveDataGrid
        rows={filteredRoles}
        columns={columns}
        loading={loading}
        autoHeight
        paginationModel={paginationModel}
        rowCount={rowCount}
        paginationMode="server"
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100]}
        toolbarPageKey="admin_roles"
      />
      {deleteError && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {deleteError}
        </Alert>
      )}
      <ConfirmModal
        open={!!deleteTarget}
        title="删除角色"
        description={`确定要删除角色"${deleteTarget?.name}"？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        confirmLoading={deleteLoading}
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      <RolePermissionsDialog
        role={permTarget}
        onClose={() => setPermTarget(null)}
      />
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>新建角色</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="角色名称"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={creating || !createName.trim()}
            onClick={() => {
              void (async () => {
                setCreating(true);
                try {
                  await api.post("/security/roles/", {
                    name: createName.trim(),
                  });
                  setCreateOpen(false);
                  setCreateName("");
                  fetchData();
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
      <Dialog
        open={!!duplicateTarget}
        onClose={() => !duplicating && setDuplicateTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>复制角色</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            将复制角色"{duplicateTarget?.name}"的权限到新角色。
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="新角色名称"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            variant="outlined"
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateTarget(null)} disabled={duplicating}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={duplicating || !duplicateName.trim()}
            onClick={() => {
              void (async () => {
                if (!duplicateTarget) return;
                setDuplicating(true);
                try {
                  const created = await api.post<{ id?: number }>(
                    "/security/roles/",
                    { name: duplicateName.trim() },
                  );
                  const newId =
                    created.data.id ?? (created.data as { result?: { id?: number } }).result?.id;
                  if (typeof newId !== "number") {
                    throw new Error("创建角色返回缺少 id");
                  }
                  // 把源角色的权限复制到新角色（新角色本身无权限）。
                  if (duplicateTarget.permissionIds.length > 0) {
                    await api.post(`/security/roles/${newId}/permissions`, {
                      permission_view_menu_ids: duplicateTarget.permissionIds,
                    });
                  }
                  notify({
                    severity: "success",
                    message: `已复制角色"${duplicateTarget.name}"为"${duplicateName.trim()}"`,
                  });
                  setDuplicateTarget(null);
                  setDuplicateName("");
                  fetchData();
                } catch {
                  notify({
                    severity: "error",
                    message: "复制角色失败",
                  });
                }
                setDuplicating(false);
              })();
            }}
          >
            {duplicating ? "复制中..." : "复制"}
          </Button>
        </DialogActions>
      </Dialog>
    </ListPageLayout>
  );
}
