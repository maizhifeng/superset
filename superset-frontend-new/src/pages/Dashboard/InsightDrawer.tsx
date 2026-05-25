import { useEffect, useState, useRef, useMemo } from "react";
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
import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";
import SettingsIcon from "@mui/icons-material/Settings";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import type { ChartData } from "@/types/api";
import { useInsight } from "@/pages/Dashboard/hooks/useInsight";
import { useNotificationStore } from "@/store/notificationStore";
import { PRESETS } from "@/api/aiModelConfig";
import InsightSectionCard from "@/pages/Dashboard/InsightSectionCard";

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

function splitSections(text: string): { title: string; content: string }[] {
  const result: { title: string; content: string }[] = [];
  let current: { title: string; content: string } | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^## (.+)/);
    if (m) {
      current = { title: m[1].trim(), content: "" };
      result.push(current);
    } else if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
  }
  if (!result.length && text.trim()) {
    result.push({ title: "分析", content: text.trim() });
  }
  for (const s of result) s.content = s.content.trim();
  return result;
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
    generate,
    sendMessage,
    clear,
    stop,
    modelConfig,
    updateModelConfig,
  } = useInsight();

  const sections = useMemo(() => {
    const parsed = splitSections(insightText);
    if (reasoningText) {
      const hasThinking = parsed.some(
        (s) => s.title === "思考" || s.title === "推理",
      );
      if (!hasThinking) {
        parsed.unshift({ title: "思考", content: reasoningText });
      }
    }
    return parsed;
  }, [insightText, reasoningText]);

  const notify = useNotificationStore((s) => s.notify);
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
      setSettingsOpen(false);
      setFollowUp("");
    } else if (!open) {
      setSettingsOpen(false);
    }
    prevOpenRef.current = open;
  }, [open, clear]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [insightText, reasoningText]);

  const handleCopyAll = async () => {
    try {
      const markdown = sections
        .map((s) => `## ${s.title}\n\n${s.content}`)
        .join("\n\n");
      await navigator.clipboard.writeText(markdown);
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
            <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", gap: 1.5 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>预设方案</InputLabel>
                <Select value="" label="预设方案"
                  onChange={(e) => {
                    const p = PRESETS.find((p) => p.label === e.target.value);
                    if (p) updateModelConfig({ provider: p.provider, model: p.model });
                  }}>
                  {PRESETS.map((p) => <MenuItem key={p.label} value={p.label}>{p.label}</MenuItem>)}
                </Select>
              </FormControl>
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <TextField size="small" label="供应商（Provider ID）" value={modelConfig.provider}
                  onChange={(e) => updateModelConfig({ ...modelConfig, provider: e.target.value })}
                  sx={{ flex: 1 }} />
                <TextField size="small" label="模型（Model ID）" value={modelConfig.model}
                  onChange={(e) => updateModelConfig({ ...modelConfig, model: e.target.value })}
                  sx={{ flex: 1 }} />
              </Box>
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

            {error ? (
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <Typography color="error" variant="body2" sx={{ textAlign: "center" }}>{error}</Typography>
                <Button variant="outlined" size="small" startIcon={<RefreshIcon />}
                  onClick={() => chartId && generate(chartId, filtersRef.current || {})}>
                  重试
                </Button>
              </Box>
            ) : sections.length > 0 ? (<>
              {sections.map((s, i) => (
                <InsightSectionCard
                  key={i}
                  title={s.title}
                  content={s.content + (loading && i === sections.length - 1 ? "▎" : "")}
                  defaultCollapsed={s.title === "思考"}
                />
              ))}
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button variant="outlined" size="small" startIcon={<ContentCopy />} onClick={handleCopyAll}>复制全部</Button>
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
