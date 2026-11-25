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

import { type ReactNode, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import MenuIcon from "@mui/icons-material/Menu";
import { useAuthStore } from "@/store/authStore";
import { useNavStore } from "@/store/navStore";
import { useShortcutWithHelp } from "@/hooks/useShortcut";
import { usePageTip } from "@/hooks/usePageTips";
import GlobalSnackbar from "@/components/GlobalSnackbar";
import TourGuide from "@/components/TourGuide";
import UserMenu from "@/components/AppLayout/UserMenu";
import TopBar from "@/components/AppLayout/TopBar";
import FabStack from "@/components/AppLayout/FabStack";
import ActivityBar from "@/components/ActivityBar/ActivityBar";
import SidePanel from "@/components/SidePanel/SidePanel";
import DetailOverlay from "@/components/DetailOverlay/DetailOverlay";
import SearchOverlay from "@/components/AppLayout/SearchOverlay";
import MobileDrawer from "@/components/AppLayout/MobileDrawer";
import { useNavManager } from "@/components/AppLayout/useNavManager";

const categoryLabels: Record<string, string> = {
  dashboard: "仪表板",
  chart: "图表",
  dataset: "数据集",
  saved_query: "已保存查询",
  sqllab: "SQL 实验室",
  settings: "设置",
  database: "数据库",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isSwitchedUser = useAuthStore((s) => s.isSwitchedUser);
  const switchBackToAdmin = useAuthStore((s) => s.switchBackToAdmin);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const activeOverlay = useNavStore((s) => s.activeOverlay);
  const closeOverlay = useNavStore((s) => s.closeOverlay);

  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pageTip = usePageTip();

  const {
    activeId,
    activeCategory,
    sidePanelOpen,
    sidePanelPinned,
    sidePanelItems,
    sidePanelLoading,
    hoverCat,
    closeTimerRef,
    openTimerRef,
    togglePinSidePanel,
    activityBarItems,
    navigationItems,
    handleNavEnter,
    handleNavLeave,
    handleActivitySelect,
    handleSidePanelSelect,
  } = useNavManager();

  useShortcutWithHelp(
    "/",
    (e) => {
      e.preventDefault();
      setSearchOpen((prev) => !prev);
    },
    {
      label: "搜索",
      category: "global",
      description: "按 / 搜索仪表板、图表、数据集等",
    },
  );

  // Cmd/Ctrl+K 也是常用的搜索唤醒键，与 / 等价。
  useShortcutWithHelp(
    ["command+k", "ctrl+k"],
    (e) => {
      e.preventDefault();
      setSearchOpen((prev) => !prev);
    },
    {
      label: "搜索 (Cmd/Ctrl+K)",
      category: "global",
      description: "按 ⌘K / Ctrl+K 搜索仪表板、图表、数据集等",
    },
  );

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);

  const sidePanelTitle =
    categoryLabels[activeCategory ?? ""] ??
    activityBarItems.find((i) => i.id === (hoverCat ?? activeCategory))
      ?.label ??
    "";
  const mobileItems = [
    { id: "home", path: "/", label: "首页" },
    ...navigationItems,
  ];
  const mobileEnabled = Object.fromEntries(
    mobileItems.map((item) => [item.id, true]),
  );
  const isMobileItemActive = (path: string) =>
    path === "/"
      ? pathname === "/"
      : pathname === path || pathname.startsWith(`${path}/`);

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        height: "100vh",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      <Box
        onMouseEnter={() => clearTimeout(closeTimerRef.current)}
        onMouseLeave={() => clearTimeout(openTimerRef.current)}
        sx={{ flexShrink: 0 }}
      >
        <ActivityBar
          items={activityBarItems}
          activeId={activeId}
          onSelect={(id) => void handleActivitySelect(id)}
          onItemEnter={handleNavEnter}
          onItemLeave={() => clearTimeout(openTimerRef.current)}
          searchButton={
            <Tooltip title="搜索" placement="right">
              <IconButton
                size="small"
                aria-label="搜索"
                onClick={() => setSearchOpen(true)}
                sx={{ color: "text.secondary" }}
              >
                <SearchIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          }
          searchDialog={
            <SearchOverlay
              open={searchOpen}
              query={searchQuery}
              onClose={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
              onQueryChange={setSearchQuery}
            />
          }
          userMenu={
            <UserMenu
              username={user?.username}
              anchorEl={userMenuAnchor}
              onOpen={(e) => setUserMenuAnchor(e.currentTarget)}
              onClose={() => setUserMenuAnchor(null)}
              onLogout={handleLogout}
              isSwitchedUser={isSwitchedUser}
              onSwitchBack={() => {
                void switchBackToAdmin().then(() => navigate("/"));
              }}
            />
          }
          mobileMenuButton={
            <IconButton
              size="small"
              aria-label="打开导航菜单"
              aria-haspopup="dialog"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <MenuIcon sx={{ fontSize: 20 }} />
            </IconButton>
          }
          mobileDrawer={
            <MobileDrawer
              open={mobileNavOpen}
              onClose={() => setMobileNavOpen(false)}
              items={mobileItems}
              enabled={mobileEnabled}
              isActive={isMobileItemActive}
              username={user?.username}
              onLogout={handleLogout}
            />
          }
        />
      </Box>

      <SidePanel
        open={
          !isMobile &&
          sidePanelOpen &&
          (sidePanelPinned || activeCategory != null || hoverCat != null)
        }
        title={sidePanelTitle}
        items={sidePanelItems}
        loading={sidePanelLoading}
        pinned={sidePanelPinned}
        onSelect={handleSidePanelSelect}
        onTogglePin={togglePinSidePanel}
        onMouseEnter={() => clearTimeout(closeTimerRef.current)}
        onMouseLeave={handleNavLeave}
      />

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          ml: !isMobile && sidePanelOpen && sidePanelPinned ? "180px" : 0,
          transition: (t) =>
            t.transitions.create("margin", {
              easing: t.transitions.easing.sharp,
              duration: t.transitions.duration.leavingScreen,
            }),
        }}
      >
        <TopBar tip={pageTip} />
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <Box
            component="main"
            sx={{
              flex: 1,
              overflow: "hidden",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            {children}
          </Box>
        </Box>
        <FabStack />
      </Box>

      {activeOverlay && (
        <DetailOverlay
          open
          type={activeOverlay.type}
          id={activeOverlay.id}
          onClose={closeOverlay}
        />
      )}
      <TourGuide />
      <GlobalSnackbar />
    </Box>
  );
}
