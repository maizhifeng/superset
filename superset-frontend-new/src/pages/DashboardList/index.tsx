import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteIcon from "@mui/icons-material/Delete";
import DashboardIcon from "@mui/icons-material/Dashboard";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import VisibilityIcon from "@mui/icons-material/Visibility";
import Pagination from "@mui/material/Pagination";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Divider from "@mui/material/Divider";
import FilterBar from "@/components/FilterBar";
import ListPageLayout from "@/components/ListPageLayout";
import { useToolbarStore } from "@/store/toolbarStore";
import { ConfirmModal, Grid2 } from "@/superset-ui-mui/components";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";

import { cardAccents } from "@/theme/notion";
import api from "@/api";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import type { DashboardListItem } from "@/types/api";

const PAGE_SIZE = 18;

export default function DashboardList() {
  const navigate = useNavigate();
  const {
    rows: dashboards,
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
  } = usePaginatedList<DashboardListItem>({
    endpoint: "/dashboard/",
    filterColumn: "dashboard_title",
    pageSize: PAGE_SIZE,
    errorMessage: "加载仪表板失败",
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("新建仪表板");
  const [creating, setCreating] = useState(false);
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);

  useEffect(() => {
    registerTools("dashboard_list", [
      {
        id: "search",
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar
            value=""
            onChange={handleSearchChange}
            placeholder="搜索仪表板..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("dashboard_list");
  }, [registerTools, unregisterTools, handleSearchChange]);

  const totalPages = Math.ceil(rowCount / PAGE_SIZE);

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
              仪表板
            </Typography>
          }
          action={
            <Button
              variant="contained"
              size="small"
              startIcon={<DashboardIcon />}
              onClick={() => setCreateDialogOpen(true)}
            >
              新建仪表板
            </Button>
          }
          sx={{ "& .MuiCardHeader-content": { overflow: "hidden" } }}
        />
        <Divider />
        <ListPageLayout
          loading={loading}
          error={error}
          hasData={dashboards.length > 0}
          emptyState={
            <>
              <EmptyState
                icon={<DashboardIcon />}
                title="未找到仪表板"
                description={
                  searchText ? "请调整搜索条件" : "创建仪表板将图表集中管理"
                }
                action={
                  !searchText ? (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      创建仪表板
                    </Button>
                  ) : undefined
                }
              />
              <EmptyStateShortcutHint />
            </>
          }
        >
          <Grid2 container spacing={2}>
            {dashboards.map((dashboard, i) => (
              <Grid2 size={{ xs: 12, sm: 6, lg: 4 }} key={dashboard.id}>
                <Paper
                  sx={{
                    p: 2.5,
                    borderRadius: 2,
                    cursor: "pointer",
                    position: "relative",
                    border: "none",
                    borderTop: "3px solid",
                    borderTopColor: cardAccents[i % cardAccents.length],
                    bgcolor: "surface.main",
                    boxShadow: "var(--mui-palette-shadow-card)",
                    transition:
                      "box-shadow 250ms cubic-bezier(0.25,0.1,0.15,1), transform 250ms cubic-bezier(0.25,0.1,0.15,1)",
                    "&:hover": {
                      boxShadow: "var(--mui-palette-shadow-cardHover)",
                      transform: "translateY(-2px)",
                      "& .card-actions": { opacity: 1 },
                    },
                  }}
                  onClick={() => navigate(`/dashboard/${dashboard.id}`)}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        lineHeight: 1.3,
                      }}
                    >
                      {dashboard.dashboard_title}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 1,
                    }}
                  >
                    {dashboard.published ? (
                      <Chip
                        label="已发布"
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{
                          height: 22,
                          "& .MuiChip-label": { fontSize: "0.75rem", px: 0.75 },
                        }}
                      />
                    ) : (
                      <Chip
                        label="草稿"
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 22,
                          "& .MuiChip-label": { fontSize: "0.75rem", px: 0.75 },
                        }}
                      />
                    )}
                    {dashboard.changed_on_delta_humanized && (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.25,
                        }}
                      >
                        <CalendarTodayIcon
                          sx={{ fontSize: 11, color: "text.disabled" }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: "0.75rem" }}
                        >
                          {dashboard.changed_on_delta_humanized}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Box
                    className="card-actions"
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      opacity: 0,
                      transition: "opacity 200ms ease",
                    }}
                  >
                    <Tooltip title="打开仪表板">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/${dashboard.id}`);
                        }}
                        sx={{
                          bgcolor: "background.paper",
                          boxShadow: "var(--mui-palette-shadow-sm)",
                          mr: 0.5,
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <VisibilityIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({
                            id: dashboard.id,
                            name: dashboard.dashboard_title,
                          });
                        }}
                        sx={{
                          bgcolor: "background.paper",
                          boxShadow: "var(--mui-palette-shadow-sm)",
                          "&:hover": { bgcolor: "error.light" },
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Paper>
              </Grid2>
            ))}
          </Grid2>
          {totalPages > 1 && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                mt: 3,
                pr: { xs: 7, sm: 0 },
              }}
            >
              <Pagination
                count={totalPages}
                page={paginationModel.page + 1}
                onChange={(_, p) =>
                  setPaginationModel({ ...paginationModel, page: p - 1 })
                }
                color="primary"
                shape="rounded"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {deleteError}
            </Alert>
          )}
          <ConfirmModal
            open={!!deleteTarget}
            title="删除仪表板"
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
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>创建仪表板</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="仪表板名称"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={creating || !createName.trim()}
            onClick={() => {
              void (async () => {
                setCreating(true);
                try {
                  const res = await api.post("/dashboard/", {
                    dashboard_title: createName.trim(),
                  });
                  const newId = res.data?.id;
                  setCreateDialogOpen(false);
                  if (newId) navigate(`/dashboard/${newId}`);
                } catch {
                  /* ignore */
                }
                setCreating(false);
              })();
            }}
          >
            {creating ? "创建中..." : "创建"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
