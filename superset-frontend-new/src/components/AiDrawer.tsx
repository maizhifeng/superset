import { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Collapse from "@mui/material/Collapse";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import FaceIcon from "@mui/icons-material/Face";
import SettingsIcon from "@mui/icons-material/Settings";
import ContentCopy from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import PsychologyIcon from "@mui/icons-material/Psychology";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import StorageIcon from "@mui/icons-material/Storage";
import ArticleIcon from "@mui/icons-material/Article";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AiConfigDialog from "@/components/AiConfigDialog";
import LightMdRenderer from "@/components/LightMdRenderer";
import DAILY_REPORT_PROMPT from "@/config/dailyReportPrompt";
import WEEKLY_REPORT_PROMPT from "@/config/weeklyReportPrompt";
import DRILL_DOWN_PROMPT from "@/config/drillDownPrompt";
import DocViewer, { getDocTitle } from "@/components/DocViewer";
import { useAiConfigStore } from "@/config/aiConfig";
import { useInsight } from "@/pages/Dashboard/hooks/useInsight";
import { useDrawerStore } from "@/store/drawerState";
import { useNotificationStore } from "@/store/notificationStore";
import { blink } from "@/theme/keyframes";
import { transitions } from "@/theme/motion";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DrillDownSuggestion {
  label: string;
  prompt: string;
}

interface KnowledgeCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  prompt?: string;
  docKey?: string;
}

interface AiDrawerProps {
  open: boolean;
  onClose: () => void;
  variant?: "assistant" | "insight";
  chartId?: number | null;
  chartMeta?: ChartData;
  filters?: Record<string, unknown>;
}

import type { ChartData } from "@/types/api";

const knowledgeCards: KnowledgeCard[] = [
  {
    title: "生成日报",
    description: "生成昨日数据日报，含项目、渠道、媒体多维分析",
    icon: <ArticleIcon sx={{ fontSize: 24 }} />,
    prompt: DAILY_REPORT_PROMPT,
  },
  {
    title: "生成周报",
    description: "生成周对比分析报告，含项目、媒体、变化趋势",
    icon: <CalendarMonthIcon sx={{ fontSize: 24 }} />,
    prompt: WEEKLY_REPORT_PROMPT,
  },
  {
    title: "使用手册",
    description: "平台功能、操作指南与最佳实践",
    icon: <MenuBookIcon sx={{ fontSize: 24 }} />,
    docKey: "manual",
  },
  {
    title: "技术架构",
    description: "系统架构、组件与部署架构说明",
    icon: <AccountTreeIcon sx={{ fontSize: 24 }} />,
    docKey: "architecture",
  },
  {
    title: "数据字典",
    description: "数据模型、字段定义与业务含义",
    icon: <StorageIcon sx={{ fontSize: 24 }} />,
    prompt:
      "请介绍 Starfly 的数据模型和数据字典，包括核心表结构、字段定义、关联关系及业务含义。",
  },
];

const DRILL_DOWN_MARKER = "DRILL_DOWN_SUGGESTIONS";

function extractDrillDownSuggestions(text: string): DrillDownSuggestion[] {
  const idx = text.lastIndexOf(DRILL_DOWN_MARKER);
  if (idx === -1) return [];
  const block = text.slice(idx + DRILL_DOWN_MARKER.length).trim();
  return block
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 5)
    .map((l) => {
      const sep = l.indexOf("|");
      if (sep !== -1) {
        return { label: l.slice(0, sep).trim(), prompt: l.slice(sep + 1).trim() };
      }
      return { label: l, prompt: l };
    });
}

function stripDrillDownSection(text: string): string {
  const idx = text.lastIndexOf(DRILL_DOWN_MARKER);
  if (idx === -1) return text;
  return text.slice(0, idx).trim();
}

function useAiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const [sessionKey, setSessionKey] = useState(0);
  const [suggestions, setSuggestions] = useState<DrillDownSuggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const systemPrompt =
    "You are a helpful data analysis assistant embedded inside Starfly. " +
    "Answer general questions about Starfly features, data visualization, " +
    "SQL, and data analysis. Be concise and practical.\n" +
    "IMPORTANT: Do NOT output any reasoning, planning, or thinking process. " +
    "Output only the final answer directly.";

  const streamChat = async (
    text: string,
    signal?: AbortSignal,
    history?: { role: string; content: string }[],
  ) => {
    const { streamDirectChat } = await import("@/api/aiInsight");
    const { getActivePreset } = await import("@/config/aiConfig");
    const preset = getActivePreset();
    let full = "";
    let errored = false;
    let rafId = 0;
    let inTable = false;
    const lastLine = () => {
      const nl = full.lastIndexOf("\n");
      return nl >= 0 ? full.slice(nl + 1) : full;
    };
    const tryRender = () => {
      const ll = lastLine();
      if (ll.startsWith("|")) {
        if (!ll.endsWith("|") || ll.length <= 1) return;
        if (!full.endsWith("|\n")) return;
        inTable = true;
      } else if (ll.trim() === "" && inTable) {
        return;
      } else if (inTable) {
        return;
      } else {
        inTable = false;
      }
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setCurrentText(full));
    };
    await streamDirectChat(
      text,
      systemPrompt,
      {
        onText: (token) => {
          full += token;
          tryRender();
        },
        onError: () => {
          errored = true;
        },
      },
      signal,
      {
        provider: preset.provider,
        model: preset.model,
        baseUrl: preset.baseUrl,
      },
      history,
    );
    cancelAnimationFrame(rafId);
    setCurrentText(full);
    if (errored) throw new Error("AI 响应异常，请重试");
    return full;
  };

  const sendMessage = async (text: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const userMsg: Message = { role: "user", content: text };
    const history = messages;
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setCurrentText("");

    try {
      const fullContent = await streamChat(text, abort.signal, history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullContent },
      ]);
      setCurrentText("");
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      const errMsg = e instanceof Error ? e.message : "请求失败，请重试";
      setCurrentText("");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `错误: ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = async (text: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setMessages([{ role: "user", content: text }]);
    setLoading(true);
    setCurrentText("");
    setSuggestions([]);
    setSessionKey((k) => k + 1);

    try {
      const fullContent = await streamChat(text, abort.signal);
      setMessages([
        { role: "user", content: text },
        { role: "assistant", content: fullContent },
      ]);
      setCurrentText("");
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      const errMsg = e instanceof Error ? e.message : "请求失败，请重试";
      setCurrentText("");
      setMessages([
        { role: "user", content: text },
        { role: "assistant", content: `错误: ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startDailyReport = async (
    reportPrompt: string,
    promptTemplate: string,
  ) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setMessages([{ role: "user", content: "📊 正在从数据集查询昨日数据..." }]);
    setLoading(true);
    setCurrentText("");
    setSessionKey((k) => k + 1);

    try {
      const { fetchDailyReportData } = await import("@/api/dailyReport");
      const { summaryContext } = await fetchDailyReportData();

      const fullPrompt = [
        promptTemplate,
        "",
        "### 从 Superset 查询到的实际数据",
        "",
        summaryContext,
        "",
        "请根据以上实际数据生成完整日报。",
      ].join("\n");

      setMessages([{ role: "user", content: reportPrompt }]);

      const fullContent = await streamChat(fullPrompt, abort.signal);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: stripDrillDownSection(fullContent) },
      ]);
      setCurrentText("");
      setSuggestions(extractDrillDownSuggestions(fullContent));
    } catch {
      setCurrentText("");
      setSuggestions([]);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "❌ 数据查询失败，请稍后重试。如果问题持续，请检查 Superset 后端是否正常运行。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startWeeklyReport = async (
    reportPrompt: string,
    promptTemplate: string,
  ) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setMessages([{ role: "user", content: "📊 正在从数据集查询两周数据..." }]);
    setLoading(true);
    setCurrentText("");
    setSessionKey((k) => k + 1);

    try {
      const { fetchWeeklyReportData } = await import("@/api/weeklyReport");
      const { summaryContext } = await fetchWeeklyReportData();

      const fullPrompt = [
        promptTemplate,
        "",
        "### 从 Superset 查询到的实际数据",
        "",
        summaryContext,
        "",
        "请根据以上实际数据生成完整周报。",
      ].join("\n");

      setMessages([{ role: "user", content: reportPrompt }]);

      const fullContent = await streamChat(fullPrompt, abort.signal);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: stripDrillDownSection(fullContent) },
      ]);
      setCurrentText("");
      setSuggestions(extractDrillDownSuggestions(fullContent));
    } catch {
      setCurrentText("");
      setSuggestions([]);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "❌ 数据查询失败，请稍后重试。如果问题持续，请检查 Superset 后端是否正常运行。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startDrillDown = async (analysisPrompt: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: `📊 钻取分析: ${analysisPrompt}` },
    ]);
    setLoading(true);
    setCurrentText("");

    try {
      const { fetchDrillDownData } = await import("@/api/drillDown");
      const { summaryContext } = await fetchDrillDownData();

      const fullPrompt = [
        DRILL_DOWN_PROMPT,
        "",
        "### 分析指令",
        analysisPrompt,
        "",
        "### 从 Superset 查询到的实际数据",
        "",
        summaryContext,
        "",
        "请根据以上实际数据，针对分析指令进行深入钻取分析，给出具体的结论和优化建议。",
      ].join("\n");

      const fullContent = await streamChat(fullPrompt, abort.signal);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullContent },
      ]);
      setCurrentText("");
    } catch {
      setCurrentText("");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "❌ 数据查询失败，请稍后重试。如果问题持续，请检查 Superset 后端是否正常运行。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
    setCurrentText("");
  };

  const clear = () => {
    abortRef.current?.abort();
    setMessages([]);
    setCurrentText("");
    setLoading(false);
    setSuggestions([]);
    setSessionKey((k) => k + 1);
  };

  return {
    messages,
    loading,
    currentText,
    sessionKey,
    suggestions,
    sendMessage,
    startNewChat,
    startDailyReport,
    startWeeklyReport,
    startDrillDown,
    stop,
    clear,
  };
}

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      {!isUser && (
        <SmartToyIcon
          sx={{
            fontSize: 20,
            mt: 0.5,
            color: "primary.main",
            flexShrink: 0,
          }}
        />
      )}
      <Box
        sx={{
          maxWidth: "92%",
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: isUser ? "primary.main" : "background.paper",
          color: isUser ? "primary.contrastText" : "text.primary",
          border: isUser ? "none" : "1px solid",
          borderColor: "divider",
          fontSize: "0.8125rem",
          lineHeight: 1.6,
          whiteSpace: isUser ? "pre-wrap" : undefined,
          wordBreak: "break-word",
          boxShadow: isUser ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        {isUser ? msg.content : <LightMdRenderer content={msg.content} />}
      </Box>
      {isUser && (
        <FaceIcon
          sx={{
            fontSize: 20,
            mt: 0.5,
            color: "text.secondary",
            flexShrink: 0,
          }}
        />
      )}
    </Box>
  );
}

