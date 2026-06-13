import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import SearchIcon from "@mui/icons-material/Search";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MenuIcon from "@mui/icons-material/Menu";

import { useAuthStore } from "@/store/authStore";
import { useDrawerStore } from "@/store/drawerState";
import { useNavStore } from "@/store/navStore";
import { useToolbar } from "@/contexts/ToolbarContext";
import { useMenuSettings } from "@/store/menuSettings";
import { useShortcutWithHelp } from "@/hooks/useShortcut";
import GlobalSnackbar from "@/components/GlobalSnackbar";
import ChatInput from "@/components/ChatInput";
import AiDrawer from "@/components/AiDrawer";
import TourGuide from "@/components/TourGuide";
import ContextTip from "@/components/ContextTip";
import SearchExamples from "@/components/SearchExamples";
import { usePageTip } from "@/hooks/usePageTips";
import UserMenu from "@/components/AppLayout/UserMenu";
import MobileDrawer from "@/components/AppLayout/MobileDrawer";
import ActivityBar, {
  defaultItems as activityBarItems,
} from "@/components/ActivityBar/ActivityBar";
import SidePanel from "@/components/SidePanel/SidePanel";
import DetailOverlay from "@/components/DetailOverlay/DetailOverlay";
import type { NavCategory } from "@/store/navStore";

