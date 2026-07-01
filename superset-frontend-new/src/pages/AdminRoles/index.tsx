import { useEffect, useState } from "react";
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
import DeleteIcon from "@mui/icons-material/Delete";
import SecurityIcon from "@mui/icons-material/Security";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { useToolbarStore } from "@/store/toolbarStore";
import PageSpeedDial from "@/components/PageSpeedDial";
import ListPageLayout from "@/components/ListPageLayout";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { ConfirmModal } from "@/superset-ui-mui/components";
import api from "@/api";
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

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    registerTools("admin_roles", [
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
      {
        id: "create",
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabIcon: <SecurityIcon />,
        fabLabel: "新建角色",
        action: () => setCreateOpen(true),
        render: null,
      },
    ]);
    return () => unregisterTools("admin_roles");
  }, [registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    {
      field: "id",
      headerName: "ID",
      width: 70,
      headerAlign: "center",
      align: "center",
    },
    { field: "name", headerName: "角色名称", flex: 1, minWidth: 140 },
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
      width: 80,
      sortable: false,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Tooltip title="删除">
          <IconButton
            size="small"
            onClick={() =>
              setDeleteTarget({ id: params.id as number, name: params.row.name })
            }
          >
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
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
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
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
            onClick={async () => {
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
            }}
          >
            {creating ? "创建中..." : "创建"}
          </Button>
        </DialogActions>
      </Dialog>
      <PageSpeedDial pageKeys="admin_roles" />
    </ListPageLayout>
  );
}
