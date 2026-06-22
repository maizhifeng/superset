import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import HomeIcon from "@mui/icons-material/Home";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import CircleIcon from "@mui/icons-material/Circle";
import { useAuthStore } from "@/store/authStore";
import { usePiAgent } from "@/hooks/usePiAgent";

interface AgentStatusBarProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export default function AgentStatusBar({
  sidebarOpen,
  onToggleSidebar,
}: AgentStatusBarProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { isConnected } = usePiAgent();

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 1,
        py: 0.5,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Tooltip
          title={sidebarOpen ? "收起会话列表" : "展开会话列表"}
          placement="bottom"
        >
          <IconButton
            size="small"
            onClick={onToggleSidebar}
            sx={{ color: "text.secondary" }}
          >
            {sidebarOpen ? (
              <MenuOpenIcon sx={{ fontSize: 20 }} />
            ) : (
              <MenuIcon sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </Tooltip>
        <AutoAwesomeIcon sx={{ color: "primary.main", fontSize: 20 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          AI Agent
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            bgcolor: isConnected ? "success.main" : "error.main",
            color: "#fff",
            fontSize: "0.7rem",
            lineHeight: 1,
            ml: 0.5,
          }}
        >
          <CircleIcon sx={{ fontSize: 8 }} />
          {isConnected ? "已连接" : "未连接"}
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Tooltip title="返回传统模式" placement="bottom">
          <IconButton
            size="small"
            onClick={() => navigate("/")}
            sx={{ color: "text.secondary" }}
          >
            <HomeIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="用户菜单" placement="bottom">
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={{ color: "text.secondary" }}
          >
            <MoreVertIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem disabled>{user?.username ?? "未登录"}</MenuItem>
          <MenuItem onClick={handleLogout}>退出登录</MenuItem>
        </Menu>
      </Box>
    </Box>
  );
}
