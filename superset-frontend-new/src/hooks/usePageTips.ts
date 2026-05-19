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
    title: "Home",
    message:
      "Use G+C to view Charts, G+B for Dashboards, G+Q for SQL Lab. Press / to search anything.",
  },
  dashboard_list: {
    id: "dashboard_list",
    title: "Dashboards",
    message:
      "Press / to quickly search, or click + to create a new dashboard. Use G+B to jump here anytime.",
  },
  chart_list: {
    id: "chart_list",
    title: "Charts",
    message:
      "Browse and manage your saved charts. Press G+C to jump here. Click a chart to open it in Explore.",
  },
  explore: {
    id: "explore",
    title: "Explore",
    message:
      "Select a dataset, pick a chart type, then drag dimensions and metrics from the left panel. Ctrl+Enter to run preview, Ctrl+S to save.",
  },
  sqllab: {
    id: "sqllab",
    title: "SQL Lab",
    message:
      "Write SQL and press Ctrl+Enter to run. Ctrl+Shift+F to format, Ctrl+T for a new tab, Ctrl+R to re-run.",
  },
  dataset_list: {
    id: "dataset_list",
    title: "Datasets",
    message:
      "A dataset maps a database table for charting. Press G+D to jump here. Define dimensions (categories) and metrics (numbers) for each column.",
  },
  database_list: {
    id: "database_list",
    title: "Databases",
    message:
      "Connect to PostgreSQL, MySQL, BigQuery, or any supported database. This is the first step in the data pipeline.",
  },
  dashboard: {
    id: "dashboard",
    title: "Dashboard",
    message:
      "Use the + button to add charts, apply cross-filters, and compare dimensions. Ctrl+E to edit layout, Ctrl+S to save changes.",
  },
  saved_query_list: {
    id: "saved_query_list",
    title: "Saved Queries",
    message:
      "Your saved SQL queries are listed here for quick reuse. Run them again or turn them into datasets.",
  },
  alert_list: {
    id: "alert_list",
    title: "Alerts & Reports",
    message:
      "Set up alerts and scheduled reports for your data. Get notified when metrics cross thresholds.",
  },
  query_history: {
    id: "query_history",
    title: "Query History",
    message:
      "Review past SQL queries executed in SQL Lab. Useful for debugging and re-running analysis.",
  },
  dataset_create: {
    id: "dataset_create",
    title: "Create Dataset",
    message:
      "Pick a database, then select a schema and table. Starfly will detect column types automatically.",
  },
  dataset_edit: {
    id: "dataset_edit",
    title: "Edit Dataset",
    message:
      "Configure column metadata, add metrics, and toggle filter behavior. For SQL datasets, you can edit the query directly.",
  },
  settings: {
    id: "settings",
    title: "Settings",
    message:
      "Customize your navigation menu — reorder items, toggle visibility, or add custom routes.",
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
