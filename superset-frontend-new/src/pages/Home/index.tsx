import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Fab from "@mui/material/Fab";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import BarChartIcon from "@mui/icons-material/BarChart";
import CodeIcon from "@mui/icons-material/Code";
import ClearIcon from "@mui/icons-material/Clear";
import DashboardIcon from "@mui/icons-material/Dashboard";
import TableChartIcon from "@mui/icons-material/TableChart";
import HistoryIcon from "@mui/icons-material/History";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNotificationStore } from "@/store/notificationStore";
import PageHeader from "@/components/PageHeader";
import Icon from "@/superset-ui-mui/components/Icon";
import { Grid2 } from "@/superset-ui-mui/components";
import AccentCard from "@/components/AccentCard";
import { useHomeStats } from "@/hooks/useHomeStats";
import { useDashboardFavorites } from "@/store/dashboardFavorites";
import { useChartFavorites } from "@/store/chartFavorites";
import { useDatasetFavorites } from "@/store/datasetFavorites";
import { useDatabaseFavorites } from "@/store/databaseFavorites";
import { useSavedQueryFavorites } from "@/store/savedQueryFavorites";
import { useAlertFavorites } from "@/store/alertFavorites";
import { useRecentDashboards } from "@/store/recentDashboards";
import { useRecentCharts } from "@/store/recentCharts";
import api from "@/api";

interface HomeLink {
  title: string;
  path: string;
  icon: string;
  desc: string;
  color: string;
  /** 展示在卡片右上角的实时数量徽标。 */
  count?: number;
  /** 标题旁的补充说明（如 SQL 实验室显示已保存查询数）。 */
  meta?: string;
}

const links: HomeLink[] = [
  {
    title: "图表",
    path: "/chart/list",
    icon: "chart",
    desc: "创建和管理图表",
    color: "primary.main",
    count: 0,
  },
  {
    title: "仪表板",
    path: "/dashboard/list",
    icon: "dashboard",
    desc: "将图表组织到仪表板中",
    color: "success.main",
    count: 0,
  },
  {
    title: "SQL 实验室",
    path: "/sqllab",
    icon: "code",
    desc: "编写和运行 SQL 查询",
    color: "secondary.main",
  },
  {
    title: "数据库",
    path: "/database/list",
    icon: "database",
    desc: "连接到您的数据源",
    color: "warning.main",
  },
  {
    title: "数据集",
    path: "/dataset/list",
    icon: "table",
    desc: "管理您的数据表",
    color: "info.main",
    count: 0,
  },
  {
    title: "查询历史",
    path: "/query_history",
    icon: "history",
    desc: "查看过往查询",
    color: "error.main",
  },
];

/** 按模块填充实时数量徽标。 */
function applyCounts(links: HomeLink[], stats: ReturnType<typeof useHomeStats>): HomeLink[] {
  const countByPath: Record<string, number> = {
    "/chart/list": stats.charts,
    "/dashboard/list": stats.dashboards,
    "/dataset/list": stats.datasets,
    "/database/list": stats.databases,
  };
  const metaByPath: Record<string, string> = {
    "/sqllab": `已保存 ${stats.savedQueries} 个查询`,
  };
  return links.map((link) => ({
    ...link,
    count: countByPath[link.path],
    meta: metaByPath[link.path],
  }));
}

function ModuleCard({ link }: { link: HomeLink }) {
  const navigate = useNavigate();
  return (
    <AccentCard
      onClick={() => navigate(link.path)}
      icon={<Icon name={link.icon} size={22} sx={{ color: link.color }} />}
      title={link.title}
      description={link.desc}
    >
      {typeof link.count === "number" && (
        <Box
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            minWidth: 34,
            px: 0.75,
            py: 0.25,
            borderRadius: 1.25,
            textAlign: "center",
            fontSize: "0.8125rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: "text.primary",
            bgcolor: "action.hover",
          }}
        >
          {link.count.toLocaleString()}
        </Box>
      )}
      {/* 统一预留一行底部信息区，所有卡片等高校对齐。 */}
      <Box sx={{ minHeight: 20, mt: 0.75 }}>
        {link.meta && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: "block", lineHeight: "20px" }}
          >
            {link.meta}
          </Typography>
        )}
      </Box>
    </AccentCard>
  );
}

function ModuleGrid({ stats }: { stats: ReturnType<typeof useHomeStats> }) {
  const grid = applyCounts(links, stats);
  return (
    <Grid2 container spacing={2}>
      {grid.map((link) => (
        <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={link.path}>
          <ModuleCard link={link} />
        </Grid2>
      ))}
    </Grid2>
  );
}

