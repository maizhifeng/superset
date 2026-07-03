import { useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useNavStore } from "@/store/navStore";
import { useMenuSettings } from "@/store/menuSettings";
import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { useAuthStore } from "@/store/authStore";
import { menuIconMap, defaultIcon } from "./menuIconMap";
import type { NavCategory } from "@/store/navStore";

const menuIdToCategory: Record<string, NavCategory> = {
  dashboards: "dashboard",
  charts: "chart",
  datasets: "dataset",
  "saved_query/list": "saved_query",
  "database/list": "database",
};

export interface ActivityBarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
}

export function useNavManager() {
  const navigate = useNavigate();
  const items = useMenuSettings((s) => s.items);
  const enabled = useMenuSettings((s) => s.enabled);
  const userRoles = useAuthStore((s) => s.user?.roles);
  const routeOverrides = useUserRouteOverrides((s) => s.overrides);
  const currentUsername = useAuthStore((s) => s.user?.username);

  const activeCategory = useNavStore((s) => s.activeCategory);
  const sidePanelOpen = useNavStore((s) => s.sidePanelOpen);
  const sidePanelPinned = useNavStore((s) => s.sidePanelPinned);
  const sidePanelItems = useNavStore((s) => s.sidePanelItems);
  const sidePanelLoading = useNavStore((s) => s.sidePanelLoading);
  const toggleCategory = useNavStore((s) => s.toggleCategory);
  const closeSidePanel = useNavStore((s) => s.closeSidePanel);
  const togglePinSidePanel = useNavStore((s) => s.togglePinSidePanel);
  const openOverlay = useNavStore((s) => s.openOverlay);
  const selectDashboard = useNavStore((s) => s.selectDashboard);

  const [hoverCat, setHoverCat] = useState<string | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const activityBarItems: ActivityBarItem[] = useMemo(
    () =>
      items
        .filter((item) => {
          if (item.id === "home") return false;
          if (!enabled[item.id]) return false;
          if (!item.roles || item.roles.length === 0) return true;
          if (item.roles.some((role) => userRoles?.[role] === true)) return true;
          if (currentUsername) {
            const userOverrides = routeOverrides[currentUsername] ?? {};
            const override = userOverrides[item.path];
            if (override === true) return true;
          }
          return false;
        })
        .map((item) => ({
          id: item.id,
          icon: menuIconMap[item.id] ?? defaultIcon,
          label: item.label,
        })),
    [items, enabled, userRoles, routeOverrides, currentUsername],
  );

  const handleNavEnter = useCallback((cat: string) => {
    clearTimeout(closeTimerRef.current);
    setHoverCat(cat);
    const mapped = menuIdToCategory[cat];
    if (!mapped) return;
    const navStore = useNavStore.getState();
    if (navStore.sidePanelPinned) {
      if (navStore.activeCategory !== mapped) navStore.toggleCategory(mapped);
      return;
    }
    openTimerRef.current = setTimeout(() => {
      if (!navStore.sidePanelOpen || navStore.activeCategory !== mapped) {
        navStore.toggleCategory(mapped);
      }
    }, 150);
  }, []);

  const handleNavLeave = useCallback(() => {
    clearTimeout(openTimerRef.current);
    setHoverCat(null);
    const { sidePanelPinned } = useNavStore.getState();
    if (!sidePanelPinned) {
      closeTimerRef.current = setTimeout(() => {
        useNavStore.getState().closeSidePanel();
      }, 800);
    }
  }, []);

  const handleActivitySelect = useCallback(
    async (id: string) => {
      const mapped = menuIdToCategory[id];
      if (mapped === "sqllab") {
        openOverlay("sqllab");
        closeSidePanel();
        return;
      }
      if (mapped) {
        const { sidePanelPinned, activeCategory } = useNavStore.getState();
        if (sidePanelPinned && activeCategory === mapped) return;
        await toggleCategory(mapped);
        return;
      }
      const item = items.find((i) => i.id === id);
      if (item) {
        navigate(item.path);
        closeSidePanel();
      }
    },
    [items, toggleCategory, openOverlay, closeSidePanel, navigate],
  );

  const handleSidePanelSelect = useCallback(
    (id: number | string) => {
      if (activeCategory === "dashboard") {
        selectDashboard(Number(id));
        navigate(`/dashboard/${id}`);
      } else if (activeCategory === "chart") {
        navigate(`/explore?slice_id=${id}`);
      } else if (activeCategory === "dataset") {
        navigate(`/dataset/edit/${id}`);
      } else if (activeCategory === "sqllab") {
        openOverlay("sqllab");
      } else if (activeCategory === "settings") {
        navigate("/settings");
        closeSidePanel();
      } else if (activeCategory === "database") {
        navigate("/database/list");
        closeSidePanel();
      } else {
        openOverlay(activeCategory ?? "chart", id);
      }
    },
    [activeCategory, selectDashboard, navigate, closeSidePanel, openOverlay],
  );

  return {
    activeCategory,
    sidePanelOpen,
    sidePanelPinned,
    sidePanelItems,
    sidePanelLoading,
    hoverCat,
    openTimerRef,
    closeTimerRef,
    toggleCategory,
    togglePinSidePanel,
    closeSidePanel,
    activityBarItems,
    handleNavEnter,
    handleNavLeave,
    handleActivitySelect,
    handleSidePanelSelect,
    setHoverCat,
  };
}
