import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import HistoryIcon from "@mui/icons-material/History";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import ListPageLayout from "@/components/ListPageLayout";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { useToolbarStore } from "@/store/toolbarStore";
import { usePaginatedList } from "@/hooks/usePaginatedList";

import type { QueryLog } from "@/types/api";

const MAX_DURATION_MS = 300000;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function durationColor(ms: number): string {
  if (ms < 1000) return "#5ac189";
  if (ms < 10000) return "#20a7c9";
  if (ms < 60000) return "#ff7f44";
  return "#e0432e";
}

export default function QueryHistoryList() {
  const navigate = useNavigate();
  const {
    rows,
    rowCount,
    loading,
    error,
    searchText,
    paginationModel,
    setPaginationModel,
    handleSearchChange,
  } = usePaginatedList<QueryLog>({
    endpoint: "/log/",
    filterColumn: "action",
    errorMessage: "加载查询历史失败",
  });
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);

  useEffect(() => {
    registerTools("query_history_list", [
      {
        id: "search",
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar
            value=""
            onChange={handleSearchChange}
            placeholder="搜索查询..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("query_history_list");
  }, [registerTools, unregisterTools, handleSearchChange]);

  const columns: GridColDef[] = [
    { field: "id", headerName: "ID", width: 70 },
    {
      field: "user",
      headerName: "用户",
      flex: 0.4,
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <AccountCircleIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          <span>{params.row.user?.username ?? ""}</span>
        </Box>
      ),
    },
    { field: "action", headerName: "操作", flex: 1 },
    {
      field: "dttm",
      headerName: "日期",
      flex: 0.5,
      valueGetter: (_value, row) => {
        if (!row.dttm) return "";
        return new Date(row.dttm).toLocaleString();
      },
    },
    {
      field: "duration_ms",
      headerName: "耗时",
      flex: 0.4,
      renderCell: (params) => {
        const ms = params.row.duration_ms;
        const pct = Math.min((ms / MAX_DURATION_MS) * 100, 100);
        return (
          <Tooltip title={`${formatDuration(ms)} (${ms}ms)`} arrow>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                width: "100%",
                pr: 2,
              }}
            >
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  bgcolor: "rgba(0,0,0,0.06)",
                  "& .MuiLinearProgress-bar": {
                    bgcolor: durationColor(ms),
                    borderRadius: 3,
                  },
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  minWidth: 50,
                  textAlign: "right",
                }}
              >
                {formatDuration(ms)}
              </Typography>
            </Box>
          </Tooltip>
        );
      },
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
            icon={<HistoryIcon />}
            title="未找到查询历史"
            description={
              searchText
                ? "请调整搜索条件"
                : "在SQL实验室中运行查询以在此处查看历史"
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
        renderCard={(row) => {
          const ms = row.duration_ms;
          const pct = Math.min((ms / MAX_DURATION_MS) * 100, 100);
          return (
            <>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.3,
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.action}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  mt: 0.25,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.25,
                      flexShrink: 0,
                    }}
                  >
                    <AccountCircleIcon
                      sx={{ fontSize: 10, color: "text.disabled" }}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: "0.75rem" }}
                    >
                      {row.user?.username ?? "无"}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{
                      fontSize: "0.75rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.dttm ? new Date(row.dttm).toLocaleString() : ""}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    flexShrink: 0,
                  }}
                >
                  <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                      width: 40,
                      height: 3,
                      borderRadius: 2,
                      bgcolor: "rgba(0,0,0,0.06)",
                      "& .MuiLinearProgress-bar": {
                        bgcolor: durationColor(ms),
                        borderRadius: 2,
                      },
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      color: durationColor(ms),
                    }}
                  >
                    {formatDuration(ms)}
                  </Typography>
                </Box>
              </Box>
            </>
          );
        }}
      />
    </ListPageLayout>
  );
}
