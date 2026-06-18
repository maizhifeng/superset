import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Collapse from "@mui/material/Collapse";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ListIcon from "@mui/icons-material/List";
import type { AgentStep } from "@/components/AgentApp/types";
import AgentStepCard from "@/components/AgentApp/AgentStepCard";

interface AgentStepsPanelProps {
  steps: AgentStep[];
  isRunning: boolean;
}

export default function AgentStepsPanel({
  steps,
  isRunning,
}: AgentStepsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (steps.length === 0) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        right: 16,
        top: 16,
        zIndex: 10,
        maxWidth: 380,
        minWidth: collapsed ? "auto" : 300,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 0.5,
        }}
      >
        {!collapsed && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 500 }}
          >
            {isRunning ? "执行中…" : `执行步骤 (${steps.length})`}
          </Typography>
        )}
        <Tooltip
          title={collapsed ? "展开执行面板" : "折叠执行面板"}
          placement="left"
        >
          <IconButton
            size="small"
            onClick={() => setCollapsed(!collapsed)}
            sx={{ color: "text.secondary" }}
          >
            {collapsed ? (
              <ExpandMoreIcon sx={{ fontSize: 18 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      <Collapse in={!collapsed}>
        <Box
          sx={{
            bgcolor: "background.paper",
            borderRadius: 1.5,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            p: 1.5,
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {steps.map((step) => (
            <AgentStepCard key={step.id} step={step} compact />
          ))}
          {isRunning && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  animation: "pulse 1.5s ease-in-out infinite",
                  "@keyframes pulse": {
                    "0%, 100%": { opacity: 0.4 },
                    "50%": { opacity: 1 },
                  },
                }}
              />
              <Typography variant="caption" color="text.secondary">
                处理中…
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>

      {collapsed && (
        <Tooltip title={`${steps.length} 个执行步骤`} placement="left">
          <IconButton
            size="small"
            onClick={() => setCollapsed(false)}
            sx={{
              bgcolor: isRunning ? "primary.main" : "background.paper",
              color: isRunning ? "white" : "text.secondary",
              border: "1px solid",
              borderColor: "divider",
              "&:hover": { bgcolor: isRunning ? "primary.dark" : "grey.100" },
            }}
          >
            <ListIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
