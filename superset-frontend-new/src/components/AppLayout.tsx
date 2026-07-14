import { type ReactNode, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import SearchIcon from "@mui/icons-material/Search";
import { useAuthStore } from "@/store/authStore";
import { useDrawerStore } from "@/store/drawerState";
import { useNavStore } from "@/store/navStore";
import { useShortcutWithHelp } from "@/hooks/useShortcut";
import { usePageTip } from "@/hooks/usePageTips";
import GlobalSnackbar from "@/components/GlobalSnackbar";
import AiDrawer from "@/components/AiDrawer";
import TourGuide from "@/components/TourGuide";
import UserMenu from "@/components/AppLayout/UserMenu";
import StatusBar from "@/components/AppLayout/StatusBar";
import ActivityBar from "@/components/ActivityBar/ActivityBar";
import SidePanel from "@/components/SidePanel/SidePanel";
import DetailOverlay from "@/components/DetailOverlay/DetailOverlay";
import SearchOverlay from "@/components/AppLayout/SearchOverlay";
import AiMenu from "@/components/AppLayout/AiMenu";
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

  const aiDrawerOpen = useDrawerStore((s) => s.aiDrawerOpen);
  const aiDrawerMode = useDrawerStore((s) => s.aiDrawerMode);
  const insightChartId = useDrawerStore((s) => s.insightChartId);
  const insightChartMeta = useDrawerStore((s) => s.insightChartMeta);
  const insightFilters = useDrawerStore((s) => s.insightFilters);
  const closeAiDrawer = useDrawerStore((s) => s.closeAiDrawer);

  const activeOverlay = useNavStore((s) => s.activeOverlay);
  const closeOverlay = useNavStore((s) => s.closeOverlay);

  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const pageTip = usePageTip();

  const {
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
    handleNavEnter,
    handleNavLeave,
    handleActivitySelect,
    handleSidePanelSelect,
  } = useNavManager();

  useShortcutWithHelp("/", (e) => { e.preventDefault(); setSearchOpen((prev) => !prev); }, {
    label: "搜索",
    category: "global",
    description: "按 / 搜索仪表板、图表、数据集等",
  });

  const handleLogout = useCallback(() => { logout(); navigate("/login"); }, [logout, navigate]);

  const sidePanelTitle =
    categoryLabels[activeCategory ?? ""] ??
    activityBarItems.find((i) => i.id === (hoverCat ?? activeCategory))?.label ?? "";

  return (
    <Box sx={{ position: "relative", display: "flex", flexDirection: "row", height: "100vh", bgcolor: "background.default", overflow: "hidden" }}>
      <Box
        onMouseEnter={() => clearTimeout(closeTimerRef.current)}
        onMouseLeave={() => clearTimeout(openTimerRef.current)}
        sx={{ flexShrink: 0 }}
      >
        <ActivityBar
          items={activityBarItems}
          activeId={hoverCat ?? activeCategory}
          onSelect={handleActivitySelect}
          onItemEnter={handleNavEnter}
          onItemLeave={() => clearTimeout(openTimerRef.current)}
          searchButton={
            <Tooltip title="搜索" placement="right">
              <IconButton size="small" onClick={() => setSearchOpen(true)} sx={{ color: "text.secondary" }}>
                <SearchIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          }
          aiButton={<AiMenu />}
          searchDialog={
            <SearchOverlay
              open={searchOpen}
              query={searchQuery}
              onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
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
              onSwitchBack={async () => { await switchBackToAdmin(); navigate("/"); }}
            />
          }
        />
      </Box>

      <SidePanel
        open={sidePanelOpen && (sidePanelPinned || activeCategory != null || hoverCat != null)}
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
          display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden",
          ml: sidePanelOpen && sidePanelPinned ? "180px" : 0,
          transition: (t) => t.transitions.create("margin", { easing: t.transitions.easing.sharp, duration: t.transitions.duration.leavingScreen }),
        }}
      >
        <StatusBar tip={pageTip} />
        <Box sx={{ display: "flex", flexDirection: "row", flex: 1, overflow: "hidden", minHeight: 0 }}>
          <Box component="main" sx={{ flex: 1, overflow: "hidden", minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
            {children}
          </Box>
          <AiDrawer variant={aiDrawerMode} open={aiDrawerOpen} chartId={insightChartId} chartMeta={insightChartMeta} filters={insightFilters} onClose={closeAiDrawer} />
        </Box>
      </Box>

      {activeOverlay && <DetailOverlay open type={activeOverlay.type} id={activeOverlay.id} onClose={closeOverlay} />}
      <TourGuide />
      <GlobalSnackbar />
    </Box>
  );
}
