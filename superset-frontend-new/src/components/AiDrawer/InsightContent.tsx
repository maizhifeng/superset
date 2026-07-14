import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import PsychologyIcon from "@mui/icons-material/Psychology";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ContentCopy from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import LightMdRenderer from "@/components/LightMdRenderer";
import SmartInput from "@/components/AiDrawer/SmartInput";
import { blink } from "@/theme/keyframes";
import type { InsightState } from "@/types/ai";

interface InsightContentProps {
  insight: InsightState;
  chartId?: number | null;
  chartMeta?: { slice_name?: string } | null;
  onCopy: () => void;
  onRefresh: () => void;
}

export default function InsightContent({
  insight,
  chartId,
  chartMeta,
  onCopy,
  onRefresh,
}: InsightContentProps) {
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true);

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {chartMeta && !chartId && (
        <Box
          sx={{
            px: 1.5,
            py: 0.75,
            borderRadius: 1,
            bgcolor: "action.hover",
            fontSize: "0.75rem",
            color: "text.secondary",
          }}
        >
          {chartMeta.slice_name || `图表 #${chartId}`}
        </Box>
      )}

      {insight.error ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <Typography color="error" variant="body2" sx={{ textAlign: "center" }}>
            {insight.error}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
          >
            重试
          </Button>
        </Box>
      ) : insight.insightText ? (
        <>
          {(insight.reasoningText || insight.loading) && (
            <Box>
              <Box
                onClick={() => setThinkingCollapsed(!thinkingCollapsed)}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  cursor: "pointer",
                  mb: 0.5,
                  userSelect: "none",
                  color: "text.secondary",
                }}
              >
                <PsychologyIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                  思考过程
                </Typography>
                <KeyboardArrowDownIcon
                  sx={{
                    fontSize: 16,
                    transition: (t) =>
                      t.transitions.create("transform", {
                        duration: t.transitions.duration.shorter,
                      }),
                    transform: thinkingCollapsed ? "rotate(-90deg)" : "none",
                  }}
                />
              </Box>
              <Collapse in={!thinkingCollapsed}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    mb: 1,
                    bgcolor: "action.hover",
                    borderLeft: "3px solid",
                    borderColor: "divider",
                    fontSize: "0.75rem",
                    lineHeight: 1.6,
                    wordBreak: "break-word",
                    maxHeight: 360,
                    overflow: "auto",
                  }}
                >
                  <LightMdRenderer content={insight.reasoningText} />
                  {insight.loading && (
                    <Box
                      component="span"
                      sx={{
                        animation: `${blink} 1s step-end infinite`,
                        color: "primary.main",
                        fontWeight: 700,
                      }}
                    >
                      ▎
                    </Box>
                  )}
                </Box>
              </Collapse>
            </Box>
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            <SmartToyIcon
              sx={{ fontSize: 20, mt: 0.5, color: "primary.main", flexShrink: 0 }}
            />
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                px: 1.5,
                py: 1,
                borderRadius: 2,
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                fontSize: "0.8125rem",
                lineHeight: 1.6,
                wordBreak: "break-word",
                boxShadow: "var(--mui-palette-shadow-sm)",
                overflow: "hidden",
              }}
            >
              <LightMdRenderer content={insight.insightText} />
              {insight.loading && (
                <Box
                  component="span"
                  sx={{
                    animation: `${blink} 1s step-end infinite`,
                    color: "primary.main",
                    fontWeight: 700,
                  }}
                >
                  ▎
                </Box>
              )}
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="outlined" size="small" startIcon={<ContentCopy />} onClick={onCopy}>
              复制全部
            </Button>
            {!insight.loading && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={onRefresh}
              >
                重新生成
              </Button>
            )}
          </Box>
          <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
            <SmartInput
              onSend={(text) => {
                if (insight.loading) return;
                insight.sendMessage(text);
              }}
              onStop={insight.stop}
              streaming={insight.loading}
            />
          </Box>
        </>
      ) : insight.loading ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <CircularProgress size={32} />
          <Typography color="text.secondary" variant="body2">
            正在分析数据中…
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <AutoAwesome sx={{ fontSize: 40, color: "text.disabled", opacity: 0.5 }} />
          <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>
            AI 可基于图表数据进行分析
          </Typography>
          <Button variant="contained" startIcon={<AutoAwesome />} onClick={onRefresh}>
            开始分析
          </Button>
        </Box>
      )}
    </Box>
  );
}
