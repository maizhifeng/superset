import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ListIcon from "@mui/icons-material/List";
import AgentStatusBar from "@/components/AgentApp/AgentStatusBar";
import AgentSessionSidebar from "@/components/AgentApp/AgentSessionSidebar";
import AgentStepCard from "@/components/AgentApp/AgentStepCard";
import { useAgentStore } from "@/store/agentStore";

export default function AgentApp({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stepsOpen, setStepsOpen] = useState(true);

  const { activeSteps, isRunning } = useAgentStore((s) => {
    const active = s.sessions.find((session) => session.id === s.activeSessionId);
    return {
      activeSteps: active?.steps ?? [],
      isRunning: (active?.steps ?? []).some((step) => step.status === "running"),
    };
  });

  const hasSteps = activeSteps.length > 0;

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <AgentStatusBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {sidebarOpen && <AgentSessionSidebar />}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </Box>
        {hasSteps && (
          <Box
            sx={{
              width: stepsOpen ? 320 : 40,
              minWidth: stepsOpen ? 320 : 40,
              borderLeft: "1px solid",
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              transition: "width 200ms, min-width 200ms",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: stepsOpen ? 1.5 : 0.5,
                py: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              {stepsOpen && (
                <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                  执行步骤
                </Typography>
              )}
              <IconButton
                size="small"
                onClick={() => setStepsOpen((prev) => !prev)}
              >
                {stepsOpen ? <ChevronRightIcon sx={{ fontSize: 18 }} /> : <ChevronLeftIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Box>
            {stepsOpen && (
              <Box
                sx={{
                  flex: 1,
                  overflow: "auto",
                  p: 1.5,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                {isRunning && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
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
                      执行中…
                    </Typography>
                  </Box>
                )}
                {activeSteps.map((step) => (
                  <AgentStepCard key={step.id} step={step} />
                ))}
              </Box>
            )}
          </Box>
        )}
        {!hasSteps && !stepsOpen && (
          <Box
            sx={{
              width: 40,
              minWidth: 40,
              borderLeft: "1px solid",
              borderColor: "divider",
              display: "flex",
              alignItems: "flex-start",
              pt: 1,
              justifyContent: "center",
            }}
          >
            <Tooltip title="执行步骤" placement="left">
              <IconButton
                size="small"
                onClick={() => setStepsOpen(true)}
              >
                <ListIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  );
}
