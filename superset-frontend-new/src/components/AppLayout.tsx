import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Grow from "@mui/material/Grow";
import SearchIcon from "@mui/icons-material/Search";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import MenuItem from "@mui/material/MenuItem";
import Menu from "@mui/material/Menu";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MenuIcon from "@mui/icons-material/Menu";

import { useAuthStore } from "@/store/authStore";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useDrawerStore } from "@/store/drawerState";
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
import AppNavBar from "@/components/AppLayout/AppNavBar";
import AppBreadcrumbs from "@/components/AppLayout/AppBreadcrumbs";
import UserMenu from "@/components/AppLayout/UserMenu";
import MobileDrawer from "@/components/AppLayout/MobileDrawer";
import { type CrumbItem, knownSections } from "@/components/AppLayout/config";
import { toolFadeIn } from "@/theme/keyframes";
import api from "@/api";

export default function AppLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);
  const [crumbAnchorEl, setCrumbAnchorEl] = useState<HTMLElement | null>(null);
  const [crumbOptions, setCrumbOptions] = useState<
    { label: string; path: string }[]
  >([]);
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({});
  const breadcrumbCustom = useBreadcrumbStore((s) => s.custom);
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
  const items = useMenuSettings((s) => s.items);
  const enabled = useMenuSettings((s) => s.enabled);
  const [toolOverflowAnchor, setToolOverflowAnchor] =
    useState<HTMLElement | null>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const aiDrawerOpen = useDrawerStore((s) => s.aiDrawerOpen);
  const drawerWidth = useDrawerStore((s) => s.drawerWidth);
  const aiDrawerMode = useDrawerStore((s) => s.aiDrawerMode);
  const insightChartId = useDrawerStore((s) => s.insightChartId);
  const insightChartMeta = useDrawerStore((s) => s.insightChartMeta);
  const insightFilters = useDrawerStore((s) => s.insightFilters);
  const openAiDrawer = useDrawerStore((s) => s.openAiDrawer);
  const closeAiDrawer = useDrawerStore((s) => s.closeAiDrawer);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  useEffect(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return;
    const parentKey = parts[parts.length - 2];
    const lastPart = parts[parts.length - 1];
    if (!/^\d+$/.test(lastPart) || !knownSections[parentKey]) return;
    const id = lastPart;
    api
      .get(`/${parentKey}/${id}`)
      .then((res) => {
        const data = res.data?.result as Record<string, unknown> | undefined;
        if (!data) return;
        const nameField =
          parentKey === "dashboard"
            ? "dashboard_title"
            : parentKey === "chart"
              ? "slice_name"
              : parentKey === "dataset"
                ? "table_name"
                : parentKey === "saved_query"
                  ? "label"
                  : parentKey === "explore"
                    ? "slice_name"
                    : null;
        if (nameField) {
          const name = data[nameField];
          if (name) setItemLabels((prev) => ({ ...prev, [id]: String(name) }));
        }
      })
      .catch(() => {});
  }, [location.pathname]);

  const navItems = useMemo(
    () => items.filter((item) => item.id !== "home" && enabled[item.id]),
    [items, enabled],
  );

  function isActive(path: string) {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  }

  const breadcrumbItems = useMemo((): CrumbItem[] => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return [];
    const crumbs: CrumbItem[] = [];
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc += `/${part}`;
      const isNumeric = /^\d+$/.test(part);
      if (isNumeric && i > 0 && knownSections[parts[i - 1]]) {
        const resolved = itemLabels[part];
        crumbs.push({ label: resolved || `#${part}`, path: acc, isId: true });
      } else if (knownSections[part]) {
        crumbs.push({
          label: knownSections[part].label,
          path: acc,
          isId: false,
        });
      } else {
        const label =
          part.charAt(0).toUpperCase() + part.slice(1).replace(/[_-]/g, " ");
        crumbs.push({ label, path: acc, isId: false });
      }
    }
    return crumbs;
  }, [location.pathname, itemLabels]);

  const handleCrumbClick = useCallback(
    async (crumb: CrumbItem, e: React.MouseEvent<HTMLElement>) => {
      if (crumb.isId) {
        const target = e.currentTarget;
        const parentKey = location.pathname
          .split("/")
          .filter(Boolean)
          .slice(-2, -1)[0];
        const section = parentKey && knownSections[parentKey];
        if (section) {
          try {
            const res = await api.get(
              `/${parentKey}/?q=(page_size:200,page:0)`,
            );
            const itemsList = (res.data?.result ?? []) as Record<
              string,
              unknown
            >[];
            const nameField = section.listPath.includes("dashboard")
              ? "dashboard_title"
              : section.listPath.includes("chart")
                ? "slice_name"
                : section.listPath.includes("dataset")
                  ? "table_name"
                  : section.listPath.includes("saved_query")
                    ? "label"
                    : null;
            setCrumbOptions(
              itemsList.map((item: Record<string, unknown>) => ({
                label: String(
                  nameField && item[nameField]
                    ? item[nameField]
                    : (item.id ?? ""),
                ),
                path: `/${parentKey}/${item.id}`,
              })),
            );
          } catch {
            setCrumbOptions([]);
          }
        }
        setCrumbAnchorEl(target);
      }
    },
    [location.pathname],
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        bgcolor: "background.default",
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
            <Box
              sx={{
                "@media (max-width: 600px)": {
                  display: "none",
                },
              }}
            >
              <AppNavBar navItems={navItems} isActive={isActive} />
            </Box>
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
            <AppBreadcrumbs
              items={breadcrumbItems}
              customStatus={breadcrumbCustom?.status}
              customLabel={breadcrumbCustom?.label}
              onCrumbClick={handleCrumbClick}
            />
            {toolbarTools.filter(
              (t) => t.id !== "search" && !t.primary && t.render,
            ).length > 0 && (
              <Box
                sx={{
                  display: { xs: "none", sm: "flex" },
                  alignItems: "center",
                  gap: 0.75,
                  px: 0.5,
                  overflow: "hidden",
                  minWidth: 0,
                }}
              >
                {toolbarTools
                  .filter((t) => t.id !== "search" && !t.primary && t.render)
                  .slice(0, 3)
                  .map((tool, i) => (
                    <Box
                      key={tool.id}
                      sx={{
                        display: "block",
                        animation: `${toolFadeIn} 250ms cubic-bezier(0.4, 0, 0.2, 1) both`,
                        animationDelay: `${i * 50}ms`,
                      }}
                    >
                      {tool.render}
                    </Box>
                  ))}
                {toolbarTools.filter(
                  (t) => t.id !== "search" && !t.primary && t.render,
                ).length > 3 && (
                  <IconButton
                    size="small"
                    onClick={(e) => setToolOverflowAnchor(e.currentTarget)}
                    sx={{
                      transition:
                        "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
                      transform: Boolean(toolOverflowAnchor)
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                    }}
                  >
                    <MoreHorizIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                )}
                <Menu
                  anchorEl={toolOverflowAnchor}
                  open={Boolean(toolOverflowAnchor)}
                  onClose={() => setToolOverflowAnchor(null)}
                  onClick={() => setToolOverflowAnchor(null)}
                  slots={{ transition: Grow }}
                  slotProps={{
                    transition: { timeout: 250 },
                    paper: {
                      sx: {
                        minWidth: 160,
                        overflow: "visible",
                        filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.16))",
                        mt: 0.75,
                        "&::before": {
                          content: '""',
                          display: "block",
                          position: "absolute",
                          top: 0,
                          right: 18,
                          width: 10,
                          height: 10,
                          bgcolor: "background.paper",
                          transform: "translateY(-50%) rotate(45deg)",
                          zIndex: 0,
                        },
                      },
                    },
                  }}
                  transformOrigin={{ horizontal: "right", vertical: "top" }}
                  anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                >
                  {toolbarTools
                    .filter((t) => t.id !== "search" && !t.primary && t.render)
                    .slice(3)
                    .map((tool) => (
                      <MenuItem
                        key={tool.id}
                        dense
                        sx={{ fontSize: "0.8125rem", minHeight: 36 }}
                      >
                        {tool.render}
                      </MenuItem>
                    ))}
                </Menu>
              </Box>
            )}
            <UserMenu
              username={user?.username}
              anchorEl={userMenuAnchor}
              onOpen={(e) => setUserMenuAnchor(e.currentTarget)}
              onClose={() => setUserMenuAnchor(null)}
              onLogout={handleLogout}
            />
            <Menu
              anchorEl={crumbAnchorEl}
              open={Boolean(crumbAnchorEl)}
              onClose={() => setCrumbAnchorEl(null)}
              onClick={() => setCrumbAnchorEl(null)}
              slotProps={{ paper: { sx: { maxHeight: 300 } } }}
            >
              {crumbOptions.map((opt) => (
                <MenuItem
                  key={opt.path}
                  onClick={() => navigate(opt.path)}
                  selected={location.pathname === opt.path}
                >
                  {opt.label}
                </MenuItem>
              ))}
            </Menu>
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
        items={items}
        enabled={enabled}
        isActive={isActive}
        username={user?.username}
        onLogout={logout}
      />
    </Box>
  );
}
