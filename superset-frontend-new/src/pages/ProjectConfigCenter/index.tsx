import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import ProjectConfig from "@/pages/ProjectConfig";
import ChannelConfig from "@/pages/ChannelConfig";
import ProfitSharingConfig from "@/pages/ProfitSharingConfig";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";

type ProjectConfigTab = "game" | "channel" | "profit-sharing";

const TAB_INDEX: Record<ProjectConfigTab, number> = {
  game: 0,
  channel: 1,
  "profit-sharing": 2,
};

const TAB_ORDER: ProjectConfigTab[] = ["game", "channel", "profit-sharing"];

const TAB_LABELS: Record<ProjectConfigTab, string> = {
  game: "游戏配置",
  channel: "渠道商配置",
  "profit-sharing": "分成配置",
};

function tabFromParam(raw: string | null): ProjectConfigTab {
  return raw === "channel" ||
    raw === "profit-sharing" ||
    raw === "game"
    ? raw
    : "game";
}

/**
 * 项目配置页：集中管理游戏配置、渠道商配置、分成配置。
 * 通过 URL 的 ?tab=game|channel|profit-sharing 控制当前标签，便于旧路径重定向。
 */
export default function ProjectConfigCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<ProjectConfigTab>(() =>
    tabFromParam(searchParams.get("tab")),
  );
  const setCustom = useBreadcrumbStore((s) => s.setCustom);

  // 面包屑显示当前配置子模块，便于定位与返回。
  useEffect(() => {
    setCustom({ label: TAB_LABELS[tab] });
    return () => setCustom(null);
  }, [tab, setCustom]);

  const handleChange = (_: unknown, value: number) => {
    const next = TAB_ORDER[value] ?? "game";
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
          <Tab label="游戏配置" sx={{ minHeight: 0, py: 1.25 }} />
          <Tab label="渠道商配置" sx={{ minHeight: 0, py: 1.25 }} />
          <Tab label="分成配置" sx={{ minHeight: 0, py: 1.25 }} />
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
        {tab === "game" && <ProjectConfig />}
        {tab === "channel" && <ChannelConfig />}
        {tab === "profit-sharing" && <ProfitSharingConfig />}
      </Box>
    </Box>
  );
}
