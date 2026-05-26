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
import { useThemeStore } from "@/store/themeStore";

interface UserMenuProps {
  username?: string;
  anchorEl: HTMLElement | null;
  onOpen: (e: React.MouseEvent<HTMLElement>) => void;
  onClose: () => void;
  onLogout: () => void;
}

export default function UserMenu({
  username,
  anchorEl,
  onOpen,
  onClose,
  onLogout,
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
        <MenuItem
          dense
          onClick={toggleTheme}
          sx={{ fontSize: "0.8125rem" }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <PaletteIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText>
            主题: {themeMode === "paper" ? "纸本" : "缤纷"}
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
