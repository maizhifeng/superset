import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import HistoryIcon from "@mui/icons-material/History";
import PersonIcon from "@mui/icons-material/Person";
import BarChartIcon from "@mui/icons-material/BarChart";
import AddIcon from "@mui/icons-material/Add";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import type {
  GridColDef,
  GridRowParams,
  GridSortModel,
} from "@mui/x-data-grid";
import Card from "@mui/material/Card";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { ConfirmModal } from "@/superset-ui-mui/components";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { useToolbarStore } from "@/store/toolbarStore";
import { useChartFavorites } from "@/store/chartFavorites";
import { useRecentCharts } from "@/store/recentCharts";
import { useNotificationStore } from "@/store/notificationStore";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import { downloadCsv } from "@/utils/exportCsv";
import { formatRelativeTime } from "@/utils/datetime";
import { useAuthStore } from "@/store/authStore";
import ListPageLayout from "@/components/ListPageLayout";
import PageFrame from "@/components/PageFrame";
import ToolbarSelect from "@/components/ToolbarSelect";
import IdCell from "@/components/IdCell";
import { formatPersonName } from "@/utils/displayName";
import StatusChip from "@/components/StatusChip";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { SortModel } from "@/hooks/usePaginatedList";

import type { ChartRow } from "@/types/api";

const VIZ_FILTER_KEY = "superset-chart-viz-type-filter";

/** localStorage 键：记住图表列表的最近/收藏/仅我的筛选开关。 */
const TOGGLE_KEY = "superset-chart-list-toggles";

