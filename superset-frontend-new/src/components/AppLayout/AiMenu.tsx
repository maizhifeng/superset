import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useDrawerStore } from "@/store/drawerState";

export default function AiMenu() {
  const aiDrawerOpen = useDrawerStore((s) => s.aiDrawerOpen);
  const aiDrawerMode = useDrawerStore((s) => s.aiDrawerMode);
  const openAiDrawer = useDrawerStore((s) => s.openAiDrawer);
  const closeAiDrawer = useDrawerStore((s) => s.closeAiDrawer);

  return (
    <Box>
      <Tooltip title="AI 助手" placement="right">
        <IconButton
          size="small"
          onClick={() => {
            if (aiDrawerOpen && aiDrawerMode === "assistant") closeAiDrawer();
            else openAiDrawer("assistant");
          }}
          sx={{ color: "primary.main", transition: "opacity 200ms" }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
