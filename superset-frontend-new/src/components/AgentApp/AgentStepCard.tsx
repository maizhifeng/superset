import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import type { AgentStep } from "@/components/AgentApp/types";

const stepTypeLabels: Record<string, string> = {
  query: "查询",
  analyze: "分析",
  chart: "图表",
  report: "报告",
  drilldown: "钻取",
  compare: "对比",
};

const stepTypeColors: Record<
  string,
  "default" | "primary" | "success" | "info" | "warning"
> = {
  query: "primary",
  analyze: "info",
  chart: "success",
  report: "warning",
  drilldown: "primary",
  compare: "info",
};

interface AgentStepCardProps {
  step: AgentStep;
  compact?: boolean;
}

export default function AgentStepCard({ step, compact }: AgentStepCardProps) {
  return (
    <Box
      sx={{
        mb: compact ? 0.5 : 1,
        p: compact ? 1 : 1.5,
        borderRadius: 1.5,
        bgcolor:
          step.status === "error" ? "rgba(211, 47, 47, 0.08)" : "grey.50",
        border: "1px solid",
        borderColor: step.status === "error" ? "error.light" : "grey.200",
        transition: "all 200ms",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {step.status === "running" ? (
          <CircularProgress size={compact ? 12 : 16} />
        ) : step.status === "done" ? (
          <Typography
            variant="body2"
            sx={{ color: "success.main", lineHeight: 1 }}
          >
            ✓
          </Typography>
        ) : step.status === "error" ? (
          <Typography
            variant="body2"
            sx={{ color: "error.main", lineHeight: 1 }}
          >
            ✗
          </Typography>
        ) : (
          <Typography
            variant="body2"
            sx={{ color: "text.disabled", lineHeight: 1 }}
          >
            ○
          </Typography>
        )}

        <Typography
          variant={compact ? "caption" : "body2"}
          sx={{ fontWeight: 500, flex: 1 }}
        >
          {step.description}
        </Typography>

        <Chip
          label={stepTypeLabels[step.type] ?? step.type}
          size="small"
          color={stepTypeColors[step.type] ?? "default"}
          variant="outlined"
          sx={{ height: compact ? 18 : 22, fontSize: "0.65rem" }}
        />

        {step.duration && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ flexShrink: 0 }}
          >
            {(step.duration / 1000).toFixed(1)}s
          </Typography>
        )}
      </Box>

      {step.result && !compact && (
        <Typography
          variant="caption"
          component="pre"
          sx={{
            mt: 1,
            p: 1,
            bgcolor: "background.paper",
            borderRadius: 1,
            overflow: "auto",
            fontSize: "0.7rem",
            lineHeight: 1.4,
            maxHeight: 160,
            border: "1px solid",
            borderColor: "grey.100",
          }}
        >
          {step.result}
        </Typography>
      )}

      {step.subSteps && step.subSteps.length > 0 && !compact && (
        <Box
          sx={{
            ml: 2,
            mt: 1,
            pl: 1.5,
            borderLeft: "2px solid",
            borderColor: "grey.300",
          }}
        >
          {step.subSteps.map((sub) => (
            <AgentStepCard key={sub.id} step={sub} compact />
          ))}
        </Box>
      )}
    </Box>
  );
}