function RecentDashboards({
  stats,
}: {
  stats: ReturnType<typeof useHomeStats>;
}) {
  const navigate = useNavigate();
  const favIds = useDashboardFavorites((s) => s.ids);
  const toggleFavorite = useDashboardFavorites((s) => s.toggle);
  const notify = useNotificationStore((s) => s.notify);
  const handleCopyLink = async (id: number) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dashboard/${id}`,
      );
      notify({ severity: "success", message: "已复制仪表板链接" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  if (stats.loading || stats.recentDashboards.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          最近更新的仪表板
        </Typography>
        <Box
          component="button"
          onClick={() => navigate("/dashboard/list")}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "primary.main",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          查看全部
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {stats.recentDashboards.map((d) => (
          <Box
            key={d.id}
            onClick={() => navigate(`/dashboard/${d.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Icon name="dashboard" size={16} sx={{ color: "success.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {d.dashboard_title}
            </Typography>
            <Tooltip title="复制链接">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyLink(d.id);
                }}
                sx={{ p: 0.25 }}
              >
                <ContentCopyIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={favIds.includes(d.id) ? "取消收藏" : "收藏"}
            >
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(d.id);
                }}
                sx={{ p: 0.25 }}
              >
                {favIds.includes(d.id) ? (
                  <StarIcon sx={{ fontSize: 15, color: "warning.main" }} />
                ) : (
                  <StarBorderIcon sx={{ fontSize: 15, color: "text.disabled" }} />
                )}
              </IconButton>
            </Tooltip>
            {d.changed_on_delta_humanized && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ flexShrink: 0 }}
              >
                {d.changed_on_delta_humanized}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 常用操作的快捷入口，把高频动作放到首页首屏。 */
function QuickActions() {
  const navigate = useNavigate();
  const recentDbs = useRecentDashboards((s) => s.items);
  const lastId = recentDbs.length > 0 ? recentDbs[0].id : null;
  const actions: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    color: string;
  }[] = [
    ...(lastId
      ? [
          {
            label: "继续上次",
            icon: <HistoryIcon sx={{ fontSize: 20 }} />,
            onClick: () => navigate(`/dashboard/${lastId}`),
            color: "text.secondary",
          },
        ]
      : []),
    {
      label: "新建图表",
      icon: <BarChartIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate("/explore"),
      color: "primary.main",
    },
    {
      label: "打开 SQL 实验室",
      icon: <CodeIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate("/sqllab"),
      color: "secondary.main",
    },
    {
      label: "新建仪表板",
      icon: <DashboardIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate("/dashboard/list"),
      color: "success.main",
    },
    {
      label: "新建数据集",
      icon: <TableChartIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate("/dataset/create"),
      color: "info.main",
    },
  ];
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        mb: 3,
      }}
    >
      {actions.map((a) => (
        <Button
          key={a.label}
          variant="outlined"
          size="small"
          onClick={a.onClick}
          startIcon={a.icon}
          sx={{ textTransform: "none", color: a.color }}
        >
          {a.label}
        </Button>
      ))}
    </Box>
  );
}

/** 最近更新的数据集：把最近修改的数据集作为首页快捷入口。 */
function RecentDatasets({
  stats,
}: {
  stats: ReturnType<typeof useHomeStats>;
}) {
  const navigate = useNavigate();
  const notify = useNotificationStore((s) => s.notify);

  const handleCopyLink = async (id: number) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dataset/edit/${id}`,
      );
      notify({ severity: "success", message: "已复制数据集链接" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  if (stats.loading || stats.recentDatasets.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          最近更新的数据集
        </Typography>
        <Box
          component="button"
          onClick={() => navigate("/dataset/list")}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "primary.main",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          查看全部
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {stats.recentDatasets.map((d) => (
          <Box
            key={d.id}
            onClick={() => navigate(`/dataset/edit/${d.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <TableChartIcon sx={{ fontSize: 16, color: "info.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "monospace",
                fontSize: "0.8125rem",
              }}
            >
              {d.table_name}
            </Typography>
            <Tooltip title="复制链接">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCopyLink(d.id);
                }}
                sx={{ p: 0.25 }}
              >
                <ContentCopyIcon
                  sx={{ fontSize: 15, color: "text.disabled" }}
                />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 最近更新的图表：把最近修改的图表作为首页快捷入口。 */
