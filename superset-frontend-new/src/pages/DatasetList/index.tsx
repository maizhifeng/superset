import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import TableChartIcon from "@mui/icons-material/TableChart";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import CodeIcon from "@mui/icons-material/Code";
import DownloadIcon from "@mui/icons-material/Download";
import { useNotificationStore } from "@/store/notificationStore";
import { downloadCsv } from "@/utils/exportCsv";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { useToolbarStore } from "@/store/toolbarStore";
import { useDatasetFavorites } from "@/store/datasetFavorites";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import ListPageLayout from "@/components/ListPageLayout";
import { ConfirmModal } from "@/superset-ui-mui/components";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import api, { getDataset } from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";

import type { DatasetRow } from "@/types/api";

interface BindingInfo {
  partnerId: number;
  partnerName: string;
  databases: [string, string];
}

/** localStorage 键：记住用户选择的数据集类型（物理/虚拟）过滤条件。 */
const KIND_FILTER_KEY = "superset-dataset-kind-filter";

/** localStorage 键：记住数据集"仅看收藏"筛选开关。 */
const DS_FAV_KEY = "superset-dataset-fav-filter";

export default function DatasetList() {
  const navigate = useNavigate();
  const [federatedMap, setFederatedMap] = useState<Record<number, BindingInfo>>(
    {},
  );
  const [bindMode, setBindMode] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    a: DatasetRow;
    b: DatasetRow;
  } | null>(null);
  const notify = useNotificationStore((s) => s.notify);

  /** 复制数据集 ID 到剪贴板。 */
  const handleCopyId = async (id: number) => {
    try {
      await navigator.clipboard.writeText(String(id));
      notify({ severity: "success", message: `已复制数据集 ID ${id}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  /** 复制数据集表名（含 schema 前缀）到剪贴板。 */
  const handleCopyTableName = async (row: DatasetRow) => {
    const name = row.schema ? `${row.schema}.${row.table_name}` : row.table_name;
    try {
      await navigator.clipboard.writeText(name);
      notify({ severity: "success", message: `已复制表名 ${name}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 生成并复制数据集对应的 SELECT 全表查询。 */
  const handleCopySelectSql = async (row: DatasetRow) => {
    const table = row.schema
      ? `${row.schema}.${row.table_name}`
      : row.table_name;
    const sql = `SELECT * FROM ${table};`;
    try {
      await navigator.clipboard.writeText(sql);
      notify({ severity: "success", message: `已复制查询 SELECT * FROM ${table}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制数据集编辑链接。 */
  const handleCopyDatasetLink = async (id: number) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dataset/edit/${id}`,
      );
      notify({ severity: "success", message: "已复制数据集链接" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制数据集所属数据库名。 */
  const handleCopyDbName = async (name: string) => {
    if (!name) return;
    try {
      await navigator.clipboard.writeText(name);
      notify({ severity: "success", message: `已复制数据库名 ${name}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

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
  /** 复制当前加载的数据集表名（每行一个）。 */
  const handleCopyAllTableNames = useCallback(async () => {
    const names = rows.map((r) => r.table_name).filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "暂无数据集数据" });
      return;
    }
    try {
      await navigator.clipboard.writeText(names.join("\n"));
      notify({ severity: "success", message: `已复制 ${names.length} 个表名` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [rows, notify]);
  const [kindFilter, setKindFilter] = useState(
    () => localStorage.getItem(KIND_FILTER_KEY) ?? "",
  );
  const favIds = useDatasetFavorites((s) => s.ids);
  const toggleFavorite = useDatasetFavorites((s) => s.toggle);
  const [favoritesOnly, setFavoritesOnly] = useState(
    () => localStorage.getItem(DS_FAV_KEY) === "1",
  );
  const handleKindFilter = useCallback(
    (value: string) => {
      setKindFilter(value);
    },
    [],
  );

  // 客户端按类型 + 收藏过滤（kind 列不允许作为服务端筛选列）。
  const visibleRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!kindFilter || r.kind === kindFilter) &&
          (!favoritesOnly || favIds.includes(r.id)),
      ),
    [rows, kindFilter, favoritesOnly, favIds],
  );

  /** 导出当前筛选后的数据集列表为 CSV。 */
  const handleExportCsv = useCallback(() => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      ["ID", "表名称", "模式", "数据库", "类型", "最后修改"],
      visibleRows.map((d) => ({
        ID: d.id,
        表名称: d.table_name,
        模式: d.schema ?? "",
        数据库: d.database?.database_name ?? "",
        类型: d.kind === "physical" ? "物理表" : "虚拟表",
        最后修改: d.changed_on_delta_humanized ?? "",
      })),
      `datasets-${ts}.csv`,
    );
  }, [visibleRows]);

  useEffect(() => {
    if (kindFilter) localStorage.setItem(KIND_FILTER_KEY, kindFilter);
    else localStorage.removeItem(KIND_FILTER_KEY);
  }, [kindFilter]);

  useEffect(() => {
    if (favoritesOnly) localStorage.setItem(DS_FAV_KEY, "1");
    else localStorage.removeItem(DS_FAV_KEY);
  }, [favoritesOnly]);
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);

  useEffect(() => {
    registerTools("dataset_list", [
      {
        id: "add",
        priority: 6,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "新建数据集",
        action: () => navigate("/dataset/create"),
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
        id: "kind_filter",
        priority: 4,
        showOnMobile: false,
        render: (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="ds-kind-label">类型</InputLabel>
            <Select
              labelId="ds-kind-label"
              label="类型"
              value={kindFilter}
              onChange={(e) => handleKindFilter(e.target.value)}
            >
              <MenuItem value="">
                <em>全部</em>
              </MenuItem>
              <MenuItem value="physical">物理表</MenuItem>
              <MenuItem value="virtual">虚拟表</MenuItem>
            </Select>
          </FormControl>
        ),
      },
      {
        id: "fav_filter",
        priority: 3,
        showOnMobile: false,
        render: (
          <Tooltip title={favoritesOnly ? "显示全部数据集" : "仅显示收藏的数据集"}>
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
        id: "export",
        priority: 2,
        showOnMobile: false,
        render: (
          <Tooltip title="导出当前数据集列表为 CSV">
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
              onClick={handleExportCsv}
              disabled={visibleRows.length === 0}
              sx={{ textTransform: "none" }}
            >
              导出 CSV
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "copy_tables",
        priority: 1.75,
        showOnMobile: false,
        render: (
          <Tooltip title="复制当前加载的数据集表名列表">
            <Button
              size="small"
              variant="outlined"
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => void handleCopyAllTableNames()}
              disabled={rows.length === 0}
              sx={{ textTransform: "none" }}
            >
              复制表名
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
            placeholder="搜索数据集..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("dataset_list");
  }, [registerTools, unregisterTools, handleSearchChange, navigate, kindFilter, handleKindFilter, favoritesOnly, setFavoritesOnly, favIds, handleExportCsv, handleCopyAllTableNames, rows.length, visibleRows.length, fetchData, loading]);

  // Load federated bindings from extra
  useEffect(() => {
    if (rows.length === 0) return;
    const map: Record<number, BindingInfo> = {};
    for (const row of rows) {
      const extraRaw = (row as any).extra;
      if (!extraRaw) continue;
      try {
        const extra = JSON.parse(extraRaw);
        const fed = extra.federated;
        if (fed?.enabled && fed.partner_dataset_id) {
          const partner = rows.find((r) => r.id === fed.partner_dataset_id);
          map[row.id] = {
            partnerId: fed.partner_dataset_id,
            partnerName: partner?.table_name ?? `#${fed.partner_dataset_id}`,
            databases: fed.databases ?? [],
          };
        }
      } catch {
        /* skip */
      }
    }
    setFederatedMap(map);
  }, [rows]);

  const getDbName = (row: DatasetRow) =>
    (row as any).database?.database_name ?? "";

  const handleRowClick = useCallback(
    (row: DatasetRow) => {
      if (!bindMode) {
        navigate(`/dataset/edit/${row.id}`);
        return;
      }
      if (selectedId === null) {
        setSelectedId(row.id);
      } else {
        if (row.id === selectedId) {
          setSelectedId(null);
          return;
        }
        setConfirmTarget({
          a: rows.find((r) => r.id === selectedId)!,
          b: row,
        });
      }
    },
    [bindMode, selectedId, rows, navigate],
  );

  const handleConfirmBind = async () => {
    if (!confirmTarget) return;
    const { a, b } = confirmTarget;
    const dbA = getDbName(a);
    const dbB = getDbName(b);
    if (!dbA || !dbB || dbA === dbB) return;

    try {
      const [ra, rb] = await Promise.all([getDataset(a.id), getDataset(b.id)]);
      const ea = parseExtra((ra as any)?.extra);
      const eb = parseExtra((rb as any)?.extra);
      ea.federated = {
        enabled: true,
        partner_dataset_id: b.id,
        databases: [dbA, dbB],
      };
      eb.federated = {
        enabled: true,
        partner_dataset_id: a.id,
        databases: [dbB, dbA],
      };
      await Promise.all([
        api.put(`/dataset/${a.id}`, { extra: JSON.stringify(ea) }),
        api.put(`/dataset/${b.id}`, { extra: JSON.stringify(eb) }),
      ]);
      fetchData();
    } catch {
      /* ignore */
    }
    setConfirmTarget(null);
    setSelectedId(null);
    setBindMode(false);
  };

  const handleUnbind = async (id: number) => {
    const info = federatedMap[id];
    if (!info) return;
    try {
      const [ra, rb] = await Promise.all([
        getDataset(id),
        getDataset(info.partnerId),
      ]);
      const ea = parseExtra((ra as any)?.extra);
      const eb = parseExtra((rb as any)?.extra);
      delete ea.federated;
      delete eb.federated;
      await Promise.all([
        api.put(`/dataset/${id}`, { extra: JSON.stringify(ea) }),
        api.put(`/dataset/${info.partnerId}`, { extra: JSON.stringify(eb) }),
      ]);
      fetchData();
    } catch {
      /* ignore */
    }
  };

  const isSelected = (id: number) => selectedId === id;
  const isBound = (id: number) => !!federatedMap[id];

  const columns: GridColDef[] = [
    {
      field: "id",
      headerName: "ID",
      width: 70,
      renderCell: (params) => (
        <Tooltip title="复制数据集 ID">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              void handleCopyId(params.value as number);
            }}
            sx={{ p: 0.25, mr: 0.5 }}
          >
            <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: "table_name",
      headerName: "表名称",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => {
        const row = params.row as DatasetRow;
        return (
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
            <Tooltip title="复制表名">
              <IconButton
                size="small"
                sx={{ p: 0.25 }}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyTableName(row);
                }}
              >
                <ContentCopyIcon sx={{ fontSize: 13, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
    {
      field: "schema",
      headerName: "模式",
      flex: 0.5,
      minWidth: 80,
      renderCell: (params) => {
        if (!params.value) return null;
        return <Chip label={params.value} size="small" variant="outlined" />;
      },
    },
    {
      field: "database",
      headerName: "数据库",
      flex: 0.7,
      minWidth: 120,
      renderCell: (params) => {
        const name = getDbName(params.row);
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <span>{name}</span>
            {name ? (
              <Tooltip title="复制数据库名">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopyDbName(name);
                  }}
                  sx={{ p: 0.25 }}
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
      field: "changed_on_delta_humanized",
      headerName: "最后修改",
      flex: 0.5,
      minWidth: 80,
    },
    {
      field: "kind",
      headerName: "类型",
      flex: 0.3,
      minWidth: 60,
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
      field: "federated",
      headerName: "跨库绑定",
      width: 100,
      sortable: false,
      renderCell: (params) => {
        const id = params.id as number;
        const info = federatedMap[id];
        if (!info) return null;
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <LinkIcon color="primary" sx={{ fontSize: 14 }} />
            <Typography
              variant="caption"
              sx={{ fontSize: "0.7rem", color: "primary.main" }}
            >
              {info.partnerName}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "actions",
      headerName: "",
      width: 248,
      sortable: false,
      renderCell: (params) => {
        const row = params.row;
        const id = params.id as number;
        return (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title={favIds.includes(id) ? "取消收藏" : "收藏"}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(id);
                }}
                sx={{
                  color: favIds.includes(id) ? "warning.main" : "text.disabled",
                }}
              >
                {favIds.includes(id) ? (
                  <StarIcon sx={{ fontSize: 16 }} />
                ) : (
                  <StarBorderIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Tooltip>
            {isBound(id) && (
              <Tooltip title="解除绑定">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleUnbind(id);
                  }}
                >
                  <LinkOffIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="复制表名">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyTableName(row);
                }}
              >
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="复制链接">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyDatasetLink(id);
                }}
              >
                <LinkIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="复制 SELECT 查询">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopySelectSql(row);
                }}
              >
                <CodeIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="编辑数据集">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/dataset/edit/${id}`);
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
                  setDeleteTarget({ id, name: row.table_name });
                }}
              >
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        p: { xs: 1.5, md: 3 },
        pt: { xs: 1.5, md: 2 },
      }}
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
        <CardHeader
          title={
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
                数据集
              </Typography>
              <Typography variant="caption" color="text.secondary">
                共 {rowCount} 项
              </Typography>
            </Box>
          }
          action={
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              {bindMode && (
                <Typography
                  variant="caption"
                  color="warning.main"
                  sx={{ fontSize: "0.75rem", fontWeight: 600 }}
                >
                  {selectedId ? "请选择另一个数据集" : "请选择一个数据集"}
                </Typography>
              )}
              <Button
                size="small"
                variant={bindMode ? "contained" : "outlined"}
                color={bindMode ? "warning" : "primary"}
                startIcon={<LinkIcon />}
                onClick={() => {
                  setBindMode(!bindMode);
                  setSelectedId(null);
                }}
              >
                {bindMode ? "退出绑定" : "绑定数据集"}
              </Button>
            </Box>
          }
          sx={{ "& .MuiCardHeader-content": { overflow: "hidden" } }}
        />
        <Divider />
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
                  searchText ? "请调整搜索条件" : "创建第一个数据集开始构建图表"
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
            rows={visibleRows}
            columns={columns}
            loading={loading}
            paginationModel={paginationModel}
            rowCount={rowCount}
            paginationMode="server"
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[25, 50, 100]}
            onRowClick={(params) => handleRowClick(params.row)}
            onEdit={(row) => navigate(`/dataset/edit/${row.id}`)}
            toolbarPageKey="dataset_list"
            onDelete={(row) =>
              setDeleteTarget({ id: row.id, name: row.table_name })
            }
            onBatchDelete={(ids) => {
              void (async () => {
                await Promise.all(
                  ids.map((id) => api.delete(`/dataset/${id}`)),
                );
                fetchData();
              })();
            }}
            getRowClassName={(params) => {
              const id = params.id as number;
              if (isSelected(id)) return "Mui-selected";
              if (bindMode) return "dataset-row-bindable";
              return "";
            }}
            renderCard={(row) => {
              const id = row.id;
              const info = federatedMap[id];
              return (
                <>
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 0.25 }}
                    onClick={() => handleRowClick(row)}
                  >
                    {info && (
                      <LinkIcon
                        color="primary"
                        sx={{ fontSize: 12, mr: 0.25 }}
                      />
                    )}
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, lineHeight: 1.3, flex: 1 }}
                    >
                      {row.table_name}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.25,
                      mt: 0.25,
                    }}
                  >
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
                      {getDbName(row)}
                    </Typography>
                  </Box>
                  {info && (
                    <Typography
                      variant="caption"
                      color="primary"
                      sx={{ fontSize: "0.7rem", mt: 0.25 }}
                    >
                      ↕ 已绑定: {info.partnerName}
                    </Typography>
                  )}
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
              );
            }}
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
            onConfirm={() => void handleDelete()}
            onCancel={() => setDeleteTarget(null)}
          />
        </ListPageLayout>
      </Card>

      {/* Bind confirmation dialog */}
      <Dialog
        open={!!confirmTarget}
        onClose={() => {
          setConfirmTarget(null);
          setSelectedId(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
          确认跨库绑定
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, fontSize: "0.8125rem" }}>
            将以下两个数据集关联，查询任一数据集时 SQL
            会同时在两个库执行并合并结果：
          </Typography>
          <Card
            variant="outlined"
            sx={{ p: 1.5, borderRadius: 2, bgcolor: "grey.50", mb: 1 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {confirmTarget?.a?.table_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              数据库: {confirmTarget ? getDbName(confirmTarget.a) : ""}
            </Typography>
          </Card>
          <Typography variant="body2" sx={{ textAlign: "center", my: 0.5 }}>
            ⟷
          </Typography>
          <Card
            variant="outlined"
            sx={{ p: 1.5, borderRadius: 2, bgcolor: "grey.50" }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {confirmTarget?.b?.table_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              数据库: {confirmTarget ? getDbName(confirmTarget.b) : ""}
            </Typography>
          </Card>
        </DialogContent>
        <DialogActions>
          <Button
            size="small"
            onClick={() => {
              setConfirmTarget(null);
              setSelectedId(null);
            }}
          >
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => void handleConfirmBind()}
          >
            确认绑定
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function parseExtra(raw: string | undefined | null): any {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
