import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DeleteIcon from "@mui/icons-material/Delete";
import StorageIcon from "@mui/icons-material/Storage";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { useToolbarStore } from "@/contexts/ToolbarContext";
import PageSpeedDial from "@/components/PageSpeedDial";
import ListPageLayout from "@/components/ListPageLayout";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { ConfirmModal } from "@/superset-ui-mui/components";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";

import type { Database } from "@/types/api";

export default function DatabaseList() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createUri, setCreateUri] = useState("");
  const [creating, setCreating] = useState(false);
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

  useEffect(() => {
    registerTools("database_list", [
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
      {
        id: "create",
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabIcon: <StorageIcon />,
        fabLabel: "连接数据库",
        action: () => setCreateDialogOpen(true),
        render: null,
      },
    ]);
    return () => unregisterTools("database_list");
  }, [registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    { field: "id", headerName: "ID", width: 70 },
    { field: "database_name", headerName: "数据库", flex: 1 },
    {
      field: "backend",
      headerName: "后端",
      flex: 0.4,
      renderCell: (params) => (
        <Chip label={params.value} size="small" variant="outlined" />
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
      width: 80,
      sortable: false,
      renderCell: (params) => (
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
            icon={<StorageIcon />}
            title="未连接数据库"
            description={
              searchText
                ? "请调整搜索条件"
                : "连接数据库开始探索您的数据"
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
        rows={rows}
        columns={columns}
        loading={loading}
        autoHeight
        paginationModel={paginationModel}
        rowCount={rowCount}
        paginationMode="server"
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100]}
        toolbarPageKey="database_list"
        onDelete={(row) =>
          setDeleteTarget({ id: row.id, name: row.database_name })
        }
        onBatchDelete={async (ids) => {
          await Promise.all(ids.map((id) => api.delete(`/database/${id}`)));
          fetchData();
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
                label={row.backend!}
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
        onConfirm={handleDelete}
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
            onChange={(e) => setCreateUri(e.target.value)}
            variant="outlined"
            size="small"
            placeholder="postgresql://user:pass@host:port/dbname"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={creating || !createName.trim() || !createUri.trim()}
            onClick={async () => {
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
            }}
          >
            {creating ? "连接中..." : "连接"}
          </Button>
        </DialogActions>
      </Dialog>
      <PageSpeedDial pageKeys="database_list" />
    </ListPageLayout>
  );
}