function readToggleState(name: "favorites" | "recent" | "mine"): boolean {
  try {
    const raw = localStorage.getItem(TOGGLE_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    return obj[name] === true;
  } catch {
    return false;
  }
}

const vizTypeLabels: Record<string, string> = {
  pivot_table_v2: "透视表",
  pivot_table: "透视表",
  echarts_timeseries_line: "折线图",
  echarts_timeseries_bar: "柱状图",
  echarts_timeseries: "时间序列",
  dist_bar: "柱状图",
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
    setExtraFilters,
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
  const favIds = useChartFavorites((s) => s.ids);
  const toggleFavorite = useChartFavorites((s) => s.toggle);
  const recentItems = useRecentCharts((s) => s.items);
  const recentIds = useMemo(
    () => new Set(recentItems.map((x) => x.id)),
    [recentItems],
  );
  const [favoritesOnly, setFavoritesOnly] = useState(() =>
    readToggleState("favorites"),
  );
  const [recentOnly, setRecentOnly] = useState(() => readToggleState("recent"));
  const [mineOnly, setMineOnly] = useState(() => readToggleState("mine"));
  const currentUsername = useAuthStore((s) => s.user?.username ?? "");
  const [vizTypeFilter, setVizTypeFilter] = useState(
    () => localStorage.getItem(VIZ_FILTER_KEY) ?? "",
  );
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const notify = useNotificationStore((s) => s.notify);

  useEffect(() => {
    localStorage.setItem(
      TOGGLE_KEY,
      JSON.stringify({
        favorites: favoritesOnly,
        recent: recentOnly,
        mine: mineOnly,
      }),
    );
  }, [favoritesOnly, recentOnly, mineOnly]);

  /** 复制图表：拉取图表详情并带新名称重新创建一份副本。 */
  const handleDuplicate = useCallback(
    async (row: ChartRow) => {
      if (duplicatingId !== null) return;
      setDuplicatingId(row.id);
      try {
        const detail = await api.get<{
          result: {
            slice_name?: string;
            viz_type?: string;
            datasource_id?: number;
            datasource_type?: string;
            params?: string | null;
            query_context?: string | null;
          };
        }>(`/chart/${row.id}`);
        const r = detail.data.result;
        const name = r?.slice_name ?? row.slice_name;
        if (!r?.params) {
          throw new Error("图表详情缺少 params");
        }
        await api.post("/chart/", {
          slice_name: `${name}_副本`,
          viz_type: r.viz_type ?? row.viz_type,
          datasource_id: Number(r.datasource_id ?? row.datasource_id),
          datasource_type: r.datasource_type ?? "table",
          params: r.params,
          query_context: r.query_context ?? undefined,
        });
        notify({ severity: "success", message: `已复制图表"${name}"` });
        fetchData();
      } catch (err: unknown) {
        notify({
          severity: "error",
          message: parseErrorMessage(err, "复制图表失败"),
        });
      } finally {
        setDuplicatingId(null);
      }
    },
    [notify, fetchData, duplicatingId],
  );

  /** 复制某个图表在 Explore 中的直达链接。 */
  const handleCopyChartLink = useCallback(
    async (id: number) => {
      try {
        await navigator.clipboard.writeText(
          `${window.location.origin}/explore?slice_id=${id}`,
        );
        notify({ severity: "success", message: "已复制图表链接" });
      } catch {
        notify({ severity: "error", message: "复制失败" });
      }
    },
    [notify],
  );

  /** 复制图表名称到剪贴板。 */
  const handleCopyName = useCallback(
    async (name: string) => {
      try {
        await navigator.clipboard.writeText(name);
        notify({ severity: "success", message: "已复制图表名" });
      } catch {
        notify({ severity: "error", message: "复制失败" });
      }
    },
    [notify],
  );

  /** 复制图表的数据集名称。 */
  const handleCopyDatasetName = useCallback(
    async (name: string) => {
      if (!name) return;
      try {
        await navigator.clipboard.writeText(name);
        notify({ severity: "success", message: `已复制数据集名 ${name}` });
      } catch {
        notify({ severity: "error", message: "复制失败" });
      }
    },
    [notify],
  );

  const handleVizTypeFilter = useCallback(
    (value: string) => {
      setVizTypeFilter(value);
      if (value) localStorage.setItem(VIZ_FILTER_KEY, value);
      else localStorage.removeItem(VIZ_FILTER_KEY);
      setExtraFilters(value ? [{ col: "viz_type", opr: "eq", value }] : []);
    },
    [setExtraFilters],
  );

  // 挂载时把持久化保存的图表类型筛选应用到服务端查询。
  useEffect(() => {
    if (vizTypeFilter) {
      setExtraFilters([{ col: "viz_type", opr: "eq", value: vizTypeFilter }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!favoritesOnly || favIds.includes(r.id)) &&
          (!recentOnly || recentIds.has(r.id)) &&
          (!mineOnly || r.created_by?.username === currentUsername),
      ),
    [
      rows,
      favoritesOnly,
      recentOnly,
      mineOnly,
      currentUsername,
      favIds,
      recentIds,
    ],
  );

  /** 复制当前筛选后的图表名（每行一个）。 */
  const handleCopyAllChartNames = useCallback(async () => {
    const names = visibleRows.map((r) => r.slice_name).filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "暂无图表数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      notify({
        severity: "success",
        message: `已复制 ${names.length} 个图表名`,
      });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [visibleRows, notify]);

  /** 导出当前筛选后的图表列表为 CSV。 */
  const handleExportCsv = useCallback(() => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      ["名称", "类型", "创建人", "最后修改", "链接"],
      visibleRows.map((c) => ({
        名称: c.slice_name,
        类型: c.viz_type,
        创建人: c.created_by?.username ?? "",
        最后修改: formatRelativeTime(c.changed_on_utc),
        链接: `${window.location.origin}/explore?slice_id=${c.id}`,
      })),
      `charts-${ts}.csv`,
    );
  }, [visibleRows]);

  useEffect(() => {
    registerTools("chart_list", [
      {
        id: "add",
        priority: 6,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "新建图表",
        action: () => navigate("/explore"),
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
        id: "recent_filter",
        priority: 4,
        showOnMobile: false,
        render: (
          <Tooltip title={recentOnly ? "显示全部图表" : "仅显示最近打开的图表"}>
            <Button
              size="small"
              variant={recentOnly ? "contained" : "text"}
              color={recentOnly ? "primary" : "inherit"}
              startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
              onClick={() => setRecentOnly((v) => !v)}
              sx={{ textTransform: "none", minWidth: 90 }}
            >
              最近
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "fav_filter",
        priority: 3,
        showOnMobile: false,
        render: (
          <Tooltip title={favoritesOnly ? "显示全部图表" : "仅显示收藏图表"}>
            <Button
              size="small"
              variant={favoritesOnly ? "contained" : "text"}
              color={favoritesOnly ? "warning" : "inherit"}
              startIcon={
                favoritesOnly ? (
                  <StarIcon sx={{ fontSize: 16 }} />
                ) : (
                  <StarBorderIcon sx={{ fontSize: 16 }} />
                )
              }
              onClick={() => setFavoritesOnly((v) => !v)}
              sx={{ textTransform: "none", minWidth: 90 }}
            >
              收藏
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "mine_filter",
        priority: 2.5,
        showOnMobile: false,
        render: (
          <Tooltip title={mineOnly ? "显示全部图表" : "仅显示我创建的图表"}>
            <Button
              size="small"
              variant={mineOnly ? "contained" : "text"}
              color={mineOnly ? "info" : "inherit"}
              startIcon={<PersonIcon sx={{ fontSize: 16 }} />}
              onClick={() => setMineOnly((v) => !v)}
              disabled={!currentUsername}
              sx={{ textTransform: "none", minWidth: 90 }}
            >
              仅我的
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "export",
        priority: 2,
        showOnMobile: false,
        render: null,
        variant: "menu",
        fabIcon: <DownloadIcon sx={{ fontSize: 16 }} />,
        fabLabel: "导出 CSV",
        action: handleExportCsv,
      },
      {
        id: "copy_names",
        priority: 1.5,
        showOnMobile: false,
        render: null,
        variant: "menu",
        fabIcon: <ContentCopyIcon sx={{ fontSize: 16 }} />,
        fabLabel: "复制图表名",
        action: () => void handleCopyAllChartNames(),
      },
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
        id: "viz_type_filter",
        priority: 4,
        showOnMobile: false,
        render: (
          <ToolbarSelect
            label="图表类型"
            value={vizTypeFilter}
            onChange={handleVizTypeFilter}
            minWidth={150}
            options={[
              { value: "", label: "全部" },
              ...Object.entries(vizTypeLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
        ),
      },
    ]);
    return () => unregisterTools("chart_list");
  }, [
    registerTools,
    unregisterTools,
    handleSearchChange,
    handleVizTypeFilter,
    vizTypeFilter,
    favoritesOnly,
    recentOnly,
    mineOnly,
    currentUsername,
    setMineOnly,
    handleExportCsv,
    handleCopyAllChartNames,
    visibleRows.length,
    fetchData,
    loading,
    navigate,
  ]);

  const columns: GridColDef[] = [
    {
      field: "id",
      headerName: "ID",
      width: 84,
      renderCell: (params) => (
        <IdCell id={params.value as number} entity="图表" />
      ),
    },
    {
      field: "slice_name",
      headerName: "图表名称",
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            minWidth: 0,
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          <Typography
            variant="body2"
            title={params.value ?? ""}
            sx={{
              fontWeight: 500,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {params.value}
          </Typography>
          <Tooltip title="复制图表名">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                void handleCopyName(params.value ?? "");
              }}
              sx={{ p: 0.25, flexShrink: 0 }}
            >
              <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
    {
      field: "viz_type",
      headerName: "类型",
      flex: 0.4,
      minWidth: 100,
      renderCell: (params) => {
        const label = vizTypeLabels[params.value] || params.value;
        return (
          <Box
            title={label}
            sx={{ maxWidth: "100%", minWidth: 0, overflow: "hidden" }}
          >
            <StatusChip dot={false} label={label} />
          </Box>
        );
      },
    },
    {
      field: "datasource_name_text",
      headerName: "数据集",
      flex: 0.7,
      minWidth: 200,
      valueGetter: (_value, row) =>
        row.datasource_name_text || row.table?.table_name || "",
      renderCell: (params) => {
        const name = params.value;
        const id = params.row.datasource_id;
        if (!name && !id) return null;
        return (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            <TableChartOutlinedIcon
              sx={{ fontSize: 14, color: "primary.main", flexShrink: 0 }}
            />
            <Link
              component="button"
              variant="body2"
              underline="hover"
              title={name ?? ""}
              onClick={(e) => {
                e.stopPropagation();
                if (id) {
                  navigate(`/dataset/list?datasource_id=${id}`);
                }
              }}
              sx={{
                fontSize: "0.8125rem",
                textAlign: "left",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </Link>
            {name ? (
              <Tooltip title="复制数据集名">
                <IconButton
                  size="small"
                  sx={{ p: 0.25, flexShrink: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopyDatasetName(name);
                  }}
                >
                  <ContentCopyIcon
                    sx={{ fontSize: 13, color: "text.disabled" }}
                  />
                </IconButton>
              </Tooltip>
            ) : null}
          </Box>
        );
      },
    },
    {
      field: "created_by",
      headerName: "创建者",
      flex: 0.4,
      minWidth: 100,
      valueGetter: (_value, row) => formatPersonName(row.created_by),
    },
    {
      field: "changed_on_delta_humanized",
      headerName: "最后修改",
      flex: 0.4,
      minWidth: 110,
      valueGetter: (_value, row) => formatRelativeTime(row.changed_on_utc),
    },
    {
      field: "actions",
      headerName: "操作",
      width: 196,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 0.25 }}>
          <Tooltip
            title={favIds.includes(params.id as number) ? "取消收藏" : "收藏"}
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(params.id as number);
              }}
            >
              {favIds.includes(params.id as number) ? (
                <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
              ) : (
                <StarBorderIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
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
          <Tooltip title="复制图表">
            <IconButton
              size="small"
              disabled={duplicatingId === params.id}
              onClick={(e) => {
                e.stopPropagation();
                void handleDuplicate(params.row);
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制图表链接">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                void handleCopyChartLink(params.id as number);
              }}
            >
              <LinkIcon sx={{ fontSize: 16 }} />
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
    <PageFrame
      page="chart_list"
      loading={loading}
      title="图表"
      subtitle={`共 ${rowCount} 项`}
    >
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
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
                  searchText ? "请调整搜索条件" : "创建第一个图表开始数据可视化"
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
            rows={visibleRows}
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
            onBatchDelete={(ids) => {
              void (async () => {
                await Promise.all(ids.map((id) => api.delete(`/chart/${id}`)));
                fetchData();
              })();
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
                    gap: 0.25,
                    mt: 0.25,
                  }}
                >
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
                    {formatPersonName(row.created_by) || "无"}
                    {` · ${formatRelativeTime(row.changed_on_utc)}`}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(row.id);
                  }}
                  sx={{ mt: 0.25, p: 0.25 }}
                  aria-label={favIds.includes(row.id) ? "取消收藏" : "收藏"}
                >
                  {favIds.includes(row.id) ? (
                    <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
                  ) : (
                    <StarBorderIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
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
            onConfirm={() => void handleDelete()}
            onCancel={() => setDeleteTarget(null)}
          />
        </ListPageLayout>
      </Card>
    </PageFrame>
  );
}
