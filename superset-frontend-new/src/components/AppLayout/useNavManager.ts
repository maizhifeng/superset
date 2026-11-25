/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useNavStore } from "@/store/navStore";
import { useMenuSettings } from "@/store/menuSettings";
import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { useAuthStore } from "@/store/authStore";
import { menuIconMap, defaultIcon } from "./menuIconMap";
import { resolveMenuId } from "@/config/menuRoutes";
import type { NavCategory } from "@/store/navStore";

/** Side-panel categories use short ids; the activity rail uses menu ids. */
const categoryToMenuId: Record<string, string> = {
  dashboard: "dashboards",
  chart: "charts",
  dataset: "datasets",
  saved_query: "saved_query/list",
  database: "database/list",
  sqllab: "sqllab",
  settings: "settings",
  briefing: "briefing",
  alert: "alert/list",
  query_history: "query_history",
  project_config: "project_config",
};

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
  const { pathname } = useLocation();
  const items = useMenuSettings((s) => s.items);
  const enabled = useMenuSettings((s) => s.enabled);
  const userRoles = useAuthStore((s) => s.user?.roles);
  const routeOverrides = useUserRouteOverrides((s) => s.overrides);
  const currentUsername = useAuthStore((s) => s.user?.username);

  const canAccessSystemAdmin = useMemo(() => {
    if (!currentUsername) return false;
    const userOverrides = routeOverrides[currentUsername] ?? {};
    if (userOverrides["/system/admin"] === false) return false;
    return userRoles?.Admin === true;
  }, [currentUsername, userRoles, routeOverrides]);

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

  /** Highlight the rail entry that owns the current route, even when the side
   *  panel was never opened (deep links, direct navigation, refresh). */
  const routeMenuId = useMemo(() => {
    if (pathname.startsWith("/system/admin")) return "system_admin";
    return resolveMenuId(pathname);
  }, [pathname]);

  const activeId =
    hoverCat ??
    routeMenuId ??
    (activeCategory ? categoryToMenuId[activeCategory] : null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const navigationItems = useMemo(() => {
    const visibleItems = items
      .filter((item) => {
        if (item.id === "home") return false;
        if (!enabled[item.id]) return false;
        const userOverrides = currentUsername
          ? (routeOverrides[currentUsername] ?? {})
          : {};
        if (userOverrides[item.path] === false) return false;
        if (!item.roles || item.roles.length === 0) return true;
        return item.roles.some((role) => userRoles?.[role] === true);
      })
      .map((item) => ({
        id: item.id,
        path: item.path,
        label: item.label,
      }));
    return canAccessSystemAdmin
      ? [
          ...visibleItems,
          { id: "system_admin", path: "/system/admin", label: "系统管理" },
        ]
      : visibleItems;
  }, [
    items,
    enabled,
    userRoles,
    routeOverrides,
    currentUsername,
    canAccessSystemAdmin,
  ]);

  const activityBarItems: ActivityBarItem[] = useMemo(
    () =>
      navigationItems.map((item) => ({
        id: item.id,
        icon: menuIconMap[item.id] ?? defaultIcon,
        label: item.label,
      })),
    [navigationItems],
  );

  const handleNavEnter = useCallback((cat: string) => {
    clearTimeout(closeTimerRef.current);
    setHoverCat(cat);
    const mapped = menuIdToCategory[cat];
    if (!mapped) return;
    const navStore = useNavStore.getState();
    if (navStore.sidePanelPinned) {
      if (navStore.activeCategory !== mapped)
        void navStore.toggleCategory(mapped);
      return;
    }
    openTimerRef.current = setTimeout(() => {
      if (!navStore.sidePanelOpen || navStore.activeCategory !== mapped) {
        void navStore.toggleCategory(mapped);
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
      clearTimeout(openTimerRef.current);
      clearTimeout(closeTimerRef.current);
      const mapped = menuIdToCategory[id];
      if (mapped === "sqllab") {
        openOverlay("sqllab");
        closeSidePanel();
        return;
      }
      if (mapped) {
        const item = items.find((i) => i.id === id);
        if (item && item.path.endsWith("/list")) {
          navigate(item.path);
          const { sidePanelPinned, activeCategory, sidePanelOpen } =
            useNavStore.getState();
          if (sidePanelPinned) {
            if (activeCategory !== mapped || !sidePanelOpen) {
              void toggleCategory(mapped);
            }
          } else {
            closeSidePanel();
          }
          return;
        }
        const { sidePanelPinned, activeCategory } = useNavStore.getState();
        if (sidePanelPinned && activeCategory === mapped) return;
        await toggleCategory(mapped);
        return;
      }
      if (id === "system_admin") {
        navigate("/system/admin");
        if (!useNavStore.getState().sidePanelPinned) {
          closeSidePanel();
        }
        return;
      }
      const item = items.find((i) => i.id === id);
      if (item) {
        navigate(item.path);
        if (!useNavStore.getState().sidePanelPinned) {
          closeSidePanel();
        }
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
        if (!useNavStore.getState().sidePanelPinned) {
          closeSidePanel();
        }
      } else if (activeCategory === "database") {
        navigate("/database/list");
        if (!useNavStore.getState().sidePanelPinned) {
          closeSidePanel();
        }
      } else {
        openOverlay(activeCategory ?? "chart", id);
      }
    },
    [activeCategory, selectDashboard, navigate, closeSidePanel, openOverlay],
  );

  return {
    activeId,
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
    navigationItems,
    handleNavEnter,
    handleNavLeave,
    handleActivitySelect,
    handleSidePanelSelect,
    setHoverCat,
  };
}
