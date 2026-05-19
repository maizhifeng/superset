import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

interface NavItem {
  id: string;
  label: string;
  path: string;
}

interface AppNavBarProps {
  navItems: NavItem[];
  isActive: (path: string) => boolean;
}

export default function AppNavBar({ navItems, isActive }: AppNavBarProps) {
  const activeIndex = useMemo(() => {
    const i = navItems.findIndex((item) => isActive(item.path));
    return i >= 0 ? i : false;
  }, [navItems, isActive]);

  if (navItems.length === 0) return null;

  return (
    <Tabs
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      value={activeIndex}
      sx={{
        minHeight: 0,
        flex: 1,
        "& .MuiTabs-scrollButtons": { width: 24 },
        "& .MuiTabs-indicator": { height: 2 },
      }}
    >
      {navItems.map((item) => (
        <Tab
          key={item.id}
          label={item.label}
          component={RouterLink}
          to={item.path}
          sx={{
            minHeight: 0,
            py: 0.375,
            px: 0.75,
            minWidth: "auto",
            flex: "none",
            fontSize: "0.8125rem",
            fontWeight: isActive(item.path) ? 600 : 400,
            textTransform: "none",
            color: isActive(item.path) ? "primary.main" : "text.secondary",
            "&:hover": { bgcolor: "action.hover", color: "text.primary" },
          }}
        />
      ))}
    </Tabs>
  );
}