export default function AiDrawer({
  open,
  onClose,
  variant = "assistant",
  chartId,
  chartMeta,
  filters,
}: AiDrawerProps) {
  const {
    messages,
    loading: chatLoading,
    currentText,
    sessionKey,
    suggestions,
    sendMessage,
    startNewChat,
    startDailyReport,
    startWeeklyReport,
    startDrillDown,
    stop: chatStop,
    clear: chatClear,
  } = useAiChat();
  const insight = useInsight();
  const notify = useNotificationStore((s) => s.notify);
  const { activePreset } = useAiConfigStore();
  const drawerWidth = useDrawerStore((s) => s.drawerWidth);
  const setDrawerWidth = useDrawerStore((s) => s.setDrawerWidth);
  const [input, setInput] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(open);
  const isAssist = variant === "assistant";

  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = drawerWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, [drawerWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - e.clientX;
      const newWidth = Math.min(Math.max(startWidthRef.current + delta, 360), window.innerWidth * 0.8);
      setDrawerWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (!isAssist) {
        insight.clear();
        setFollowUp("");
        setThinkingCollapsed(true);
      }
    } else if (!open) {
      if (!isAssist) {
        setFollowUp("");
      }
    }
    prevOpenRef.current = open;
  }, [open, insight, isAssist]);

  useEffect(() => {
    if (insight.loading && !isAssist) {
      setThinkingCollapsed(false);
    }
  }, [insight.loading, isAssist]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || chatLoading) return;
    setInput("");
    sendMessage(msg);
  };

  const handleInsightSend = () => {
    if (insight.loading) return;
    const msg = followUp.trim();
    if (!msg) return;
    setFollowUp("");
    insight.sendMessage(msg);
  };

  const handleCardClick = (card: KnowledgeCard) => {
    if (card.docKey) {
      setActiveDoc(card.docKey);
    } else if (card.prompt) {
      if (card.title === "生成日报") {
        startDailyReport("请生成昨日数据日报", card.prompt);
      } else if (card.title === "生成周报") {
        startWeeklyReport("请生成 W1 vs W2 周对比分析报告", card.prompt);
      } else {
        startNewChat(card.prompt);
      }
    }
  };

  const handleClose = () => {
    if (isAssist) {
      chatClear();
      setActiveDoc(null);
    } else {
      insight.clear();
    }
    onClose();
  };

  const handleCopyAll = async () => {
    try {
      const full = insight.reasoningText
        ? `## 思考过程\n\n${insight.reasoningText}\n\n---\n\n${insight.insightText}`
        : insight.insightText;
      await navigator.clipboard.writeText(full);
      notify({ severity: "success", message: "分析结果已复制到剪贴板" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  const title = isAssist
    ? activeDoc
      ? getDocTitle(activeDoc)
      : "AI 助手"
    : "AI 洞察分析";

  return (
    <Drawer
      variant="persistent"
      anchor="right"
      open={open}
      onClose={handleClose}
      sx={{ position: "relative", zIndex: (theme) => theme.zIndex.drawer + 2 }}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100vw", md: drawerWidth },
            top: 45,
            height: "calc(100vh - 45px)",
            zIndex: (theme) => theme.zIndex.drawer + 2,
            borderRight: "none",
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
          },
        },
      }}
    >
      <Box
        sx={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}
      >
        {/* Drag handle */}
        <Box
          onMouseDown={handleDragStart}
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: "ew-resize",
            zIndex: (theme) => theme.zIndex.drawer + 3,
            "&:hover": { bgcolor: "primary.main", opacity: 0.5 },
            transition: (t) => t.transitions.create("background-color", { duration: t.transitions.duration.shorter }),
          }}
        />
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 2,
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {isAssist && activeDoc ? (
            <IconButton
              size="small"
              onClick={() => setActiveDoc(null)}
              sx={{ mr: 0.5 }}
            >
              <ArrowBackIcon sx={{ fontSize: 20 }} />
            </IconButton>
          ) : isAssist && messages.length > 0 ? (
            <IconButton size="small" onClick={chatClear} sx={{ mr: 0.5 }}>
              <ArrowBackIcon sx={{ fontSize: 20 }} />
            </IconButton>
          ) : !isAssist ? (
            <IconButton size="small" onClick={insight.clear} sx={{ mr: 0.5 }}>
              <ArrowBackIcon sx={{ fontSize: 20 }} />
            </IconButton>
          ) : null}
          <AutoAwesome sx={{ fontSize: 20, color: "primary.main", mr: 1 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, lineHeight: 1.3 }}
            >
              {title}
            </Typography>
            {isAssist && !activeDoc && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{
                  lineHeight: 1.2,
                  display: "block",
                  fontSize: "0.6875rem",
                }}
              >
                {activePreset.model}
              </Typography>
            )}
            {!isAssist && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{
                  lineHeight: 1.2,
                  display: "block",
                  fontSize: "0.6875rem",
                }}
              >
                {chartMeta ? `${chartMeta.slice_name || `#${chartId}`} · ` : ""}
                {activePreset.model}
              </Typography>
            )}
          </Box>
          {isAssist && !activeDoc && (
            <IconButton
              size="small"
              onClick={() => setConfigOpen(true)}
              sx={{ mr: 0.25 }}
            >
              <SettingsIcon sx={{ fontSize: 20 }} />
            </IconButton>
          )}
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* Content */}
        {isAssist && activeDoc ? (
          <DocViewer docKey={activeDoc} />
        ) : isAssist ? (
          <Box
            key={sessionKey}
            ref={scrollRef}
            sx={{
              flex: 1,
              overflow: "auto",
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
            }}
          >
            {/* Knowledge base (idle state) */}
            {messages.length === 0 && !chatLoading && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    px: 0.5,
                    mb: 0.5,
                  }}
                >
                  知识库
                </Typography>
                {knowledgeCards.map((card) => (
                  <Box
                    key={card.title}
                    onClick={() => handleCardClick(card)}
                    sx={{
                      display: "flex",
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: "background.paper",
                      border: "1px solid",
                      borderColor: "divider",
                      cursor: "pointer",
                      transition: transitions.boxShadow,
                      "&:hover": {
                        boxShadow:
                          "0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.10)",
                        borderColor: "primary.light",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        color: "primary.main",
                        display: "flex",
                        alignItems: "flex-start",
                        pt: 0.25,
                      }}
                    >
                      {card.icon}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, mb: 0.25 }}
                      >
                        {card.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {card.description}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                <Box sx={{ textAlign: "center", py: 2, mt: 1 }}>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      bgcolor: "action.hover",
                    }}
                  >
                    <SmartToyIcon
                      sx={{ fontSize: 16, color: "text.disabled" }}
                    />
                    <Typography color="text.disabled" variant="caption">
                      或直接输入问题开始对话
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} />
            ))}

            {/* Streaming response */}
            {chatLoading && currentText && (
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  justifyContent: "flex-start",
                }}
              >
                <SmartToyIcon
                  sx={{
                    fontSize: 20,
                    mt: 0.5,
                    color: "primary.main",
                    flexShrink: 0,
                  }}
                />
                <Box
                  sx={{
                    maxWidth: "92%",
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: "background.paper",
                    border: "1px solid",
                    borderColor: "divider",
                    fontSize: "0.8125rem",
                    lineHeight: 1.6,
                    wordBreak: "break-word",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    overflow: "hidden",
                    transition: "min-height 0.1s ease",
                  }}
                >
                  <LightMdRenderer content={currentText} />
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
                </Box>
              </Box>
            )}

            {/* Loading indicator */}
            {chatLoading && !currentText && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  pl: 0.5,
                }}
              >
                <SmartToyIcon
                  sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }}
                />
                <CircularProgress size={16} sx={{ color: "primary.main" }} />
              </Box>
            )}
          </Box>
        ) : (
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
                <Typography
                  color="error"
                  variant="body2"
                  sx={{ textAlign: "center" }}
                >
                  {insight.error}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={() =>
                    chartId != null &&
                    insight.generate(
                      chartId,
                      (filters as Record<string, unknown>) || {},
                    )
                  }
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
                          transform: thinkingCollapsed
                            ? "rotate(-90deg)"
                            : "none",
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
                    sx={{
                      fontSize: 20,
                      mt: 0.5,
                      color: "primary.main",
                      flexShrink: 0,
                    }}
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
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
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
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ContentCopy />}
                    onClick={handleCopyAll}
                  >
                    复制全部
                  </Button>
                  {!insight.loading && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<RefreshIcon />}
                      onClick={() =>
                        chartId != null &&
                        insight.generate(
                          chartId,
                          (filters as Record<string, unknown>) || {},
                        )
                      }
                    >
                      重新生成
                    </Button>
                  )}
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
                <AutoAwesome
                  sx={{ fontSize: 40, color: "text.disabled", opacity: 0.5 }}
                />
                <Typography
                  color="text.secondary"
                  variant="body2"
                  sx={{ mb: 1 }}
                >
                  AI 可基于图表数据进行分析
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AutoAwesome />}
                  onClick={() =>
                    chartId != null &&
                    insight.generate(
                      chartId,
                      (filters as Record<string, unknown>) || {},
                    )
                  }
                >
                  开始分析
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* Input area */}
        {isAssist ? (
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderTop: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            {suggestions.length > 0 && (
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                  mb: 1,
                }}
              >
                {suggestions.map((s, i) => (
                  <Chip
                    key={i}
                    label={s.label}
                    size="small"
                    onClick={() => startDrillDown(s.prompt)}
                    disabled={chatLoading}
                    sx={{ maxWidth: "100%" }}
                  />
                ))}
              </Box>
            )}
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
              <TextField
                size="small"
                fullWidth
                multiline
                maxRows={4}
                placeholder="输入你的问题…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={chatLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    fontSize: "0.8125rem",
                    bgcolor: "background.default",
                  },
                }}
              />
              {chatLoading ? (
                <IconButton color="error" onClick={chatStop} size="small">
                  <StopIcon />
                </IconButton>
              ) : (
                <IconButton
                  color="primary"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  size="small"
                  sx={{
                    transition: transitions.transform,
                    "&:hover": { transform: "scale(1.08)" },
                    "&:active": { transform: "scale(0.95)" },
                  }}
                >
                  <SendIcon />
                </IconButton>
              )}
            </Box>
          </Box>
        ) : (
          (insight.insightText || insight.loading) && (
            <Box
              sx={{
                p: 2,
                borderTop: "1px solid",
                borderColor: "divider",
                display: "flex",
                gap: 1,
              }}
            >
              <TextField
                size="small"
                fullWidth
                placeholder="输入追问内容…"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                disabled={insight.loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !insight.loading) {
                    e.preventDefault();
                    handleInsightSend();
                  }
                }}
              />
              {insight.loading ? (
                <IconButton color="error" onClick={insight.stop}>
                  <StopIcon />
                </IconButton>
              ) : (
                <IconButton
                  color="primary"
                  onClick={handleInsightSend}
                  disabled={!followUp.trim()}
                >
                  <SendIcon />
                </IconButton>
              )}
            </Box>
          )
        )}
      <AiConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} />
      </Box>
    </Drawer>
  );
}
