import { type ReactNode, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SearchIcon from "@mui/icons-material/Search";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DashboardIcon from "@mui/icons-material/Dashboard";
import BarChartIcon from "@mui/icons-material/BarChart";
import TableChartIcon from "@mui/icons-material/TableChart";
import SaveIcon from "@mui/icons-material/Save";
import CodeIcon from "@mui/icons-material/Code";
import StorageIcon from "@mui/icons-material/Storage";
import NotificationsIcon from "@mui/icons-material/Notifications";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";

import { useAuthStore } from "@/store/authStore";
import { useDrawerStore } from "@/store/drawerState";
import { useNavStore } from "@/store/navStore";
import { useMenuSettings } from "@/store/menuSettings";
import { useShortcutWithHelp } from "@/hooks/useShortcut";
import GlobalSnackbar from "@/components/GlobalSnackbar";
import ChatInput from "@/components/ChatInput";
import AiDrawer from "@/components/AiDrawer";
import TourGuide from "@/components/TourGuide";
import SearchExamples from "@/components/SearchExamples";
import { usePageTip } from "@/hooks/usePageTips";
import UserMenu from "@/components/AppLayout/UserMenu";
import StatusBar from "@/components/AppLayout/StatusBar";
import ActivityBar from "@/components/ActivityBar/ActivityBar";
import SidePanel from "@/components/SidePanel/SidePanel";
import DetailOverlay from "@/components/DetailOverlay/DetailOverlay";
import type { NavCategory } from "@/store/navStore";

const menuIconMap: Record<string, React.ReactNode> = {
  dashboards: <DashboardIcon sx={{ fontSize: 20 }} />,
  charts: <BarChartIcon sx={{ fontSize: 20 }} />,
  datasets: <TableChartIcon sx={{ fontSize: 20 }} />,
  "saved_query/list": <SaveIcon sx={{ fontSize: 20 }} />,
  sqllab: <CodeIcon sx={{ fontSize: 20 }} />,
  "database/list": <StorageIcon sx={{ fontSize: 20 }} />,
  "alert/list": <NotificationsIcon sx={{ fontSize: 20 }} />,
  query_history: <HistoryIcon sx={{ fontSize: 20 }} />,
  project_config: <SettingsIcon sx={{ fontSize: 20 }} />,
};

const defaultIcon = <SettingsIcon sx={{ fontSize: 20 }} />;

const menuIdToCategory: Record<string, NavCategory> = {
  dashboards: "dashboard",
  charts: "chart",
  datasets: "dataset",
  "saved_query/list": "saved_query",
  "database/list": "database",
};

const categoryLabels: Record<NavCategory, string> = {
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
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);

  const items = useMenuSettings((s) => s.items);
  const enabled = useMenuSettings((s) => s.enabled);

  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(
    null,
  );

  const aiDrawerOpen = useDrawerStore((s) => s.aiDrawerOpen);
  const aiDrawerMode = useDrawerStore((s) => s.aiDrawerMode);
  const insightChartId = useDrawerStore((s) => s.insightChartId);
  const insightChartMeta = useDrawerStore((s) => s.insightChartMeta);
  const insightFilters = useDrawerStore((s) => s.insightFilters);
  const openAiDrawer = useDrawerStore((s) => s.openAiDrawer);
  const closeAiDrawer = useDrawerStore((s) => s.closeAiDrawer);

  const activeCategory = useNavStore((s) => s.activeCategory);
  const sidePanelOpen = useNavStore((s) => s.sidePanelOpen);
  const sidePanelPinned = useNavStore((s) => s.sidePanelPinned);
  const sidePanelItems = useNavStore((s) => s.sidePanelItems);
  const sidePanelLoading = useNavStore((s) => s.sidePanelLoading);
  const activeOverlay = useNavStore((s) => s.activeOverlay);
  const toggleCategory = useNavStore((s) => s.toggleCategory);
  const closeSidePanel = useNavStore((s) => s.closeSidePanel);
  const togglePinSidePanel = useNavStore((s) => s.togglePinSidePanel);
  const openOverlay = useNavStore((s) => s.openOverlay);
  const closeOverlay = useNavStore((s) => s.closeOverlay);
  const selectDashboard = useNavStore((s) => s.selectDashboard);

  const [aiMenuAnchor, setAiMenuAnchor] = useState<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoverCat, setHoverCat] = useState<string | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pageTip = usePageTip();

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

  const activityBarItems = useMemo(
    () =>
      items
        .filter((item) => item.id !== "home" && enabled[item.id])
        .map((item) => ({
          id: item.id,
          icon: menuIconMap[item.id] ?? defaultIcon,
          label: item.label,
        })),
    [items, enabled],
  );

  const handleNavEnter = useCallback((cat: string) => {
    clearTimeout(closeTimerRef.current);
    setHoverCat(cat);
    const mapped = menuIdToCategory[cat];
    if (!mapped) return;
    const navStore = useNavStore.getState();
    if (navStore.sidePanelPinned) {
      if (navStore.activeCategory !== mapped) {
        navStore.toggleCategory(mapped);
      }
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
      {/* Activity Bar (D1) */}
      <Box
        onMouseEnter={() => {
          clearTimeout(closeTimerRef.current);
        }}
        onMouseLeave={() => {
          clearTimeout(openTimerRef.current);
        }}
        sx={{ flexShrink: 0 }}
      >
        <ActivityBar
          items={activityBarItems}
          activeId={hoverCat ?? activeCategory}
          onSelect={handleActivitySelect}
          onItemEnter={handleNavEnter}
          onItemLeave={() => {
            clearTimeout(openTimerRef.current);
          }}
          searchButton={
            <Tooltip title="搜索" placement="right">
              <IconButton
                size="small"
                onClick={() => setSearchOpen(true)}
                sx={{ color: "text.secondary" }}
              >
                <SearchIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          }
          aiButton={
            <Box>
              <Tooltip title="AI 助手" placement="right">
                <IconButton
                  size="small"
                  onClick={(e) => setAiMenuAnchor(e.currentTarget)}
                  sx={{
                    color: "primary.main",
                    transition: "opacity 200ms",
                  }}
                >
                  <AutoAwesomeIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={aiMenuAnchor}
                open={Boolean(aiMenuAnchor)}
                onClose={() => setAiMenuAnchor(null)}
                slotProps={{ paper: { sx: { minWidth: 140 } } }}
              >
                <MenuItem
                  onClick={() => {
                    setAiMenuAnchor(null);
                    if (aiDrawerOpen && aiDrawerMode === "assistant") {
                      closeAiDrawer();
                    } else {
                      openAiDrawer("assistant");
                    }
                  }}
                >
                  AI 助手
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setAiMenuAnchor(null);
                    navigate("/agent");
                  }}
                >
                  AI Agent
                </MenuItem>
              </Menu>
            </Box>
          }
          searchDialog={
            <Dialog
              open={searchOpen}
              onClose={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
              fullWidth
              maxWidth="sm"
              slotProps={{
                paper: {
                  sx: {
                    position: "fixed",
                    top: "20vh",
                    m: 0,
                    borderRadius: 2,
                    width: "90%",
                    maxWidth: 520,
                  },
                },
                backdrop: { sx: { bgcolor: "rgba(0,0,0,0.3)" } },
              }}
            >
              <DialogContent
                sx={{ p: 2, pt: 2.5 }}
                onClick={() => setSearchOpen(false)}
              >
                <Box onClick={(e) => e.stopPropagation()}>
                  <ChatInput
                    autoFocus
                    placeholder="询问关于数据的问题..."
                    disableMaxWidth
                    value={searchQuery}
                    onChange={setSearchQuery}
                  />
                  <SearchExamples onSelect={(q) => setSearchQuery(q)} />
                </Box>
              </DialogContent>
            </Dialog>
          }
          userMenu={
            <UserMenu
              username={user?.username}
              anchorEl={userMenuAnchor}
              onOpen={(e) => setUserMenuAnchor(e.currentTarget)}
              onClose={() => setUserMenuAnchor(null)}
              onLogout={handleLogout}
            />
          }
        />
      </Box>

      {/* Side Panel (D2) - overlays on top of main content */}
      <SidePanel
        open={
          sidePanelOpen &&
          (sidePanelPinned || activeCategory != null || hoverCat != null)
        }
        title={
          categoryLabels[activeCategory ?? menuIdToCategory[hoverCat ?? ""]] ??
          items.find((i) => i.id === (hoverCat ?? activeCategory))?.label ??
          ""
        }
        items={sidePanelItems}
        loading={sidePanelLoading}
        pinned={sidePanelPinned}
        onSelect={handleSidePanelSelect}
        onTogglePin={togglePinSidePanel}
        onMouseEnter={() => clearTimeout(closeTimerRef.current)}
        onMouseLeave={handleNavLeave}
      />

      {/* Main Content Area */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          ml: sidePanelOpen && sidePanelPinned ? "180px" : 0,
          transition: (theme) =>
            theme.transitions.create("margin", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
        }}
      >
        <StatusBar tip={pageTip} />

        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {children}
        </Box>
      </Box>

      {/* Detail Overlay */}
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
      <AiDrawer
        variant={aiDrawerMode}
        open={aiDrawerOpen}
        chartId={insightChartId}
        chartMeta={insightChartMeta}
        filters={insightFilters}
        onClose={closeAiDrawer}
      />
    </Box>
  );
}
