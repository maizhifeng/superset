import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import HistoryIcon from "@mui/icons-material/History";
import LinearProgress from "@mui/material/LinearProgress";
import IconButton from "@mui/material/IconButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CodeIcon from "@mui/icons-material/Code";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import { useNotificationStore } from "@/store/notificationStore";
import { downloadCsv } from "@/utils/exportCsv";
import { formatDateTime, parseBackendDate } from "@/utils/datetime";
import type { GridColDef } from "@mui/x-data-grid";
import ResponsiveDataGrid from "@/components/ResponsiveDataGrid";
import FilterBar from "@/components/FilterBar";
import ListPageLayout from "@/components/ListPageLayout";
import PageFrame from "@/components/PageFrame";
import ToolbarSelect from "@/components/ToolbarSelect";
import EmptyState from "@/superset-ui-mui/components/EmptyState";
import EmptyStateShortcutHint from "@/components/EmptyStateShortcutHint";
import { useToolbarStore } from "@/store/toolbarStore";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useAuthStore } from "@/store/authStore";

import type { QueryLog } from "@/types/api";

const MAX_DURATION_MS = 300000;

/** localStorage 键：记住查询历史的时间范围筛选。 */
const TIME_RANGE_KEY = "superset-query-history-time-range";

/** localStorage 键：记住查询历史的用户筛选。 */
const USER_FILTER_KEY = "superset-query-history-user-filter";

/** localStorage 键：记住查询历史的最小耗时筛选。 */
const MIN_DURATION_KEY = "superset-query-history-min-duration";

/** 把 Apis 内部的 REST 动作名翻译成人话，便于阅读操作记录。 */
const ACTION_LABELS: Record<string, string> = {
  UserLoggedIn: "登录",
  UserLoggedOut: "登出",
  "DashboardRestApi.get_list": "查看仪表板列表",
  "DashboardRestApi.get": "查看仪表板",
  "DashboardRestApi.post": "创建仪表板",
  "DashboardRestApi.put": "更新仪表板",
  "DashboardRestApi.delete": "删除仪表板",
  "ChartRestApi.get_list": "查看图表列表",
  "ChartRestApi.get": "查看图表",
  "ChartRestApi.post": "创建图表",
  "ChartRestApi.put": "更新图表",
  "ChartRestApi.delete": "删除图表",
  "DatasetRestApi.get_list": "查看数据集列表",
  "DatasetRestApi.get": "查看数据集",
  "DatasetRestApi.post": "创建数据集",
  "DatasetRestApi.put": "更新数据集",
  "DatasetRestApi.delete": "删除数据集",
  "DatabaseRestApi.get_list": "查看数据库列表",
  "DatabaseRestApi.get": "查看数据库",
  "DatabaseRestApi.post": "创建数据库",
  "DatabaseRestApi.put": "更新数据库",
  "DatabaseRestApi.delete": "删除数据库",
  "SavedQueryRestApi.get_list": "查看已保存查询",
  "SavedQueryRestApi.post": "保存查询",
  "ReportRestApi.get_list": "查看警报列表",
  "ReportRestApi.post": "创建警报",
  "SecurityRestApi.login": "登录",
  "SecurityRestApi.csrf_token": "获取安全令牌",
  "csrf token": "获取安全令牌",
  csrf_token: "获取安全令牌",
  execute_sql: "执行 SQL",
  load_into_dataframe: "加载查询结果",
  "QueryObject.post_processing": "查询结果后处理",
  queryobject_post_processing: "查询结果后处理",
  "Database.schemas": "查看数据表结构",
  database_schemas: "查看数据表结构",
  schemas: "查看数据表结构",
  get_schemas: "查看数据表结构",
  "SecurityRestApi.refresh": "刷新令牌",
  get_list: "查看列表",
  "get.": "查看详情",
};

/** 将动作名转为人话；未知动作则清理包名后原样展示。 */
export function labelAction(action: string | undefined): string {
  if (!action) return "未知操作";
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Raw internal actions arrive as `csrf_token`, `Database.schemas`, etc.;
  // normalise them for lookup while leaving unknown `XxxRestApi.*` names to the
  // friendly fallback below.
  if (!/Api\./.test(action)) {
    const normalized = action.replace(/[.\s]+/g, "_").toLowerCase();
    const mapped =
      ACTION_LABELS[normalized] ?? ACTION_LABELS[normalized.replace(/_/g, " ")];
    if (mapped) return mapped;
  }
  const cleaned = action.replace(/RestApi\./g, ".").replace(/_/g, " ");
  return cleaned;
}

