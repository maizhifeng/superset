import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import BarChartIcon from "@mui/icons-material/BarChart";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import type {
  GridColDef,
  GridRowParams,
  GridSortModel,
} from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { ConfirmModal } from "@/superset-ui-mui/components";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { useToolbarStore } from "@/contexts/ToolbarContext";
import PageSpeedDial from "@/components/PageSpeedDial";
import ListPageLayout from "@/components/ListPageLayout";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { SortModel } from "@/hooks/usePaginatedList";

import type { ChartRow } from "@/types/api";

const vizTypeLabels: Record<string, string> = {
  line: "折线图",
  bar: "柱状图",
  table: "表格",
  pie: "饼图",
  histogram: "直方图",
  scatter: "散点图",
  big_number: "大数字",
  big_number_total: "大数字总计",
  time_table: "时间表",
  box_plot: "箱线图",
  treemap: "矩形树图",
  heatmap: "热力图",
  word_cloud: "词云",
  sunburst: "旭日图",
  sankey: "桑基图",
  map: "地图",
  deckgl: "Deck.gl",
};

export default function ChartList() {
  const navigate = useNavigate();
  const {
    rows,
    rowCount,
    loading,
    error,
    searchText,
    paginationModel,
    sortModel,
    deleteTarget,
    deleteLoading,
    deleteError,
    setPaginationModel,
    setSortModel,
    setDeleteTarget,
    handleSearchChange,
    handleDelete,
    fetchData,
  } = usePaginatedList<ChartRow>({
    endpoint: "/chart/",
    filterColumn: "slice_name",
    errorMessage: "加载图表失败",
    sortFieldMap: { created_by: "created_by.username" },
    defaultSortModel: [{ field: "changed_on_delta_humanized", sort: "desc" }],
  });
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);

  useEffect(() => {
    registerTools("chart_list", [
      {
        id: "search",
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar
            value=""
            onChange={handleSearchChange}
            placeholder="搜索图表..."
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
        fabIcon: <BarChartIcon />,
        fabLabel: "新建图表",
        action: () => navigate("/explore"),
        render: null,
      },
    ]);
    return () => unregisterTools("chart_list");
  }, [navigate, registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    { field: "id", headerName: "ID", width: 70 },
    {
      field: "slice_name",
      headerName: "图表名称",
      flex: 1,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "viz_type",
      headerName: "类型",
      flex: 0.4,
      minWidth: 100,
      renderCell: (params) => (
        <Chip
          label={vizTypeLabels[params.value] || params.value}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 500 }}
        />
      ),
    },
    {
      field: "datasource_name_text",
      headerName: "数据集",
      flex: 0.7,
      minWidth: 120,
      valueGetter: (_value, row) =>
        row.datasource_name_text || row.table?.table_name || "",
      renderCell: (params) => {
        const name = params.value;
        const id = params.row.datasource_id;
        if (!name && !id) return null;
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <TableChartOutlinedIcon
              sx={{ fontSize: 14, color: "primary.main", flexShrink: 0 }}
            />
            <Link
              component="button"
              variant="body2"
              underline="hover"
              onClick={(e) => {
                e.stopPropagation();
                if (id) {
                  navigate(`/dataset/list?datasource_id=${id}`);
                }
              }}
              sx={{ fontSize: "0.8125rem", textAlign: "left" }}
            >
              {name}
            </Link>
          </Box>
        );
      },
    },
    {
      field: "created_by",
      headerName: "创建者",
      flex: 0.4,
      minWidth: 100,
      valueGetter: (_value, row) => row.created_by?.username ?? "",
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
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="编辑图表">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/explore?slice_id=${params.id}`);
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
                  id: params.id as number,
                  name: params.row.slice_name,
                });
              }}
            >
              <DeleteIcon sx={{ fontSize: 16, color: "error.main" }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const handleRowClick = (params: GridRowParams) => {
    navigate(`/explore?slice_id=${params.id}`);
  };

  return (
    <ListPageLayout
      loading={loading}
      error={error}
      hasData={rows.length > 0}
      emptyState={
        <>
          <EmptyState
            icon={<BarChartIcon />}
            title="未找到图表"
            description={
              searchText
                ? "请调整搜索条件"
                : "创建第一个图表开始数据可视化"
            }
            action={
              !searchText ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => navigate("/explore")}
                >
                  创建图表
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
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={(model: GridSortModel) =>
          setSortModel(model.filter((s) => s.sort != null) as SortModel[])
        }
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100]}
        onRowClick={handleRowClick}
        onEdit={(row) => navigate(`/explore?slice_id=${row.id}`)}
        toolbarPageKey="chart_list"
        onDelete={(row) =>
          setDeleteTarget({ id: row.id, name: row.slice_name })
        }
        onBatchDelete={async (ids) => {
          await Promise.all(ids.map((id) => api.delete(`/chart/${id}`)));
          fetchData();
        }}
        renderCard={(row) => (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {row.slice_name}
              </Typography>
              <Chip
                label={vizTypeLabels[row.viz_type] || row.viz_type}
                size="small"
                variant="outlined"
                sx={{
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  height: 16,
                  flexShrink: 0,
                  "& .MuiChip-label": { px: 0.5 },
                }}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 0.25 }}>
              <TableChartOutlinedIcon
                sx={{ fontSize: 10, color: "primary.main" }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem", lineHeight: 1 }}
              >
                {row.datasource_name_text ||
                  row.table?.table_name ||
                  "未知"}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                mt: 0.25,
              }}
            >
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem" }}
              >
                {row.created_by?.username ?? "无"}
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
        title="删除图表"
        description={`确定要删除"${deleteTarget?.name}"？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        confirmLoading={deleteLoading}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <PageSpeedDial pageKeys="chart_list" />
    </ListPageLayout>
  );
}
