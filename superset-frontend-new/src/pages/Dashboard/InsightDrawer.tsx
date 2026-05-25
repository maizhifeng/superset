import { useEffect, useState, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Drawer from "@mui/material/Drawer";
import { keyframes } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import ContentCopy from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import ExpandMore from "@mui/icons-material/ExpandMore";
import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";
import SettingsIcon from "@mui/icons-material/Settings";
import type { ChartData } from "@/types/api";
import { useInsight } from "@/pages/Dashboard/hooks/useInsight";
import { useNotificationStore } from "@/store/notificationStore";

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

interface InsightDrawerProps {
  open: boolean;
  chartId: number | null;
  chartData?: Record<string, unknown>;
  chartMeta?: ChartData;
  filters?: Record<string, unknown>;
  onClose: () => void;
}

export default function InsightDrawer({
  open,
  chartId,
  chartMeta,
  filters,
  onClose,
}: InsightDrawerProps) {
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const {
    insightText,
    reasoningText,
    loading,
    error,
    currentToolCalls,
    generate,
    sendMessage,
    clear,
    stop,
    modelConfig,
    updateModelConfig,
  } = useInsight();
  const notify = useNotificationStore((s) => s.notify);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prevOpenRef = useRef(open);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    clear();
    onClose();
  };

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      clear();
      setReasoningOpen(false);
      setSettingsOpen(false);
      setFollowUp("");
    } else if (!open) {
      setReasoningOpen(false);
      setSettingsOpen(false);
    }
    prevOpenRef.current = open;
  }, [open, clear]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [insightText, currentToolCalls, reasoningText]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(insightText);
      notify({ severity: "success", message: "分析结果已复制到剪贴板" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  const handleSend = () => {
    if (loading) return;
    const msg = followUp.trim();
    if (!msg) return;
    setFollowUp("");
    sendMessage(msg);
  };

  return (
    <>
      <Drawer
        variant="temporary"
        anchor="right"
        open={open}
        onClose={handleClose}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 2 }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100vw", md: "35vw" },
              top: 0,
              height: "100vh",
              borderRight: "none",
              borderTopLeftRadius: 12,
              borderBottomLeftRadius: 12,
            },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              px: 2,
              py: 1.5,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <AutoAwesome sx={{ fontSize: 20, color: "primary.main", mr: 1 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
              AI 洞察分析
            </Typography>
            <IconButton size="small" onClick={() => setSettingsOpen((v) => !v)} sx={{ mr: 0.5 }}>
              <SettingsIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <IconButton size="small" onClick={handleClose}>
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>

          <Collapse in={settingsOpen}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider", display: "flex", gap: 1.5, alignItems: "flex-end" }}>
              <TextField size="small" label="供应商（Provider ID）" value={modelConfig.provider}
                onChange={(e) => updateModelConfig({ ...modelConfig, provider: e.target.value })}
                sx={{ minWidth: 120 }} placeholder="lm_studio" />
              <TextField size="small" label="模型（Model ID）" value={modelConfig.model}
                onChange={(e) => updateModelConfig({ ...modelConfig, model: e.target.value })}
                sx={{ minWidth: 160 }} placeholder="gemma-4-e4b-it" />
            </Box>
          </Collapse>
          <Box
            ref={scrollRef}
            sx={{
              flex: 1,
              overflow: "auto",
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {chartMeta && (
              <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover" }}>
                <Typography variant="caption" color="text.secondary">
                  图表: {chartMeta.slice_name || `#${chartId}`}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  类型: {chartMeta.viz_type}
                </Typography>
              </Box>
            )}

            {currentToolCalls.length > 0 && (
              <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover", border: "1px solid", borderColor: "info.light" }}>
                <Typography variant="caption" color="info.main" sx={{ fontWeight: 600 }}>
                  AI 正在分析…
                </Typography>
                {currentToolCalls.map((tc, i) => (
                  <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {tc.status === "calling" ? <CircularProgress size={10} /> : (
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "success.main" }} />
                    )}
                    <Typography variant="caption" color="text.secondary">调用 {tc.tool}</Typography>
                  </Box>
                ))}
              </Box>
            )}

            {error ? (
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <Typography color="error" variant="body2" sx={{ textAlign: "center" }}>{error}</Typography>
                <Button variant="outlined" size="small" startIcon={<RefreshIcon />}
                  onClick={() => chartId && generate(chartId, filtersRef.current || {})}>
                  重试
                </Button>
              </Box>
            ) : insightText ? (<>
              {/* Reasoning folding */}
              {reasoningText && (
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
                  <Box onClick={() => setReasoningOpen((v) => !v)}
                    sx={{ display: "flex", alignItems: "center", px: 1.5, py: 1, cursor: "pointer", bgcolor: "action.hover", userSelect: "none" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>思考过程</Typography>
                    <ExpandMore sx={{ fontSize: 18, color: "text.disabled",
                      transform: reasoningOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </Box>
                  <Collapse in={reasoningOpen}>
                    <Box sx={{ px: 1.5, py: 1, borderTop: "1px solid", borderColor: "divider" }}>
                      <Typography variant="caption" color="text.secondary"
                        sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}>
                        {reasoningText}
                      </Typography>
                    </Box>
                  </Collapse>
                </Box>
              )}
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7 }}>
                  {insightText}
                </Typography>
                {loading && <Box component="span" sx={{ display: "inline-block", width: 8, height: 16,
                  bgcolor: "text.primary", animation: `${blink} 1s step-end infinite`, ml: 0.5, verticalAlign: "text-bottom" }} />}
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button variant="outlined" size="small" startIcon={<ContentCopy />} onClick={handleCopy}>复制结果</Button>
                {!loading && <Button variant="outlined" size="small" startIcon={<RefreshIcon />}
                  onClick={() => chartId && generate(chartId, filtersRef.current || {})}>
                  重新生成
                </Button>}
              </Box>
            </>) : loading ? (
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <CircularProgress size={32} />
                <Typography color="text.secondary" variant="body2">正在分析数据中…</Typography>
              </Box>
            ) : (
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <AutoAwesome sx={{ fontSize: 40, color: "text.disabled", opacity: 0.5 }} />
                <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>AI 可基于图表数据进行分析</Typography>
                <Button variant="contained" startIcon={<AutoAwesome />}
                  onClick={() => chartId && generate(chartId, filtersRef.current || {})}>
                  开始分析
                </Button>
              </Box>
            )}
          </Box>

          {(insightText || loading) && (
            <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider", display: "flex", gap: 1 }}>
              <TextField size="small" fullWidth placeholder="输入追问内容…" value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !loading) { e.preventDefault(); handleSend(); } }} />
              {loading ? (
                <IconButton color="error" onClick={stop}><StopIcon /></IconButton>
              ) : (
                <IconButton color="primary" onClick={handleSend} disabled={!followUp.trim()}><SendIcon /></IconButton>
              )}
            </Box>
          )}
        </Box>
      </Drawer>
    </>
  );
}
