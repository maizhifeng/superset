import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ScheduleIcon from "@mui/icons-material/Schedule";
import type { AgentStep } from "@/components/AgentApp/types";

const stepTypeConfig: Record<string, { label: string; color: string; bg: string }> = {
  query: { label: "查询", color: "#1976d2", bg: "rgba(25, 118, 210, 0.08)" },
  analyze: { label: "分析", color: "#388e3c", bg: "rgba(56, 142, 60, 0.08)" },
  chart: { label: "图表", color: "#7b1fa2", bg: "rgba(123, 31, 162, 0.08)" },
  report: { label: "报告", color: "#e65100", bg: "rgba(230, 81, 0, 0.08)" },
  drilldown: { label: "钻取", color: "#1565c0", bg: "rgba(21, 101, 192, 0.08)" },
  compare: { label: "对比", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.08)" },
  schema: { label: "元数据", color: "#546e7a", bg: "rgba(84, 110, 122, 0.08)" },
};

interface AgentStepCardProps {
  step: AgentStep;
  compact?: boolean;
  isLast?: boolean;
}

export default function AgentStepCard({ step, compact, isLast }: AgentStepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = stepTypeConfig[step.type] ?? { label: step.type, color: "#78909c", bg: "rgba(120, 144, 156, 0.08)" };


  const statusIcon = () => {
    switch (step.status) {
      case "running":
        return <CircularProgress size={16} sx={{ color: cfg.color }} />;
      case "done":
        return (
          <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "#4caf50", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</Typography>
          </Box>
        );
      case "error":
        return (
          <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "#ef5350", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✗</Typography>
          </Box>
        );
      default:
        return (
          <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "grey.300", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>○</Typography>
          </Box>
        );
    }
  };

  return (
    <Box sx={{ display: "flex", gap: 1.5, position: "relative" }}>
      {/* Timeline connector */}
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
        {statusIcon()}
        {!isLast && (
          <Box sx={{ width: 2, flex: 1, bgcolor: step.status === "error" ? "#ef5350" : "grey.300", mt: 0.5, minHeight: 16 }} />
        )}
      </Box>

      {/* Step content */}
      <Box sx={{ flex: 1, minWidth: 0, pb: isLast ? 0 : 1.5 }}>
        <Box
          sx={{
            borderRadius: 1.5,
            border: "1px solid",
            borderColor: step.status === "error" ? "#ef5350" : "grey.200",
            overflow: "hidden",
            transition: "box-shadow 200ms",
            "&:hover": { boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
          }}
        >
          <Box
            onClick={() => setExpanded((prev) => !prev)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: compact ? 0.75 : 1,
              cursor: "pointer",
              bgcolor: step.status === "error" ? "rgba(239, 83, 80, 0.04)" : "background.paper",
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
                <Typography
                  variant={compact ? "caption" : "body2"}
                  sx={{
                    fontWeight: 600,
                    fontSize: compact ? "0.72rem" : "0.8rem",
                    color: "text.primary",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {step.description}
                </Typography>
                {step.duration && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, flexShrink: 0 }}>
                    <ScheduleIcon sx={{ fontSize: 11, color: "text.disabled" }} />
                    <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "text.disabled", fontWeight: 500 }}>
                      {(step.duration / 1000).toFixed(1)}s
                    </Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{ px: 0.6, py: 0.15, borderRadius: 0.5, bgcolor: cfg.bg }}>
                  <Typography sx={{ fontSize: "0.62rem", fontWeight: 600, color: cfg.color, lineHeight: 1.4 }}>
                    {cfg.label}
                  </Typography>
                </Box>
                {step.status === "error" && (
                  <Typography sx={{ fontSize: "0.65rem", color: "#ef5350", fontWeight: 500 }}>失败</Typography>
                )}
              </Box>
            </Box>

            <IconButton size="small" sx={{ p: 0.3, color: "text.disabled", flexShrink: 0 }}>
              {expanded ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Box>

          <Collapse in={expanded}>
            <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
              {step.args && (
                <Box sx={{ mb: 1 }}>
                  {Object.entries(step.args).map(([k, v]) => {
                    if (v == null || (Array.isArray(v) && v.length === 0)) return null;
                    let displayVal = "";
                    if (k === "metrics" && Array.isArray(v)) {
                      displayVal = v.map((x: any) => {
                        if (typeof x === "string") return x;
                        if (x?.label) return x.label;
                        if (x?.column?.column_name) return x.column.column_name;
                        return JSON.stringify(x);
                      }).join(", ");
                    } else if (k === "columns" && Array.isArray(v)) {
                      displayVal = v.join(", ");
                    } else if (k === "orderby" && Array.isArray(v)) {
                      displayVal = v.map((o: any) => (Array.isArray(o) ? `${o[0]}↓` : JSON.stringify(o))).join(", ");
                    } else {
                      displayVal = typeof v === "string" ? v : JSON.stringify(v);
                    }
                    return (
                      <Box key={k} sx={{ display: "flex", gap: 0.5, py: 0.15 }}>
                        <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, color: "primary.main", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                          {k}:
                        </Typography>
                        <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", fontFamily: "monospace", wordBreak: "break-all" }}>
                          {displayVal}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}

              {step.result && (
                <Box
                  component="pre"
                  sx={{
                    p: 1,
                    bgcolor: "grey.50",
                    borderRadius: 1,
                    overflow: "auto",
                    fontSize: "0.68rem",
                    lineHeight: 1.4,
                    maxHeight: 140,
                    border: "1px solid",
                    borderColor: "grey.200",
                    color: "text.secondary",
                    mb: 0.5,
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                  }}
                >
                  {step.result.length > 800 ? step.result.slice(0, 800) + "\n..." : step.result}
                </Box>
              )}

              {step.subSteps && step.subSteps.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {step.subSteps.map((sub, idx) => (
                    <AgentStepCard key={sub.id} step={sub} compact isLast={idx === step.subSteps!.length - 1} />
                  ))}
                </Box>
              )}
            </Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
}
