import { useEffect, useState, useCallback } from "react";
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
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import FunctionsIcon from "@mui/icons-material/Functions";
import TableChartIcon from "@mui/icons-material/TableChart";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import { useToolbarStore } from "@/store/toolbarStore";
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
    ]);
    return () => unregisterTools("dataset_list");
  }, [registerTools, unregisterTools, handleSearchChange]);

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
    { field: "id", headerName: "ID", width: 60 },
    { field: "table_name", headerName: "表名称", flex: 1, minWidth: 120 },
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
      minWidth: 100,
      valueGetter: (_v, row) => getDbName(row),
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
      width: 120,
      sortable: false,
      renderCell: (params) => {
        const row = params.row;
        const id = params.id as number;
        return (
          <Box sx={{ display: "flex", gap: 0.5 }}>
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
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
              数据集
            </Typography>
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
              <Button
                variant="contained"
                size="small"
                startIcon={<FunctionsIcon />}
                onClick={() => navigate("/dataset/create")}
              >
                新建数据集
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
            rows={rows}
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
