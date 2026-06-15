import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FunctionsIcon from "@mui/icons-material/Functions";
import TableChartIcon from "@mui/icons-material/TableChart";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { useToolbarStore } from "@/store/toolbarStore";
import PageSpeedDial from "@/components/PageSpeedDial";
import ListPageLayout from "@/components/ListPageLayout";
import { ConfirmModal } from "@/superset-ui-mui/components";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";

import type { DatasetRow } from "@/types/api";

export default function DatasetList() {
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
  } = usePaginatedList<DatasetRow>({
    endpoint: "/dataset/",
    filterColumn: "table_name",
    pageSize: 25,
    errorMessage: "加载数据集失败",
  });
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);

  useEffect(() => {
    registerTools("dataset_list", [
      {
        id: "search",
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar
            value=""
            onChange={handleSearchChange}
            placeholder="搜索数据集..."
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
        fabIcon: <FunctionsIcon />,
        fabLabel: "新建数据集",
        action: () => navigate("/dataset/create"),
        render: null,
      },
    ]);
    return () => unregisterTools("dataset_list");
  }, [navigate, registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    { field: "id", headerName: "ID", width: 70 },
    { field: "table_name", headerName: "表名称", flex: 1, minWidth: 120 },
    {
      field: "schema",
      headerName: "模式",
      flex: 0.5,
      minWidth: 80,
      renderCell: (params) => {
        const value = params.value;
        if (!value) return null;
        return <Chip label={value} size="small" variant="outlined" />;
      },
    },
    {
      field: "database",
      headerName: "数据库",
      flex: 0.7,
      minWidth: 100,
      valueGetter: (_value, row) => row.database?.database_name ?? "",
    },
    {
      field: "changed_on_delta_humanized",
      headerName: "最后修改",
      flex: 0.6,
      minWidth: 100,
    },
    {
      field: "kind",
      headerName: "类型",
      flex: 0.4,
      minWidth: 80,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === "physical" ? "primary" : "secondary"}
          variant="outlined"
        />
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 80,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="编辑数据集">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/dataset/edit/${params.id}`);
              }}
            >
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="删除">
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget({
                  id: params.id as number,
                  name: params.row.table_name,
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
      hasData={rows.length > 0}
      emptyState={
        <>
          <EmptyState
            icon={<TableChartIcon />}
            title="未找到数据集"
            description={
              searchText
                ? "请调整搜索条件"
                : "创建第一个数据集开始构建图表"
            }
            action={
              !searchText ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => navigate("/dataset/create")}
                >
                  创建数据集
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
        paginationModel={paginationModel}
        rowCount={rowCount}
        paginationMode="server"
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100]}
        onRowClick={(params) => navigate(`/dataset/edit/${params.id}`)}
        onEdit={(row) => navigate(`/dataset/edit/${row.id as number}`)}
        toolbarPageKey="dataset_list"
        onDelete={(row) =>
          setDeleteTarget({ id: row.id, name: row.table_name })
        }
        onBatchDelete={async (ids) => {
          await Promise.all(ids.map((id) => api.delete(`/dataset/${id}`)));
          fetchData();
        }}
        renderCard={(row) => (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, lineHeight: 1.3, flex: 1 }}
              >
                {row.table_name}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 0.25 }}>
              {row.schema && (
                <Chip
                  label={row.schema}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 16,
                    fontSize: "0.75rem",
                    "& .MuiChip-label": { px: 0.5 },
                  }}
                />
              )}
              <Chip
                label={row.kind}
                size="small"
                color={row.kind === "physical" ? "primary" : "secondary"}
                variant="outlined"
                sx={{
                  height: 16,
                  fontSize: "0.75rem",
                  "& .MuiChip-label": { px: 0.5 },
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                {row.database?.database_name ?? "未知"}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", mt: 0.25 }}>
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
        title="删除数据集"
        description={`确定要删除"${deleteTarget?.name}"？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        confirmLoading={deleteLoading}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <PageSpeedDial pageKeys="dataset_list" />
    </ListPageLayout>
  );
}
