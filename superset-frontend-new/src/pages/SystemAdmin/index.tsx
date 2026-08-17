import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Settings from "@/pages/Settings";
import AdminUsers from "@/pages/AdminUsers";
import AdminRoles from "@/pages/AdminRoles";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";

type SystemAdminTab = "menu" | "users" | "roles";

const TAB_INDEX: Record<SystemAdminTab, number> = {
  menu: 0,
  users: 1,
  roles: 2,
};

const TAB_ORDER: SystemAdminTab[] = ["menu", "users", "roles"];

const TAB_LABELS: Record<SystemAdminTab, string> = {
  menu: "系统菜单",
  users: "用户管理",
  roles: "角色管理",
};

function tabFromParam(raw: string | null): SystemAdminTab {
  return raw === "users" || raw === "roles" || raw === "menu"
    ? raw
    : "menu";
}

/**
 * 系统管理页：集中管理系统菜单、用户管理、角色管理。
 * 通过 URL 的 ?tab=menu|users|roles 控制当前标签，便于旧路径重定向。
 */
export default function SystemAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SystemAdminTab>(() =>
    tabFromParam(searchParams.get("tab")),
  );
  const setCustom = useBreadcrumbStore((s) => s.setCustom);

  // 面包屑显示当前管理子模块，便于定位与返回。
  useEffect(() => {
    setCustom({ label: TAB_LABELS[tab] });
    return () => setCustom(null);
  }, [tab, setCustom]);

  const handleChange = (_: unknown, value: number) => {
    const next = TAB_ORDER[value] ?? "menu";
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        height: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 3,
          pt: 2,
          pb: 0,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.default",
        }}
      >
        <Tabs
          value={TAB_INDEX[tab]}
          onChange={handleChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 0 }}
        >
          <Tab label="系统菜单" sx={{ minHeight: 0, py: 1.25 }} />
          <Tab label="用户管理" sx={{ minHeight: 0, py: 1.25 }} />
          <Tab label="角色管理" sx={{ minHeight: 0, py: 1.25 }} />
        </Tabs>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          flex: 1,
          minHeight: 0,
        }}
      >
        {tab === "menu" && (
          <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <Settings />
          </Box>
        )}
        {tab === "users" && <AdminUsers />}
        {tab === "roles" && <AdminRoles />}
      </Box>
    </Box>
  );
}
