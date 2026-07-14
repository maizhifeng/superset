import { useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { AgentStep } from "@/types/ai";
import AgentStepCard from "@/components/AgentApp/AgentStepCard";

interface AgentStepsPanelProps {
  steps: AgentStep[];
  isRunning: boolean;
}

export default function AgentStepsPanel({ steps, isRunning }: AgentStepsPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps.length]);

  if (steps.length === 0) return null;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {isRunning ? "执行中" : `执行步骤 (${steps.length})`}
        </Typography>
        {isRunning && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: "primary.main",
                animation: "pulse 1.5s ease-in-out infinite",
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 0.4 },
                  "50%": { opacity: 1 },
                },
              }}
            />
            <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "text.disabled" }}>
              处理中…
            </Typography>
          </Box>
        )}
      </Box>

      {steps.map((step, idx) => (
        <AgentStepCard key={step.id} step={step} compact isLast={idx === steps.length - 1} />
      ))}
      <div ref={bottomRef} />
    </Box>
  );
}