const categoryLabels: Record<NavCategory, string> = {
  dashboard: "仪表板",
  chart: "图表",
  dataset: "数据集",
  saved_query: "已保存查询",
  sqllab: "SQL 实验室",
  settings: "设置",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);

  const items = useMenuSettings((s) => s.items);
  const enabled = useMenuSettings((s) => s.enabled);
  const toolbarTools = useToolbar();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setSidebarOpen(document.body.classList.contains("sidebar-open")),
    );
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    setSidebarOpen(document.body.classList.contains("sidebar-open"));
    return () => observer.disconnect();
  }, []);

  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const aiDrawerOpen = useDrawerStore((s) => s.aiDrawerOpen);
  const drawerWidth = useDrawerStore((s) => s.drawerWidth);
  const aiDrawerMode = useDrawerStore((s) => s.aiDrawerMode);
  const insightChartId = useDrawerStore((s) => s.insightChartId);
  const insightChartMeta = useDrawerStore((s) => s.insightChartMeta);
  const insightFilters = useDrawerStore((s) => s.insightFilters);
  const openAiDrawer = useDrawerStore((s) => s.openAiDrawer);
  const closeAiDrawer = useDrawerStore((s) => s.closeAiDrawer);

  const activeCategory = useNavStore((s) => s.activeCategory);
  const sidePanelOpen = useNavStore((s) => s.sidePanelOpen);
  const sidePanelItems = useNavStore((s) => s.sidePanelItems);
  const sidePanelLoading = useNavStore((s) => s.sidePanelLoading);
  const activeOverlay = useNavStore((s) => s.activeOverlay);
  const toggleCategory = useNavStore((s) => s.toggleCategory);
  const closeSidePanel = useNavStore((s) => s.closeSidePanel);
  const openOverlay = useNavStore((s) => s.openOverlay);
  const closeOverlay = useNavStore((s) => s.closeOverlay);
  const selectDashboard = useNavStore((s) => s.selectDashboard);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoverCat, setHoverCat] = useState<NavCategory | null>(null);
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

  const navItems = useMemo(
    () => items.filter((item) => item.id !== "home" && enabled[item.id]),
    [items, enabled],
  );

  const handleNavEnter = useCallback((cat: NavCategory) => {
    clearTimeout(closeTimerRef.current);
    setHoverCat(cat);
    openTimerRef.current = setTimeout(() => {
      if (cat !== "sqllab" && cat !== "settings") {
        const navStore = useNavStore.getState();
        if (!navStore.sidePanelOpen || navStore.activeCategory !== cat) {
          navStore.toggleCategory(cat);
        }
      }
    }, 150);
  }, []);

  const handleNavLeave = useCallback(() => {
    clearTimeout(openTimerRef.current);
    setHoverCat(null);
    closeTimerRef.current = setTimeout(() => {
      useNavStore.getState().closeSidePanel();
    }, 800);
  }, []);

  const handleActivitySelect = useCallback(
    async (cat: NavCategory) => {
      if (cat === "sqllab") {
        openOverlay("sqllab");
        closeSidePanel();
        return;
      }
      if (cat === "settings") {
        navigate("/settings");
        closeSidePanel();
        return;
      }
      await toggleCategory(cat);
    },
    [toggleCategory, openOverlay, closeSidePanel, navigate],
  );

  const handleSidePanelSelect = useCallback(
    (id: number | string) => {
      if (activeCategory === "dashboard") {
        selectDashboard(Number(id));
        navigate(`/dashboard/${id}`);
        closeSidePanel();
      } else if (activeCategory === "sqllab") {
        openOverlay("sqllab");
      } else if (activeCategory === "settings") {
        navigate("/settings");
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
        />
      </Box>

      {/* Side Panel (D2) - overlays on top of main content */}
      <SidePanel
        open={sidePanelOpen && (activeCategory != null || hoverCat != null)}
        title={categoryLabels[activeCategory ?? (hoverCat as NavCategory)] || ""}
        items={sidePanelItems}
        loading={sidePanelLoading}
        onSelect={handleSidePanelSelect}
        onClose={closeSidePanel}
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
        }}
      >
        <AppBar
          position="static"
          color="inherit"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            visibility: sidebarOpen ? "hidden" : "visible",
            pointerEvents: sidebarOpen ? "none" : "auto",
          }}
        >
          <Toolbar variant="dense" sx={{ gap: 0, px: 0.5, minHeight: 44 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0,
                flex: "1 1 0",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <IconButton
                size="small"
                onClick={() => setDrawerOpen(true)}
                sx={{
                  display: { xs: "inline-flex", sm: "none" },
                  mr: 0.25,
                  flexShrink: 0,
                }}
              >
                <MenuIcon sx={{ fontSize: 20 }} />
              </IconButton>
              <Typography
                variant="h6"
                onClick={() => navigate("/")}
                sx={{
                  fontWeight: 700,
                  cursor: "pointer",
                  mr: 0.5,
                  fontSize: "1rem",
                  letterSpacing: "-0.01em",
                  flexShrink: 0,
                }}
              >
                starfly
              </Typography>
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                minWidth: 0,
                flex: "1 1 0",
                justifyContent: "flex-end",
              }}
            >
              <Box sx={{ flex: 1 }} />
              <Box
                sx={{
                  display: { xs: "none", md: "flex" },
                  justifyContent: "center",
                  overflow: "hidden",
                  minWidth: 0,
                  maxWidth: 300,
                }}
              >
                {toolbarTools
                  .filter((t) => t.id === "search")
                  .map((tool) => (
                    <Box key={tool.id} sx={{ width: "100%" }}>
                      {tool.render}
                    </Box>
                  ))}
              </Box>
              <IconButton
                size="small"
                onClick={() => setSearchOpen(true)}
                sx={{ display: { xs: "inline-flex", md: "none" } }}
              >
                <SearchIcon sx={{ fontSize: 20 }} />
              </IconButton>
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
              <IconButton
                size="small"
                onClick={() => {
                  if (aiDrawerOpen && aiDrawerMode === "assistant") {
                    closeAiDrawer();
                  } else {
                    openAiDrawer("assistant");
                  }
                }}
                sx={{
                  color: "primary.main",
                  mr: 0.5,
                  transition: "opacity 200ms",
                  opacity: aiDrawerOpen && aiDrawerMode === "assistant" ? 0.6 : 1,
                }}
              >
                <AutoAwesomeIcon sx={{ fontSize: 20 }} />
              </IconButton>
              <UserMenu
                username={user?.username}
                anchorEl={userMenuAnchor}
                onOpen={(e) => setUserMenuAnchor(e.currentTarget)}
                onClose={() => setUserMenuAnchor(null)}
                onLogout={handleLogout}
              />
            </Box>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            mr: aiDrawerOpen ? `${drawerWidth}px` : 0,
            transition: (theme) =>
              theme.transitions.create("margin", {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
          }}
        >
          {pageTip && <ContextTip tip={pageTip} />}
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
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={navItems}
        enabled={enabled}
        isActive={(path: string) =>
          path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)
        }
        username={user?.username}
        onLogout={logout}
      />
    </Box>
  );
}
