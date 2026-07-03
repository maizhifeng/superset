import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useDrawerStore } from "@/store/drawerState";

export default function AiMenu() {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const aiDrawerOpen = useDrawerStore((s) => s.aiDrawerOpen);
  const aiDrawerMode = useDrawerStore((s) => s.aiDrawerMode);
  const openAiDrawer = useDrawerStore((s) => s.openAiDrawer);
  const closeAiDrawer = useDrawerStore((s) => s.closeAiDrawer);

  return (
    <Box>
      <Tooltip title="AI 助手" placement="right">
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ color: "primary.main", transition: "opacity 200ms" }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { minWidth: 140 } } }}
      >
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            if (aiDrawerOpen && aiDrawerMode === "assistant") closeAiDrawer();
            else openAiDrawer("assistant");
          }}
        >
          AI 助手
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            navigate("/agent");
          }}
        >
          AI Agent
        </MenuItem>
      </Menu>
    </Box>
  );
}
