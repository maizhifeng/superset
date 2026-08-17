import Avatar from "@mui/material/Avatar";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Logout from "@mui/icons-material/Logout";
import PaletteIcon from "@mui/icons-material/Palette";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DensityMediumIcon from "@mui/icons-material/DensityMedium";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import { useThemeStore } from "@/store/themeStore";
import { useHelpModalStore } from "@/store/helpModal";
import {
  useUiPreferences,
  type GridDensity,
} from "@/store/uiPreferences";

const DENSITY_CYCLE: GridDensity[] = ["compact", "standard", "comfortable"];
const DENSITY_LABEL: Record<GridDensity, string> = {
  compact: "紧凑",
  standard: "标准",
  comfortable: "舒适",
};

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
  const themeMode = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const gridDensity = useUiPreferences((s) => s.gridDensity);
  const setGridDensity = useUiPreferences((s) => s.setGridDensity);
  const openHelp = useHelpModalStore((s) => s.openHelp);

  const cycleDensity = () => {
    const idx = DENSITY_CYCLE.indexOf(gridDensity);
    setGridDensity(DENSITY_CYCLE[(idx + 1) % DENSITY_CYCLE.length]);
  };

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
        <MenuItem dense onClick={toggleTheme} sx={{ fontSize: "0.8125rem" }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <PaletteIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText>
            切换至: {themeMode === "paper" ? "Notion" : "纸本"}
          </ListItemText>
        </MenuItem>
        <MenuItem dense onClick={cycleDensity} sx={{ fontSize: "0.8125rem" }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <DensityMediumIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText>表格密度: {DENSITY_LABEL[gridDensity]}</ListItemText>
        </MenuItem>
        <MenuItem dense onClick={openHelp} sx={{ fontSize: "0.8125rem" }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            <KeyboardIcon sx={{ fontSize: 18 }} />
          </ListItemIcon>
          <ListItemText>键盘快捷键</ListItemText>
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
