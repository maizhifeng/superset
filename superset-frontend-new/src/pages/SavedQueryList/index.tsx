import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import Typography from "@mui/material/Typography";
import CodeIcon from "@mui/icons-material/Code";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import ListPageLayout from "@/components/ListPageLayout";
import { ConfirmModal } from "@/superset-ui-mui/components";
import { useToolbarStore } from "@/store/toolbarStore";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { SavedQuery } from "@/types/api";

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

  useEffect(() => {
    registerTools("saved_query_list", [
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
  }, [registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    { field: "id", headerName: "ID", width: 70 },
    {
      field: "label",
      headerName: "标签",
      flex: 1,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {params.value}
        </Typography>
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
      valueGetter: (_value, row) => row.database?.database_name ?? "",
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
                name: params.row.label,
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
        rows={rows}
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
    </ListPageLayout>
  );
}
