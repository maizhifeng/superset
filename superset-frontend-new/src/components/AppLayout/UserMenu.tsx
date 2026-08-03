import { useNavigate } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Logout from "@mui/icons-material/Logout";
import SettingsIcon from "@mui/icons-material/Settings";
import PaletteIcon from "@mui/icons-material/Palette";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { useThemeStore } from "@/store/themeStore";

interface UserMenuProps {
  username?: string;
  anchorEl: HTMLElement | null;
  onOpen: (e: React.MouseEvent<HTMLElement>) => void;
  onClose: () => void;
  onLogout: () => void;
  isSwitchedUser?: boolean;
  onSwitchBack?: () => void;
}

export default function UserMenu({
  username,
  anchorEl,
  onOpen,
  onClose,
  onLogout,
  isSwitchedUser,
  onSwitchBack,
}: UserMenuProps) {
  const navigate = useNavigate();
  const themeMode = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <>
      <IconButton
        size="small"
        onClick={onOpen}
        sx={{ display: { xs: "none", sm: "inline-flex" } }}
      >
        <Avatar
          sx={{
            width: 26,
            height: 26,
            fontSize: "0.75rem",
            bgcolor: "primary.main",
          }}
        >
          {username?.charAt(0).toUpperCase() || "U"}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={onClose}
        onClick={onClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        <MenuItem
          dense
          disabled
          sx={{ fontSize: "0.8125rem", opacity: "1 !important" }}
        >
          {username || "User"}
        </MenuItem>
        {isSwitchedUser && (
          <MenuItem
            dense
            onClick={() => {
              onClose();
              onSwitchBack?.();
            }}
            sx={{ fontSize: "0.8125rem", color: "warning.main" }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <SwapHorizIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            切换回管理员
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          dense
          onClick={() => navigate("/settings")}
          sx={{ fontSize: "0.8125rem" }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <SettingsIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          设置
        </MenuItem>
        <MenuItem dense onClick={toggleTheme} sx={{ fontSize: "0.8125rem" }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <PaletteIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText>
            切换至: {themeMode === "paper" ? "Notion" : "纸本"}
          </ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem dense onClick={onLogout} sx={{ fontSize: "0.8125rem" }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <Logout sx={{ fontSize: 18 }} />
          </ListItemIcon>
          退出登录
        </MenuItem>
      </Menu>
    </>
  );
}