const MODULE_FILTERS: { label: string; value: string }[] = [
  { label: "全部", value: "" },
  { label: "仪表板", value: "Dashboard" },
  { label: "图表", value: "Chart" },
  { label: "数据集", value: "Dataset" },
  { label: "数据库", value: "Database" },
  { label: "已保存查询", value: "SavedQuery" },
  { label: "警报", value: "Report" },
  { label: "登录/安全", value: "Security" },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function durationColor(ms: number): string {
  if (ms < 1000) return "success.main";
  if (ms < 10000) return "info.main";
  if (ms < 60000) return "warning.main";
  return "error.main";
}

/** 把时间格式化为"刚刚 / N 分钟前 / N 小时前 / N 天前"。 */
function relativeTime(value: string): string {
  const diffSec = (Date.now() - parseBackendDate(value).getTime()) / 1000;
  if (diffSec < 60) return "刚刚";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
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
    setExtraFilters,
    handleSearchChange,
    fetchData,
  } = usePaginatedList<QueryLog>({
    endpoint: "/log/",
    filterColumn: "action",
    errorMessage: "加载查询历史失败",
  });
  // 日志接口不返回稳定的 id 字段，DataGrid 需要每行有唯一 id；
  // 这里用 user_id + 时间 + 序号合成一个稳定的行 id。
  const rowsWithId = rows.map((row, i) => ({
    ...row,
    seq: paginationModel.page * paginationModel.pageSize + i + 1,
    id: String(`${row.user?.username ?? "x"}-${row.dttm}-${i}`),
  }));
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);
  const notify = useNotificationStore((s) => s.notify);

  /** 复制某条操作记录的文本摘要，便于转述或取证。 */
  const handleCopyRow = useCallback(
    async (row: QueryLog) => {
      const user = row.user?.username ?? "";
      const action = labelAction(row.action);
      const time = row.dttm ? parseBackendDate(row.dttm).toISOString() : "";
      const dur = row.duration_ms != null ? `${row.duration_ms}ms` : "";
      try {
        await navigator.clipboard.writeText(
          [user, action, time, dur].filter(Boolean).join(" | "),
        );
        notify({ severity: "success", message: "已复制该条记录" });
      } catch {
        notify({ severity: "error", message: "复制失败" });
      }
    },
    [notify],
  );

  /** 复制某条操作记录的原始 JSON，便于审计或对接脚本。 */
  const handleCopyRowJson = useCallback(
    async (row: QueryLog) => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
        notify({ severity: "success", message: "已复制该条记录（JSON）" });
      } catch {
        notify({ severity: "error", message: "复制失败" });
      }
    },
    [notify],
  );

  const [moduleFilter, setModuleFilter] = useState("");
  const [timeRange, setTimeRange] = useState(
    () => localStorage.getItem(TIME_RANGE_KEY) ?? "",
  );
  const [userFilter, setUserFilter] = useState(
    () => localStorage.getItem(USER_FILTER_KEY) ?? "",
  );
  const [minDuration, setMinDuration] = useState(() => {
    const v = Number(localStorage.getItem(MIN_DURATION_KEY) ?? "0");
    return Number.isFinite(v) ? v : 0;
  });
  const currentUsername = useAuthStore((s) => s.user?.username ?? "");

  useEffect(() => {
    if (timeRange) localStorage.setItem(TIME_RANGE_KEY, timeRange);
    else localStorage.removeItem(TIME_RANGE_KEY);
  }, [timeRange]);

  useEffect(() => {
    if (userFilter) localStorage.setItem(USER_FILTER_KEY, userFilter);
    else localStorage.removeItem(USER_FILTER_KEY);
  }, [userFilter]);

  useEffect(() => {
    if (minDuration > 0)
      localStorage.setItem(MIN_DURATION_KEY, String(minDuration));
    else localStorage.removeItem(MIN_DURATION_KEY);
  }, [minDuration]);

  /** 在“仅看我的操作”与“全部用户”之间切换。 */
  const toggleOnlyMine = useCallback(() => {
    setUserFilter((prev) => (prev ? "" : currentUsername));
  }, [currentUsername]);

  /** 客户端按用户 + 最小耗时过滤加载的操作记录。 */
  const visibleRowsWithId = rowsWithId.filter(
    (r) =>
      (!userFilter || r.user?.username === userFilter) &&
      (minDuration === 0 || (r.duration_ms ?? 0) >= minDuration),
  );

  const userOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.user?.username).filter(Boolean))),
    [rows],
  );

  /** 导出当前加载的操作记录为 CSV。 */
  const handleExportCsv = useCallback(() => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadCsv(
      ["用户", "操作", "日期", "耗时(ms)"],
      rows.map((row) => ({
        用户: row.user?.username ?? "",
        操作: labelAction(row.action),
        日期: row.dttm ? parseBackendDate(row.dttm).toISOString() : "",
        "耗时(ms)": row.duration_ms ?? "",
      })),
      `query-history-${ts}.csv`,
    );
  }, [rows]);

  /** 把当前加载的操作记录复制为 Markdown 表格，便于粘贴到文档 / 周报。 */
  const handleCopyMarkdown = useCallback(async () => {
    const header = ["用户", "操作", "日期", "耗时(ms)"];
    const mdRows = rows.map((row) =>
      [
        (row.user?.username ?? "").replace(/\|/g, "\\|"),
        (labelAction(row.action) || "").replace(/\|/g, "\\|"),
        row.dttm ? parseBackendDate(row.dttm).toISOString() : "",
        row.duration_ms ?? "",
      ].join(" | "),
    );
    const table = [
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      ...mdRows.map((r) => `| ${r} |`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(table);
      notify({ severity: "success", message: "已复制操作记录（Markdown）" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [rows, notify]);

  const handleModuleFilter = useCallback((value: string) => {
    setModuleFilter(value);
  }, []);

  // 组合模块 + 时间范围筛选，下发给服务端。
  useEffect(() => {
    const filters: { col: string; opr: string; value: string }[] = [];
    if (moduleFilter)
      filters.push({ col: "action", opr: "ct", value: moduleFilter });
    if (timeRange) {
      const from = new Date();
      from.setDate(from.getDate() - Number(timeRange));
      filters.push({ col: "dttm", opr: "gte", value: from.toISOString() });
    }
    setExtraFilters(filters);
  }, [moduleFilter, timeRange, setExtraFilters]);

  useEffect(() => {
    registerTools("query_history_list", [
      {
        id: "refresh",
        priority: 5.5,
        showOnMobile: false,
        render: (
          <Tooltip title="刷新操作记录">
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
        id: "module_filter",
        priority: 4,
        showOnMobile: false,
        render: (
          <ToolbarSelect
            label="模块"
            value={moduleFilter}
            onChange={handleModuleFilter}
            minWidth={140}
            options={MODULE_FILTERS}
          />
        ),
      },
      {
        id: "time_range",
        priority: 3.5,
        showOnMobile: false,
        render: (
          <ToolbarSelect
            label="时间范围"
            value={timeRange}
            onChange={setTimeRange}
            minWidth={120}
            options={[
              { value: "", label: "全部" },
              { value: "7", label: "最近 7 天" },
              { value: "30", label: "最近 30 天" },
              { value: "90", label: "最近 90 天" },
            ]}
          />
        ),
      },
      {
        id: "clear_filters",
        priority: 1.5,
        showOnMobile: false,
        render:
          moduleFilter || timeRange || userFilter || minDuration > 0 ? (
            <Button
              size="small"
              variant="text"
              color="inherit"
              startIcon={<ClearAllIcon sx={{ fontSize: 15 }} />}
              onClick={() => {
                setModuleFilter("");
                setTimeRange("");
                setUserFilter("");
                setMinDuration(0);
              }}
              sx={{ textTransform: "none" }}
            >
              清除筛选
            </Button>
          ) : null,
      },
      {
        id: "my_activity",
        priority: 1.75,
        showOnMobile: false,
        render: (
          <Tooltip title="仅显示当前登录用户的操作记录">
            <Button
              size="small"
              variant={
                userFilter === currentUsername ? "contained" : "outlined"
              }
              color={userFilter === currentUsername ? "primary" : "inherit"}
              startIcon={<HistoryIcon sx={{ fontSize: 15 }} />}
              onClick={toggleOnlyMine}
              disabled={!currentUsername}
              sx={{ textTransform: "none" }}
            >
              仅我的
            </Button>
          </Tooltip>
        ),
      },
      {
        id: "user_filter",
        priority: 1.8,
        showOnMobile: false,
        render:
          userOptions.length > 0 ? (
            <ToolbarSelect
              label="用户"
              value={userFilter}
              onChange={setUserFilter}
              minWidth={130}
              options={[
                { value: "", label: "全部" },
                ...userOptions.map((user) => ({
                  value: user as string,
                  label: user as string,
                })),
              ]}
            />
          ) : null,
      },
      {
        id: "duration_filter",
        priority: 1.7,
        showOnMobile: false,
        render: (
          <ToolbarSelect
            label="耗时"
            // 0 means "all"; pass "" so the control shows its name instead of
            // a bare 全部.
            value={minDuration === 0 ? "" : minDuration}
            onChange={(value) => setMinDuration(Number(value))}
            minWidth={120}
            options={[
              { value: "", label: "全部" },
              { value: 100, label: "≥ 100ms" },
              { value: 1000, label: "≥ 1s" },
              { value: 10000, label: "≥ 10s" },
            ]}
          />
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
        id: "copy_markdown",
        priority: 1.9,
        showOnMobile: false,
        render: null,
        variant: "menu",
        fabIcon: <ContentCopyIcon sx={{ fontSize: 16 }} />,
        fabLabel: "复制 Markdown",
        action: () => void handleCopyMarkdown(),
      },
      {
        id: "search",
        priority: 5,
        showOnMobile: false,
        render: (
          <FilterBar
            value=""
            onChange={handleSearchChange}
            placeholder="搜索操作..."
            compact
            sx={{ minWidth: 220 }}
          />
        ),
      },
    ]);
    return () => unregisterTools("query_history_list");
  }, [
    registerTools,
    unregisterTools,
    handleSearchChange,
    handleModuleFilter,
    moduleFilter,
    timeRange,
    userFilter,
    currentUsername,
    toggleOnlyMine,
    minDuration,
    userOptions,
    handleExportCsv,
    handleCopyMarkdown,
    rows.length,
    fetchData,
    loading,
  ]);

  const columns: GridColDef[] = [
    { field: "seq", headerName: "序号", width: 80 },
    {
      field: "user",
      headerName: "用户",
      flex: 0.4,
      minWidth: 110,
      renderCell: (params) => {
        const username = params.row.user?.username ?? "";
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
            <AccountCircleIcon
              sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }}
            />
            <Box
              component="span"
              title={username}
              sx={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {username}
            </Box>
            {params.row.user?.username ? (
              <Tooltip title="仅显示该用户的操作">
                <IconButton
                  size="small"
                  sx={{ p: 0.25, flexShrink: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserFilter(params.row.user.username);
                  }}
                >
                  <FilterAltIcon
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
      field: "action",
      headerName: "操作",
      flex: 1,
      minWidth: 180,
      renderCell: (params) => {
        const label = labelAction(params.value);
        return (
          <Typography
            variant="body2"
            title={label}
            sx={{
              fontSize: "0.8125rem",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </Typography>
        );
      },
    },
    {
      field: "dttm",
      headerName: "日期",
      flex: 0.5,
      minWidth: 130,
      renderCell: (params) => {
        if (!params.row.dttm) return null;
        return (
          <Tooltip title={formatDateTime(params.row.dttm)} arrow>
            <Box component="span">{relativeTime(params.row.dttm)}</Box>
          </Tooltip>
        );
      },
    },
    {
      field: "duration_ms",
      headerName: "耗时",
      flex: 0.4,
      minWidth: 140,
      renderCell: (params) => {
        const ms = params.row.duration_ms;
        if (ms == null) {
          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        }
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
                  bgcolor: "action.hover",
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
    {
      field: "actions",
      headerName: "操作",
      width: 92,
      sortable: false,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Tooltip title="复制本条记录">
            <IconButton
              size="small"
              onClick={() => void handleCopyRow(params.row)}
            >
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制原始 JSON">
            <IconButton
              size="small"
              onClick={() => void handleCopyRowJson(params.row)}
            >
              <CodeIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <PageFrame
      page="query_history_list"
      loading={loading}
      title="历史记录"
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
                icon={<HistoryIcon />}
                title="暂无操作记录"
                description={
                  searchText
                    ? "请调整搜索条件"
                    : "这里是系统操作历史，如在 SQL 实验室运行查询、查看或管理仪表板等操作会记录在此"
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
            rows={visibleRowsWithId}
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
                    {labelAction(row.action)}
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
                        {row.dttm ? formatDateTime(row.dttm) : ""}
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
                          bgcolor: "action.hover",
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
      </Card>
    </PageFrame>
  );
}
