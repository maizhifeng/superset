import { useEffect } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";
import MenuIcon from "@mui/icons-material/Menu";
import ChatInput from "@/components/ChatInput";
import { FilterToolbarButton, FilterToggleFab } from "@/components/DashboardFilter";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useToolbarStore } from "@/store/toolbarStore";
import type { DashboardData } from "@/types/api";

interface UseDashboardToolbarParams {
  dashboard: DashboardData | null;
  activeCount: number;
  hiddenFilters: { id: string; name: string }[];
  clearAll: () => void;
  layoutItems: { chartId: number }[];
  onFilterDrawerOpen: () => void;
  onFilterDrawerToggle: () => void;
  onAddFilter: (id: string) => void;
  onRefreshAll: () => void;
  onOpenNav: () => void;
  onAddChart: () => void;
}

export default function useDashboardToolbar({
  dashboard,
  activeCount,
  hiddenFilters,
  clearAll,
  layoutItems,
  onFilterDrawerOpen,
  onFilterDrawerToggle,
  onAddFilter,
  onRefreshAll,
  onOpenNav,
  onAddChart,
}: UseDashboardToolbarParams) {
  const setCustom = useBreadcrumbStore((s) => s.setCustom);
  const registerTools = useToolbarStore((s) => s.registerTools);
  const unregisterTools = useToolbarStore((s) => s.unregisterTools);
  const pageKey = `dashboard_${dashboard?.id}`;

  useEffect(() => {
    if (!dashboard) return;
    setCustom({
      label: dashboard.dashboard_title,
      status: dashboard.published ? "published" : "draft",
    });
    registerTools(pageKey, [
      ...(layoutItems.length > 0
        ? [
            {
              id: "add_chart",
              priority: 5,
              showOnMobile: true,
              fabIcon: <AddIcon />,
              fabLabel: "添加图表",
              action: onAddChart,
              render: null,
            },
          ]
        : []),
      {
        id: "search",
        priority: 0,
        showOnMobile: false,
        render: <ChatInput placeholder="询问关于此仪表板的问题..." />,
      },
      {
        id: "filter",
        priority: 10,
        showOnMobile: true,
        primary: true,
        fabLabel: "筛选",
        fabRender: (
          <FilterToggleFab
            activeCount={activeCount}
            hiddenCount={hiddenFilters.length}
            hiddenFilters={hiddenFilters}
            onOpenDrawer={onFilterDrawerOpen}
            onClearAll={clearAll}
            onAddFilter={(id: string) => {
              onAddFilter(id);
              onFilterDrawerOpen();
            }}
          />
        ),
        render: (
          <FilterToolbarButton
            activeCount={activeCount}
            hiddenFilters={hiddenFilters}
            onOpenDrawer={onFilterDrawerOpen}
            onToggleDrawer={onFilterDrawerToggle}
            onClearAll={clearAll}
            onAddFilter={(id: string) => {
              onAddFilter(id);
              onFilterDrawerOpen();
            }}
          />
        ),
      },
      {
        id: "refresh",
        priority: 20,
        showOnMobile: false,
        fabIcon: <RefreshIcon />,
        fabLabel: "刷新",
        action: onRefreshAll,
        render: null,
      },
      ...(layoutItems.length > 1
        ? [
            {
              id: "nav",
              priority: 25,
              showOnMobile: true,
              fabIcon: <MenuIcon />,
              fabLabel: "跳转到图表",
              action: onOpenNav,
              render: null,
            },
          ]
        : []),
    ]);
    return () => unregisterTools(pageKey);
  }, [
    dashboard,
    activeCount,
    hiddenFilters,
    clearAll,
    pageKey,
    onAddChart,
    onFilterDrawerOpen,
    onFilterDrawerToggle,
    onAddFilter,
    onRefreshAll,
    onOpenNav,
    layoutItems.length,
    registerTools,
    setCustom,
    unregisterTools,
  ]);
}
