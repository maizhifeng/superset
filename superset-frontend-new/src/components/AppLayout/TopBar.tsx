import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import TipsAndUpdatesIcon from "@mui/icons-material/TipsAndUpdates";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import LinkIcon from "@mui/icons-material/Link";
import { keyframes } from "@mui/system";
import { useToolbar } from "@/store/toolbarStore";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useNotificationStore } from "@/store/notificationStore";
import AppBreadcrumbs from "@/components/AppLayout/AppBreadcrumbs";
import { knownSections, type CrumbItem } from "./config";
import type { PageTip } from "@/hooks/usePageTips";

const scrollAnimation = keyframes`
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
`;

function useSection(pathname: string) {
  return useMemo(() => {
    for (const key of Object.keys(knownSections)) {
      const { listPath } = knownSections[key];
      const prefix = listPath.endsWith("/list")
        ? listPath.slice(0, -"/list".length)
        : listPath;
      if (pathname === listPath || pathname === prefix) {
        return knownSections[key];
      }
      if (pathname.startsWith(`${prefix}/`)) {
        return knownSections[key];
      }
    }
    return null;
  }, [pathname]);
}

export default function TopBar({ tip }: { tip: PageTip | null }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tools = useToolbar();
  const custom = useBreadcrumbStore((s) => s.custom);
  const section = useSection(pathname);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 浏览器全屏切换，便于演示/专注浏览仪表板等。
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  };

  // 监听浏览器全屏状态变化，保持按钮图标同步。
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const notify = useNotificationStore((s) => s.notify);
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify({ severity: "success", message: "已复制当前链接" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  const crumbItems: CrumbItem[] = useMemo(() => {
    const items: CrumbItem[] = [
      { label: "首页", path: "/", isId: false },
    ];
    if (section) {
      items.push({ label: section.label, path: section.listPath, isId: false });
    }
    if (custom) {
      items.push({ label: custom.label, path: pathname, isId: true });
    }
    return items;
  }, [section, custom, pathname]);

  const tipText = tip ? `${tip.title} — ${tip.message}` : "";

  return (
    <Box
      sx={{
        height: 44,
        display: "flex",
        alignItems: "center",
        bgcolor: "bg.header",
        borderBottom: "1px solid",
        borderColor: "divider",
        px: 1.5,
        gap: 1,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <AppBreadcrumbs
          items={crumbItems}
          customLabel={custom?.label}
          customStatus={custom?.status}
          onCrumbClick={(crumb) => navigate(crumb.path)}
        />
        {custom?.actions && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {custom.actions}
          </Box>
        )}
      </Box>

      {!isMobile && tipText && (
        <Box
          sx={{
            flex: 1,
            overflow: "hidden",
            position: "relative",
            height: "100%",
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            mx: 0.5,
          }}
        >
          <TipsAndUpdatesIcon
            sx={{
              fontSize: 14,
              flexShrink: 0,
              color: "primary.main",
              opacity: 0.8,
              mr: 0.5,
            }}
          />
          <Box
            sx={{
              flex: 1,
              overflow: "hidden",
              position: "relative",
              height: "100%",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                display: "flex",
                whiteSpace: "nowrap",
                animation: `${scrollAnimation} ${Math.max(tipText.length * 0.08, 10)}s linear infinite`,
                fontSize: "0.75rem",
                color: "text.secondary",
                gap: 4,
              }}
            >
              <Box component="span">{tipText}</Box>
              <Box component="span">{tipText}</Box>
            </Box>
          </Box>
        </Box>
      )}

      {!isMobile && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            ml: "auto",
            flexShrink: 0,
          }}
        >
          <Tooltip title="复制当前链接">
            <IconButton
              size="small"
              onClick={() => void handleCopyLink()}
              aria-label="复制当前链接"
            >
              <LinkIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
            <IconButton
              size="small"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "退出全屏" : "全屏"}
            >
              {isFullscreen ? (
                <FullscreenExitIcon sx={{ fontSize: 20 }} />
              ) : (
                <FullscreenIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
          </Tooltip>
          {tools.map((tool) => {
            if (tool.render != null) {
              return <Box key={tool.id}>{tool.render}</Box>;
            }
            if (tool.fabIcon) {
              return (
                <Tooltip key={tool.id} title={tool.fabLabel ?? ""}>
                  <IconButton
                    size="small"
                    aria-label={tool.fabLabel}
                    onClick={tool.action}
                    sx={{
                      bgcolor: "primary.container",
                      color: "primary.onContainer",
                      "&:hover": { bgcolor: "primary.light" },
                    }}
                  >
                    {tool.fabIcon}
                  </IconButton>
                </Tooltip>
              );
            }
            return null;
          })}
        </Box>
      )}
    </Box>
  );
}
