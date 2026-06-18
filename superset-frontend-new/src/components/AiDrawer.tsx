import { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Collapse from "@mui/material/Collapse";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import SmartToyIcon from "@mui/icons-material/SmartToy";
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
import SmartInput from "@/components/AiDrawer/SmartInput";
import MessageBubble from "@/components/AiDrawer/MessageBubble";
import DAILY_REPORT_PROMPT from "@/config/dailyReportPrompt";
import WEEKLY_REPORT_PROMPT from "@/config/weeklyReportPrompt";
import DRILL_DOWN_PROMPT from "@/config/drillDownPrompt";
import { queryDrillDown, fetchDrillDownData } from "@/api/drillDown";
import type { DrillDownQuery, DrillDownData } from "@/api/drillDown";
import DocViewer, { getDocTitle } from "@/components/DocViewer";
import type { ChartData, DashboardFilterValue } from "@/types/api";
import { useAiConfigStore } from "@/config/aiConfig";
import { useInsight } from "@/pages/Dashboard/hooks/useInsight";
import { useDrawerStore } from "@/store/drawerState";
import { useConversationStore } from "@/store/conversationStore";
import { useAiStream } from "@/hooks/useAiStream";
import { useNotificationStore } from "@/store/notificationStore";
import { blink } from "@/theme/keyframes";
import { transitions } from "@/theme/motion";

interface DrillDownSuggestion {
  id: string;
  label: string;
  prompt: string;
  query?: DrillDownQuery;
  loading?: boolean;
  analyzed?: boolean;
}

let _suggestionIdCounter = 0;
function nextSuggestionId(): string {
  return `dd-${Date.now().toString(36)}-${++_suggestionIdCounter}`;
}

type KnowledgeCard =
  | { kind: "prompt"; title: string; description: string; icon: React.ReactNode; prompt: string }
  | { kind: "doc"; title: string; description: string; icon: React.ReactNode; docKey: string };

interface AiDrawerProps {
  open: boolean;
  onClose: () => void;
  variant?: "assistant" | "insight";
  chartId?: number | null;
  chartMeta?: ChartData;
  filters?: Record<string, DashboardFilterValue>;
}

const knowledgeCards: KnowledgeCard[] = [
  {
    kind: "prompt",
    title: "生成日报",
    description: "生成昨日数据日报，含项目、渠道、媒体多维分析",
    icon: <ArticleIcon sx={{ fontSize: 24 }} />,
    prompt: DAILY_REPORT_PROMPT,
  },
  {
    kind: "prompt",
    title: "生成周报",
    description: "生成周对比分析报告，含项目、媒体、变化趋势",
    icon: <CalendarMonthIcon sx={{ fontSize: 24 }} />,
    prompt: WEEKLY_REPORT_PROMPT,
  },
  {
    kind: "doc",
    title: "使用手册",
    description: "平台功能、操作指南与最佳实践",
    icon: <MenuBookIcon sx={{ fontSize: 24 }} />,
    docKey: "manual",
  },
  {
    kind: "doc",
    title: "技术架构",
    description: "系统架构、组件与部署架构说明",
    icon: <AccountTreeIcon sx={{ fontSize: 24 }} />,
    docKey: "architecture",
  },
  {
    kind: "prompt",
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

  const suggestions: DrillDownSuggestion[] = [];
  const parts = block.split(/\n(?=[-*]\s)/);

  for (const part of parts) {
    const lines = part.split("\n");
    const labelLine = lines[0].replace(/^[-*]\s+/, "").trim();
    if (labelLine.length <= 5 || labelLine.startsWith("```") || labelLine.startsWith("---")) continue;

    const jsonMatch = part.match(/```json\s*([\s\S]*?)```/);
    let query: DrillDownQuery | undefined;
    if (jsonMatch) {
      try {
        query = JSON.parse(jsonMatch[1]);
      } catch { /* ignore malformed JSON */ }
    }

    suggestions.push({ id: nextSuggestionId(), label: labelLine, prompt: labelLine, query });
  }

  return suggestions;
}

function stripDrillDownSection(text: string): string {
  const idx = text.lastIndexOf(DRILL_DOWN_MARKER);
  if (idx === -1) return text;
  return text.slice(0, idx).trim();
}

export default function AiDrawer({
  open,
  onClose,
  variant = "assistant",
  chartId,
  chartMeta,
  filters,
}: AiDrawerProps) {
  const { stream, stop: streamStop, streaming } = useAiStream();
  const notify = useNotificationStore((s) => s.notify);
  const { activePreset } = useAiConfigStore();
  const drawerWidth = useDrawerStore((s) => s.drawerWidth);
  const setDrawerWidth = useDrawerStore((s) => s.setDrawerWidth);
  const openAiDrawer = useDrawerStore((s) => s.openAiDrawer);
  const insight = useInsight();

  const threads = useConversationStore((s) => s.threads);
  const activeThreadId = useConversationStore((s) => s.activeThreadId);
  const createThread = useConversationStore((s) => s.createThread);
  const addMessage = useConversationStore((s) => s.addMessage);
  const activeThread = useConversationStore((s) => s.getActiveThread());

  const [configOpen, setConfigOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true);
  const [suggestions, setSuggestions] = useState<DrillDownSuggestion[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(open);
  const isAssist = variant === "assistant";

  const [streamingText, setStreamingText] = useState("");
  const [dataLoading, setDataLoading] = useState(false);

  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const dateRangeRef = useRef("");
  const CACHE_TTL = 5 * 60 * 1000;
  const reportCacheRef = useRef<{ timestamp: number; summaryContext: string; dateRange: string } | null>(null);
  const DRILLDOWN_CACHE_TTL = 5 * 60 * 1000;
  const drillDownCacheRef = useRef<{ timestamp: number; summaryContext: string; dateRange: string } | null>(null);

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
        setThinkingCollapsed(true);
      }
    }
    prevOpenRef.current = open;
  }, [open, insight, isAssist]);

  useEffect(() => {
    if (insight.loading && !isAssist) {
      setThinkingCollapsed(false);
    }
  }, [insight.loading, isAssist]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeThread?.messages, streamingText]);

  const ensureThread = useCallback(() => {
    if (!activeThreadId) {
      return createThread();
    }
    return activeThreadId;
  }, [activeThreadId, createThread]);

  const handleSend = useCallback(
    async (text: string, keepSuggestions?: boolean) => {
      const threadId = ensureThread();
      addMessage(threadId, "user", { type: "text", body: text });
      if (!keepSuggestions) setSuggestions([]);
      setStreamingText("");

      try {
        const history = (activeThread?.messages ?? [])
          .filter((m) => m.content.type === "text")
          .map((m) => ({
            role: m.role,
            content: (m.content as { type: "text"; body: string }).body,
          }));

        const full = await stream(text, history, (t) => setStreamingText(t), true);
        setStreamingText("");
        addMessage(threadId, "assistant", { type: "text", body: full });

        const drillDowns = extractDrillDownSuggestions(full);
        if (drillDowns.length > 0) {
          setSuggestions(drillDowns);
        }
      } catch (e: unknown) {
        if ((e as Error).name === "AbortError") return;
        setStreamingText("");
        addMessage(threadId, "assistant", {
          type: "error",
          message: "请求失败，请重试",
          retryable: true,
        });
      }
    },
    [ensureThread, addMessage, stream, activeThread],
  );

  const handleRetry = useCallback(() => {
    const thread = activeThread;
    if (!thread || thread.messages.length === 0) return;
    const lastMsg = thread.messages[thread.messages.length - 1];
    const prevMsg = thread.messages[thread.messages.length - 2];
    if (lastMsg.role === "assistant") {
      useConversationStore.getState().addMessage(thread.id, "user", {
        type: "text",
        body: prevMsg?.content.type === "text" ? (prevMsg.content as { type: "text"; body: string }).body : "",
      });
    }
  }, [activeThread]);

  const handleCardClick = (card: KnowledgeCard) => {
    if (card.kind === "doc") {
      setActiveDoc(card.docKey);
    } else {
      if (card.title === "生成日报") {
        startDailyReport(card.prompt);
      } else if (card.title === "生成周报") {
        startWeeklyReport(card.prompt);
      } else {
        startNewChat(card.prompt);
      }
    }
  };

  const startNewChat = async (text: string) => {
    const threadId = createThread();
    addMessage(threadId, "user", { type: "text", body: text });
    setSuggestions([]);
    setStreamingText("");

    try {
      const full = await stream(text, [], (t) => setStreamingText(t));
      setStreamingText("");
      addMessage(threadId, "assistant", { type: "text", body: full });

      const drillDowns = extractDrillDownSuggestions(full);
      if (drillDowns.length > 0) {
        setSuggestions(drillDowns);
      }
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      setStreamingText("");
      addMessage(threadId, "assistant", {
        type: "error",
        message: "请求失败，请重试",
        retryable: true,
      });
    }
  };

  const startReport = useCallback(
    async (
      label: string,
      placeholder: string,
      promptTemplate: string,
      fetchData: () => Promise<{ summaryContext: string; dateRange: string }>,
    ) => {
      const threadId = createThread();
      addMessage(threadId, "user", { type: "text", body: placeholder });
      setStreamingText("");
      setDataLoading(true);

      try {
        const data = await fetchData();
        dateRangeRef.current = data.dateRange;

        const today = new Date().toISOString().slice(0, 10);
        const dateInjectedTemplate = promptTemplate.replace(
          "{{REPORT_DATE}}",
          today,
        );

        const fullPrompt = [
          dateInjectedTemplate,
          "",
          "### 从 Superset 查询到的实际数据",
          "",
          data.summaryContext,
          "",
          `请根据以上实际数据生成完整${label}。`,
        ].join("\n");

        const full = await stream(fullPrompt, [], (t) => setStreamingText(t));
        setStreamingText("");
        setDataLoading(false);
        addMessage(threadId, "assistant", {
          type: "text",
          body: stripDrillDownSection(full),
        });

        setSuggestions(extractDrillDownSuggestions(full));
      } catch {
        setStreamingText("");
        setDataLoading(false);
        setSuggestions([]);
        addMessage(threadId, "assistant", {
          type: "error",
          message: "数据查询失败，请稍后重试。如果问题持续，请检查 Superset 后端是否正常运行。",
          retryable: true,
        });
      }
    },
    [createThread, addMessage, stream],
  );

  const startDailyReport = async (promptTemplate: string) => {
    await startReport(
      "日报",
      "📊 正在从数据集查询昨日数据...",
      promptTemplate,
      async () => {
        const { fetchDailyReportData } = await import("@/api/dailyReport");
        const data = await fetchDailyReportData();
        return { summaryContext: data.summaryContext, dateRange: "昨日" };
      },
    );
  };

  const startWeeklyReport = async (promptTemplate: string) => {
    const cached = reportCacheRef.current;
    const now = Date.now();

    await startReport(
      "周报",
      cached && now - cached.timestamp < CACHE_TTL
        ? "📊 正在生成周报（使用缓存数据）..."
        : "📊 正在从数据集查询两周数据...",
      promptTemplate,
      async () => {
        if (cached && now - cached.timestamp < CACHE_TTL) {
          return { summaryContext: cached.summaryContext, dateRange: cached.dateRange };
        }
        const { fetchWeeklyReportData } = await import("@/api/weeklyReport");
        const data = await fetchWeeklyReportData();
        const dateRange = `${data.week1Label}, ${data.week2Label}`;
        reportCacheRef.current = { timestamp: Date.now(), summaryContext: data.summaryContext, dateRange };
        return { summaryContext: data.summaryContext, dateRange };
      },
    );
  };

  const startDrillDown = async (suggestion: DrillDownSuggestion) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === suggestion.id ? { ...s, loading: true } : s)),
    );

    setDataLoading(true);
    const threadId = createThread();
    addMessage(threadId, "user", {
      type: "text",
      body: `📊 钻取分析: ${suggestion.label}`,
    });

    try {
      let data: DrillDownData;
      if (suggestion.query) {
        data = await queryDrillDown(suggestion.query);
      } else {
        const cached = drillDownCacheRef.current;
        if (cached && Date.now() - cached.timestamp < DRILLDOWN_CACHE_TTL) {
          data = { summaryContext: cached.summaryContext, dateRange: cached.dateRange };
        } else {
          data = await fetchDrillDownData();
          drillDownCacheRef.current = { timestamp: Date.now(), ...data };
        }
      }

      dateRangeRef.current = data.dateRange;

      setStreamingText("");
      const dateInjectedPrompt = DRILL_DOWN_PROMPT.replace("{dateRange}", data.dateRange);
      const fullPrompt = [
        dateInjectedPrompt,
        "",
        "### 钻取明细数据",
        "",
        data.summaryContext,
        "",
        `请根据以上数据，完成以下钻取分析任务：${suggestion.prompt}`,
      ].join("\n");

      const full = await stream(fullPrompt, [], (t) => setStreamingText(t));
      setStreamingText("");
      addMessage(threadId, "assistant", { type: "text", body: stripDrillDownSection(full) });

      const secondary = extractDrillDownSuggestions(full);
      if (secondary.length > 0) {
        setSuggestions(secondary);
      }
    } catch {
      setStreamingText("");
      addMessage(threadId, "assistant", {
        type: "error",
        message: "钻取数据查询失败，请稍后重试",
        retryable: true,
      });
    } finally {
      setSuggestions((prev) =>
        prev.map((s) => (s.id === suggestion.id ? { ...s, loading: false } : s)),
      );
      setDataLoading(false);
    }
  };

  const handleClose = () => {
    if (isAssist) {
      setActiveDoc(null);
      setSuggestions([]);
      setStreamingText("");
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
    <Box
      sx={{
        position: "absolute",
        right: 0,
        top: 0,
        height: "100%",
        width: open ? (typeof drawerWidth === "number" ? drawerWidth : 640) : 0,
        zIndex: (theme) => theme.zIndex.drawer + 2,
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "width 350ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 300ms ease",
        pointerEvents: open ? "auto" : "none",
        boxShadow: open ? "-2px 0 8px rgba(0,0,0,0.08)" : "none",
        borderLeft: "1px solid",
        borderColor: "divider",
        borderTopLeftRadius: 12,
        borderBottomLeftRadius: 12,
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
            transition: (t) =>
              t.transitions.create("background-color", { duration: t.transitions.duration.shorter }),
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
          ) : isAssist && threads.length > 0 ? (
            <IconButton
              size="small"
              onClick={() => {
                createThread();
                setSuggestions([]);
                setStreamingText("");
              }}
              sx={{ mr: 0.5 }}
            >
              <ArrowBackIcon sx={{ fontSize: 20 }} />
            </IconButton>
          ) : !isAssist ? (
            <IconButton
              size="small"
              onClick={() => openAiDrawer("assistant")}
              sx={{ mr: 0.5 }}
            >
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
            {activeThread?.context?.dashboardId && (
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
                仪表板: #{activeThread.context.dashboardId}
              </Box>
            )}

            {/* Knowledge base (idle state) */}
            {(!activeThread || activeThread.messages.length === 0) && !streaming && (
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
            {activeThread?.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                onRetry={msg.content.type === "error" ? handleRetry : undefined}
              />
            ))}

            {/* Streaming response */}
            {streaming && streamingText && (
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
                  }}
                >
                  <LightMdRenderer content={streamingText} />
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

            {/* Data loading indicator */}
            {dataLoading && !streaming && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, pl: 0.5 }}>
                <CircularProgress size={16} sx={{ color: "primary.main" }} />
              </Box>
            )}

            {/* Loading indicator (no text yet) */}
            {streaming && !streamingText && (
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
            {chartMeta && (
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
                      filters || {},
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
                          filters || {},
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
                      filters || {},
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
                  mb: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                <List dense disablePadding>
                  {suggestions.map((s, i) => (
                    <ListItemButton
                      key={i}
                      divider={i < suggestions.length - 1}
                      disabled={streaming || dataLoading}
                      onClick={() => startDrillDown(s)}
                      sx={{ py: 1, px: 1.5 }}
                    >
                      <AutoAwesome sx={{ fontSize: 18, color: "primary.main", mr: 1 }} />
                      <ListItemText primary={s.label} />
                      <PlayArrowIcon sx={{ fontSize: 16, color: "action.active", ml: 1 }} />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}
            <SmartInput
              onSend={handleSend}
              onStop={streamStop}
              streaming={streaming}
            />
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
              <Box sx={{ flex: 1 }}>
                <SmartInput
                  onSend={(text) => {
                    if (insight.loading) return;
                    insight.sendMessage(text);
                  }}
                  onStop={insight.stop}
                  streaming={insight.loading}
                />
              </Box>
            </Box>
          )
        )}
        <AiConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} />
      </Box>
    </Box>
  );
}
