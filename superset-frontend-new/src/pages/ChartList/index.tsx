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
  line: "Line Chart",
  bar: "Bar Chart",
  table: "Table",
  pie: "Pie Chart",
  histogram: "Histogram",
  scatter: "Scatter Plot",
  big_number: "Big Number",
  big_number_total: "Big Number Total",
  time_table: "Time Table",
  box_plot: "Box Plot",
  treemap: "Treemap",
  heatmap: "Heatmap",
  word_cloud: "Word Cloud",
  sunburst: "Sunburst",
  sankey: "Sankey",
  map: "Map",
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
    errorMessage: "Failed to load charts",
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
            placeholder="Search charts..."
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
        fabLabel: "New Chart",
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
      headerName: "Chart Name",
      flex: 1,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "viz_type",
      headerName: "Type",
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
      headerName: "Dataset",
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
      headerName: "Created By",
      flex: 0.4,
      minWidth: 100,
      valueGetter: (_value, row) => row.created_by?.username ?? "",
    },
    {
      field: "changed_on_delta_humanized",
      headerName: "Last Modified",
      flex: 0.4,
    },
    {
      field: "actions",
      headerName: "",
      width: 80,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Edit chart">
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
          <Tooltip title="Delete">
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
            title="No charts found"
            description={
              searchText
                ? "Try adjusting your search query"
                : "Create your first chart to get started with data visualization"
            }
            action={
              !searchText ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => navigate("/explore")}
                >
                  Create Chart
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
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                columnGap: 0.5,
                mt: 0.25,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
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
                    "Unknown"}
                </Typography>
              </Box>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem" }}
              >
                {row.created_by?.username ?? "N/A"}
                {row.changed_on_delta_humanized
                  ? ` · ${row.changed_on_delta_humanized}`
                  : ""}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/explore?slice_id=${row.id}`);
                }}
                sx={{ p: 0.25 }}
              >
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({ id: row.id, name: row.slice_name });
                }}
                sx={{ p: 0.25, color: "error.main" }}
              >
                <DeleteIcon sx={{ fontSize: 14 }} />
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
        title="Delete Chart"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmLoading={deleteLoading}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <PageSpeedDial pageKeys="chart_list" />
    </ListPageLayout>
  );
}
