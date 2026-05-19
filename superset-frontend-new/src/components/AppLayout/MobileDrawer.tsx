import { Link as RouterLink, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Logout from "@mui/icons-material/Logout";
import SettingsIcon from "@mui/icons-material/Settings";

interface NavItem {
  id: string;
  label: string;
  path: string;
}

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  enabled: Record<string, boolean>;
  isActive: (path: string) => boolean;
  username?: string;
  onLogout: () => void;
}

export default function MobileDrawer({
  open,
  onClose,
  items,
  enabled,
  isActive,
  username,
  onLogout,
}: MobileDrawerProps) {
  const navigate = useNavigate();

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      sx={{ display: { xs: "block", sm: "none" } }}
      slotProps={{ paper: { sx: { width: { xs: "80vw", sm: 260 } } } }}
    >
      <Box
        sx={{
          width: { xs: "30vw", sm: 260 },
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <Box
          sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: "1.125rem" }}>
            starfly
          </Typography>
        </Box>
        <List sx={{ flex: 1, overflow: "auto" }}>
          {items
            .filter((item) => item.id !== "home" && enabled[item.id])
            .map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  component={RouterLink}
                  to={item.path}
                  selected={isActive(item.path)}
                  onClick={onClose}
                  sx={{
                    "&.Mui-selected": { bgcolor: "action.selected" },
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <ListItemText
                    primary={item.label}
                    slotProps={{
                      primary: {
                        sx: {
                          fontSize: "0.875rem",
                          fontWeight: isActive(item.path) ? 600 : 400,
                        },
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
        </List>
        <Divider />
        <Box sx={{ px: 2, py: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Avatar
              sx={{
                width: 28,
                height: 28,
                fontSize: "0.75rem",
                bgcolor: "primary.main",
              }}
            >
              {username?.charAt(0).toUpperCase() || "U"}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
              >
                {username || "User"}
              </Typography>
            </Box>
          </Box>
          <ListItemButton
            onClick={() => {
              navigate("/settings");
              onClose();
            }}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <SettingsIcon
              sx={{ fontSize: 18, mr: 1, color: "text.secondary" }}
            />
            <ListItemText
              primary="Settings"
              slotProps={{ primary: { sx: { fontSize: "0.8125rem" } } }}
            />
          </ListItemButton>
          <ListItemButton onClick={onLogout} sx={{ borderRadius: 1 }}>
            <Logout sx={{ fontSize: 18, mr: 1, color: "text.secondary" }} />
            <ListItemText
              primary="Logout"
              slotProps={{ primary: { sx: { fontSize: "0.8125rem" } } }}
            />
          </ListItemButton>
        </Box>
      </Box>
    </Drawer>
  );
}