function RecentCharts({
  stats,
}: {
  stats: ReturnType<typeof useHomeStats>;
}) {
  const navigate = useNavigate();

  if (stats.loading || stats.recentCharts.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          最近更新的图表
        </Typography>
        <Box
          component="button"
          onClick={() => navigate("/chart/list")}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "primary.main",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          查看全部
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {stats.recentCharts.map((c) => (
          <Box
            key={c.id}
            onClick={() => navigate(`/explore?slice_id=${c.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <BarChartIcon sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {c.slice_name}
            </Typography>
            <ChevronRightIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 滚动后回到页面顶部的小浮层。 */
function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <Fab
      size="small"
      color="primary"
      aria-label="返回顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      sx={{ position: "fixed", right: 24, bottom: 24, zIndex: (t) => t.zIndex.fab }}
    >
      <KeyboardArrowUpIcon />
    </Fab>
  );
}

/** 首页顶部的一行关键数量统计。 */
function StatStrip({
  stats,
}: {
  stats: ReturnType<typeof useHomeStats>;
}) {
  const navigate = useNavigate();
  const items: { label: string; value: number; path: string }[] = [
    { label: "仪表板数", value: stats.dashboards, path: "/dashboard/list" },
    { label: "图表数", value: stats.charts, path: "/chart/list" },
    { label: "数据集数", value: stats.datasets, path: "/dataset/list" },
    { label: "数据库数", value: stats.databases, path: "/database/list" },
    { label: "已保存查询数", value: stats.savedQueries, path: "/saved_query/list" },
  ];
  const notify = useNotificationStore((s) => s.notify);
  const handleCopySummary = async () => {
    const lines = items.map((it) => `${it.label}: ${it.value}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      notify({ severity: "success", message: "已复制数据概览" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        mb: 3,
        px: 0.5,
        alignItems: "center",
      }}
    >
      {items.map((it) => (
        <Tooltip key={it.label} title={`查看${it.label.replace("数", "")}列表`}>
          <Box
            onClick={() => navigate(it.path)}
            sx={{
              display: "flex",
              alignItems: "baseline",
              gap: 0.5,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
              {stats.loading ? "–" : it.value.toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {it.label}
            </Typography>
          </Box>
        </Tooltip>
      ))}
      <Tooltip title="复制数据概览">
        <IconButton
          size="small"
          onClick={() => void handleCopySummary()}
          sx={{ color: "text.secondary" }}
        >
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default function Home() {
  const stats = useHomeStats();
  return (
    <Box sx={{ p: 3, maxWidth: "lg", mx: "auto" }}>
      <PageHeader title="欢迎使用 Starfly" subtitle="选择一个模块开始使用" />
      <BackToTop />
      <StatStrip stats={stats} />
      <QuickActions />
      <FavoriteCharts />
      <FavoriteDatasets />
      <FavoriteDatabases />
      <FavoriteSavedQueries />
      <FavoriteAlerts />
      <FavoriteDashboards />
      <RecentlyViewedCharts />
      <RecentlyViewedDashboards />
      <RecentDashboards stats={stats} />
      <RecentDatasets stats={stats} />
      <RecentCharts stats={stats} />
      <RecentQueries />
      <ModuleGrid stats={stats} />
    </Box>
  );
}

/** 最近打开的图表：记录用户在本端实际打开编辑过的图表，作为快捷入口。 */
function RecentlyViewedCharts() {
  const navigate = useNavigate();
  const recentItems = useRecentCharts((s) => s.items);
  const [items, setItems] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (recentItems.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      recentItems.map((item) =>
        api
          .get<{ result: { slice_name?: string } }>(`/chart/${item.id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id: item.id,
            title: res.data.result?.slice_name ?? `图表 ${item.id}`,
          }))
          .catch(() => null),
      ),
    )
      .then((res) => setItems(res.filter((x): x is { id: number; title: string } => !!x)))
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [recentItems]);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Icon
          name="chart"
          size={16}
          sx={{ color: "primary.main", display: "flex" }}
        />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          最近打开的图表
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box
          component="button"
          onClick={() => useRecentCharts.getState().clear()}
          sx={{
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "text.secondary",
            "&:hover": { color: "primary.main", textDecoration: "underline" },
          }}
        >
          清空
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((it) => (
          <Box
            key={it.id}
            onClick={() => navigate(`/explore?slice_id=${it.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Icon
              name="chart"
              size={16}
              sx={{ color: "primary.main", display: "flex" }}
            />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {it.title}
            </Typography>
            <ChevronRightIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 最近打开的仪表板：记录用户在本端实际点开过的仪表板，作为快捷入口。 */
function RecentlyViewedDashboards() {
  const navigate = useNavigate();
  const recentItems = useRecentDashboards((s) => s.items);
  const [items, setItems] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (recentItems.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      recentItems.map((item) =>
        api
          .get<{ result: { dashboard_title?: string } }>(`/dashboard/${item.id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id: item.id,
            title: res.data.result?.dashboard_title ?? `仪表板 ${item.id}`,
          }))
          .catch(() => null),
      ),
    )
      .then((res) => setItems(res.filter((x): x is { id: number; title: string } => !!x)))
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [recentItems]);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Icon
          name="history"
          size={16}
          sx={{ color: "text.secondary", display: "flex" }}
        />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          最近打开
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box
          component="button"
          onClick={() => useRecentDashboards.getState().clear()}
          sx={{
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "text.secondary",
            "&:hover": { color: "primary.main", textDecoration: "underline" },
          }}
        >
          清空
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((it) => (
          <Box
            key={it.id}
            onClick={() => navigate(`/dashboard/${it.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Icon
              name="dashboard"
              size={16}
              sx={{ color: "success.main", display: "flex" }}
            />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {it.title}
            </Typography>
            <ChevronRightIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 收藏的仪表板：把用户在仪表板列表里收藏的仪表板作为首页快捷入口。 */
function FavoriteDashboards() {
  const navigate = useNavigate();
  const favIds = useDashboardFavorites((s) => s.ids);
  const toggleFavorite = useDashboardFavorites((s) => s.toggle);
  const [items, setItems] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (favIds.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      favIds.map((id) =>
        api
          .get<{ result: { dashboard_title?: string } }>(`/dashboard/${id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id,
            title: res.data.result?.dashboard_title ?? `仪表板 ${id}`,
          }))
          .catch(() => null),
      ),
    )
      .then((res) => setItems(res.filter((x): x is { id: number; title: string } => !!x)))
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [favIds]);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          收藏的仪表板
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((it) => (
          <Box
            key={it.id}
            onClick={() => navigate(`/dashboard/${it.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {it.title}
            </Typography>
            <Tooltip title="移除收藏">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(it.id);
                }}
                sx={{ p: 0.25 }}
              >
                <StarBorderIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 收藏的图表：把用户在图表列表里收藏的图表作为首页快捷入口。 */
function FavoriteCharts() {
  const navigate = useNavigate();
  const favIds = useChartFavorites((s) => s.ids);
  const toggleFavorite = useChartFavorites((s) => s.toggle);
  const [items, setItems] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (favIds.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      favIds.map((id) =>
        api
          .get<{ result: { slice_name?: string } }>(`/chart/${id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id,
            title: res.data.result?.slice_name ?? `图表 ${id}`,
          }))
          .catch(() => null),
      ),
    )
      .then((res) =>
        setItems(
          res.filter((x): x is { id: number; title: string } => !!x),
        ),
      )
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [favIds]);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          收藏的图表
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((it) => (
          <Box
            key={it.id}
            onClick={() => navigate(`/explore?slice_id=${it.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {it.title}
            </Typography>
            <Tooltip title="移除收藏">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(it.id);
                }}
                sx={{ p: 0.25 }}
              >
                <StarBorderIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 收藏的数据集：把用户在数据集列表里收藏的数据集作为首页快捷入口。 */
function FavoriteDatasets() {
  const navigate = useNavigate();
  const favIds = useDatasetFavorites((s) => s.ids);
  const toggleFavorite = useDatasetFavorites((s) => s.toggle);
  const [items, setItems] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (favIds.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      favIds.map((id) =>
        api
          .get<{ result: { table_name?: string } }>(`/dataset/${id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id,
            title: res.data.result?.table_name ?? `数据集 ${id}`,
          }))
          .catch(() => null),
      ),
    )
      .then((res) =>
        setItems(
          res.filter((x): x is { id: number; title: string } => !!x),
        ),
      )
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [favIds]);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          收藏的数据集
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((it) => (
          <Box
            key={it.id}
            onClick={() => navigate(`/dataset/edit/${it.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {it.title}
            </Typography>
            <Tooltip title="移除收藏">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(it.id);
                }}
                sx={{ p: 0.25 }}
              >
                <StarBorderIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 收藏的数据库：把用户在数据库列表里收藏的数据库作为首页快捷入口。 */
function FavoriteDatabases() {
  const navigate = useNavigate();
  const favIds = useDatabaseFavorites((s) => s.ids);
  const toggleFavorite = useDatabaseFavorites((s) => s.toggle);
  const [items, setItems] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (favIds.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      favIds.map((id) =>
        api
          .get<{ result: { database_name?: string } }>(`/database/${id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id,
            title: res.data.result?.database_name ?? `数据库 ${id}`,
          }))
          .catch(() => null),
      ),
    )
      .then((res) =>
        setItems(
          res.filter((x): x is { id: number; title: string } => !!x),
        ),
      )
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [favIds]);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          收藏的数据库
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((it) => (
          <Box
            key={it.id}
            onClick={() => navigate(`/database/${it.id}`)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {it.title}
            </Typography>
            <Tooltip title="移除收藏">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(it.id);
                }}
                sx={{ p: 0.25 }}
              >
                <StarBorderIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 收藏的查询：把用户在已保存查询列表里收藏的查询作为首页快捷入口。 */
function FavoriteSavedQueries() {
  const navigate = useNavigate();
  const favIds = useSavedQueryFavorites((s) => s.ids);
  const toggleFavorite = useSavedQueryFavorites((s) => s.toggle);
  const [items, setItems] = useState<{ id: number; title: string; sql?: string }[]>(
    [],
  );

  useEffect(() => {
    if (favIds.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      favIds.map((id) =>
        api
          .get<{ result?: { label?: string; sql?: string } }>(`/saved_query/${id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id,
            title: res.data.result?.label ?? `查询 ${id}`,
            sql: res.data.result?.sql,
          }))
          .catch(() => null),
      ),
    )
      .then((res) =>
        setItems(
          res.filter(Boolean) as { id: number; title: string; sql?: string }[],
        ),
      )
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [favIds]);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          收藏的查询
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((it) => (
          <Box
            key={it.id}
            onClick={() =>
              navigate("/sqllab", { state: { initialSql: it.sql ?? "" } })
            }
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {it.title}
            </Typography>
            <Tooltip title="移除收藏">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(it.id);
                }}
                sx={{ p: 0.25 }}
              >
                <StarBorderIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 收藏的警报/报告：把用户收藏的警报作为首页快捷入口。 */
function FavoriteAlerts() {
  const navigate = useNavigate();
  const favIds = useAlertFavorites((s) => s.ids);
  const toggleFavorite = useAlertFavorites((s) => s.toggle);
  const [items, setItems] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    if (favIds.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      favIds.map((id) =>
        api
          .get<{ result?: { name?: string } }>(`/report/${id}`, {
            signal: controller.signal,
          })
          .then((res) => ({
            id,
            title: res.data.result?.name ?? `警报 ${id}`,
          }))
          .catch(() => null),
      ),
    )
      .then((res) =>
        setItems(
          res.filter(Boolean) as { id: number; title: string }[],
        ),
      )
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [favIds]);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          收藏的警报
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((it) => (
          <Box
            key={it.id}
            onClick={() => navigate("/alert/list")}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
            <Typography
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.8125rem",
              }}
            >
              {it.title}
            </Typography>
            <Tooltip title="移除收藏">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(it.id);
                }}
                sx={{ p: 0.25 }}
              >
                <StarBorderIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** 最近的查询：读取 SQL 实验室里最近执行的 SQL，供首页快速重跑。 */
function RecentQueries() {
  const navigate = useNavigate();
  const [queries, setQueries] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("superset-sql-lab-recent-queries");
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      setQueries(Array.isArray(arr) ? arr.slice(0, 8) : []);
    } catch {
      setQueries([]);
    }
  }, []);

  if (queries.length === 0) return null;

  const clearQueries = () => {
    localStorage.removeItem("superset-sql-lab-recent-queries");
    setQueries([]);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          最近的查询
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            · {queries.length}
          </Typography>
          <Tooltip title="清除记录">
            <IconButton
              size="small"
              onClick={clearQueries}
              sx={{ p: 0.5, color: "text.secondary" }}
            >
              <ClearIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {queries.map((q, i) => {
          const oneLine = q.split("\n").filter(Boolean).join(" ").slice(0, 80);
          return (
            <Box
              key={`${q}-${i}`}
              onClick={() => navigate("/sqllab", { state: { initialSql: q } })}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 1,
                borderRadius: 1.5,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <CodeIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              <Typography
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "monospace",
                  fontSize: "0.8125rem",
                }}
              >
                {oneLine || q}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
