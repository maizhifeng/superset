import { useEffect } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import NotificationsIcon from "@mui/icons-material/Notifications";
import VerifiedIcon from "@mui/icons-material/Verified";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PeopleIcon from "@mui/icons-material/People";
import Typography from "@mui/material/Typography";
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

import type { AlertReport } from "@/types/api";

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

  useEffect(() => {
    registerTools("alert_report_list", [
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
  }, [registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    { field: "id", headerName: "ID", width: 70 },
    { field: "name", headerName: "名称", flex: 1 },
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
        </Box>
      ),
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
                name: params.row.name,
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
            icon={<NotificationsIcon />}
            title="未找到警报或报告"
            description={
              searchText
                ? "请调整搜索条件"
                : "创建警报或报告以在条件满足时收到通知"
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
        toolbarPageKey="alert_report_list"
        onDelete={(row) => setDeleteTarget({ id: row.id, name: row.name })}
        onBatchDelete={async (ids) => {
          await Promise.all(ids.map((id) => api.delete(`/report/${id}`)));
          fetchData();
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
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </ListPageLayout>
  );
}
