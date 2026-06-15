import { useEffect, useRef } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import FilterListIcon from "@mui/icons-material/FilterList";
import MenuIcon from "@mui/icons-material/Menu";
import ChatInput from "@/components/ChatInput";
import {
  FilterToolbarButton,
  useDashboardFilters,
} from "@/components/DashboardFilter";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useToolbarStore } from "@/store/toolbarStore";
import type { DashboardData } from "@/types/api";
import type { LayoutNode } from "@/utils/dashboard/layout";

interface DashboardToolbarProps {
  dashboard: DashboardData | null;
  nodeMap: Record<string, LayoutNode>;
  gridId: string | null;
  chartMeta: Record<number, { id: number; slice_name: string }>;
  refreshAllCharts: () => void;
  onFilterDrawerToggle: (prev: boolean) => void;
  onPendingFilterIds: (fn: (prev: string[]) => string[]) => void;
}

export default function DashboardToolbar({
  dashboard,
  nodeMap,
  gridId,
  chartMeta,
  refreshAllCharts,
  onFilterDrawerToggle,
  onPendingFilterIds,
}: DashboardToolbarProps) {
  const setCustom = useBreadcrumbStore((s) => s.setCustom);
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);
  const pageKey = `dashboard_${dashboard?.id}`;

  const dashboardChartIds = new Set<number>();
  for (const node of Object.values(nodeMap)) {
    if (node.type === "CHART" && node.meta?.chartId) {
      dashboardChartIds.add(Number(node.meta.chartId));
    }
  }

  const {
    filters,
    filterState: _filterState,
    clearAll,
    buildAdhocFilters: _buildAdhocFilters,
    activeCount,
  } = useDashboardFilters(dashboard?.json_metadata ?? null, []);

  const hiddenFilters = filters.slice(8);

  const layoutItems = Object.values(nodeMap).filter(
    (n) => n.type === "CHART" && n.meta?.chartId,
  );

  const navItemsRef = useRef<{ id: number; name: string }[]>([]);
  const openNav = () => {
    const cards = document.querySelectorAll("[data-chart-index]");
    const items = Array.from(cards).map((el) => ({
      id: Number(el.getAttribute("data-chart-index")),
      name:
        el
          .querySelector(".drag-handle .MuiTypography-root")
          ?.textContent?.trim() ||
        `Chart #${el.getAttribute("data-chart-index")}`,
    }));
    navItemsRef.current = items;
  };

  useEffect(() => {
    if (!dashboard) return;
    setCustom({
      label: dashboard.dashboard_title,
      status: dashboard.published ? "published" : "draft",
    });
    registerTools(pageKey, [
      {
        id: "search",
        priority: 0,
        showOnMobile: false,
        render: <ChatInput />,
      },
      {
        id: "filter",
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabIcon: <FilterListIcon />,
        fabLabel: "Filter",
        action: () => onFilterDrawerToggle(true),
        render: (
          <FilterToolbarButton
            activeCount={activeCount}
            hiddenFilters={hiddenFilters}
            onOpenDrawer={() => onFilterDrawerToggle(true)}
            onClearAll={() => clearAll()}
            onAddFilter={(id: string) => {
              onPendingFilterIds((prev) => [...prev, id]);
              onFilterDrawerToggle(true);
            }}
          />
        ),
      },
      {
        id: "refresh",
        priority: 20,
        showOnMobile: false,
        fabIcon: <RefreshIcon />,
        fabLabel: "Refresh",
        action: refreshAllCharts,
        render: null,
      },
      ...(layoutItems.length > 1
        ? [
            {
              id: "nav",
              priority: 25,
              showOnMobile: true,
              fabIcon: <MenuIcon />,
              fabLabel: "Jump to chart",
              action: openNav,
              render: null,
            },
          ]
        : []),
    ]);
    return () => unregisterTools(pageKey);
  }, [dashboard, activeCount, hiddenFilters, clearAll, pageKey]);

  return null;
}
