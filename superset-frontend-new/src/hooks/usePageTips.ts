import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export interface PageTip {
  id: string;
  title: string;
  message: string;
  icon?: string;
}

const PAGE_TIPS: Record<string, PageTip> = {
  home: {
    id: "home",
    title: "首页",
    message:
      "按 G+C 查看图表，G+B 查看仪表板，G+Q 跳转 SQL 实验室。按 / 搜索任何内容。",
  },
  dashboard_list: {
    id: "dashboard_list",
    title: "仪表板",
    message:
      "按 / 快速搜索，或点击 + 新建仪表板。随时按 G+B 跳转至此。",
  },
  chart_list: {
    id: "chart_list",
    title: "图表",
    message:
      "浏览和管理已保存的图表。按 G+C 跳转至此。点击图表在探索中打开。",
  },
  explore: {
    id: "explore",
    title: "探索",
    message:
      "选择数据集，选择图表类型，然后从左面板拖拽维度和指标。Ctrl+Enter 运行预览，Ctrl+S 保存。",
  },
  sqllab: {
    id: "sqllab",
    title: "SQL 实验室",
    message:
      "编写 SQL 并按 Ctrl+Enter 运行。Ctrl+Shift+F 格式化，Ctrl+T 新建标签页，Ctrl+R 重新运行。",
  },
  dataset_list: {
    id: "dataset_list",
    title: "数据集",
    message:
      "数据集将数据库表映射为图表数据。按 G+D 跳转至此。为每列定义维度（分类）和指标（数值）。",
  },
  database_list: {
    id: "database_list",
    title: "数据库",
    message:
      "连接 PostgreSQL、MySQL、BigQuery 或任何支持的数据库。这是数据管线的第一步。",
  },
  dashboard: {
    id: "dashboard",
    title: "仪表板",
    message:
      "使用 + 按钮添加图表、应用交叉筛选和对比维度。Ctrl+S 保存更改。",
  },
  saved_query_list: {
    id: "saved_query_list",
    title: "已保存查询",
    message:
      "已保存的 SQL 查询列于此，方便快速复用。可再次运行或转为数据集。",
  },
  alert_list: {
    id: "alert_list",
    title: "告警与报告",
    message:
      "为您的数据设置告警和定时报告。当指标超出阈值时收到通知。",
  },
  query_history: {
    id: "query_history",
    title: "查询历史",
    message:
      "查看在 SQL 实验室中执行的过往查询。有助于调试和重新运行分析。",
  },
  dataset_create: {
    id: "dataset_create",
    title: "创建数据集",
    message:
      "选择数据库，然后选择模式和表。Starfly 将自动检测列类型。",
  },
  dataset_edit: {
    id: "dataset_edit",
    title: "编辑数据集",
    message:
      "配置列元数据、添加指标和切换筛选行为。对于 SQL 数据集，可直接编辑查询。",
  },
  settings: {
    id: "settings",
    title: "设置",
    message:
      "自定义导航菜单 — 重新排序项、切换可见性或添加自定义路由。",
  },
};

function matchTip(pathname: string): PageTip | null {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/" || p === "") return PAGE_TIPS.home;

  if (p === "/settings") return PAGE_TIPS.settings;

  if (p === "/dataset/create") return PAGE_TIPS.dataset_create;
  if (p.startsWith("/dataset/edit/")) return PAGE_TIPS.dataset_edit;

  for (const [key, tip] of Object.entries(PAGE_TIPS)) {
    if (
      key === "home" ||
      key === "settings" ||
      key === "dataset_create" ||
      key === "dataset_edit"
    )
      continue;
    const pattern =
      key === "dashboard"
        ? "/dashboard/"
        : key === "explore"
          ? "/explore"
          : `/${key.replace(/_/g, "/")}`;
    if (p === pattern || p.startsWith(pattern + "/")) return tip;
  }

  if (p.startsWith("/dashboard/")) return PAGE_TIPS.dashboard;
  if (p.startsWith("/explore")) return PAGE_TIPS.explore;
  if (p.startsWith("/sqllab")) return PAGE_TIPS.sqllab;

  return null;
}

export function usePageTip(): PageTip | null {
  const { pathname } = useLocation();
  return useMemo(() => matchTip(pathname), [pathname]);
}
