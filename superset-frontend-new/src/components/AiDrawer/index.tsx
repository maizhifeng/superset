import { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";

import ArticleIcon from "@mui/icons-material/Article";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import StorageIcon from "@mui/icons-material/Storage";
import AiConfigDialog from "@/components/AiConfigDialog";
import DocViewer from "@/components/DocViewer";
import { getDocTitle } from "@/components/docCatalog";
import SmartInput from "@/components/AiDrawer/SmartInput";
import { queryDrillDown, fetchDrillDownData } from "@/api/drillDown";
import type { DrillDownQuery, DrillDownData } from "@/api/drillDown";
import { useAiConfigStore } from "@/config/aiConfig";
import { useInsight } from "@/pages/Dashboard/hooks/useInsight";
import { useDrawerStore } from "@/store/drawerState";
import { useConversationStore } from "@/store/conversationStore";
import { useAiStream } from "@/hooks/useAiStream";
import { useNotificationStore } from "@/store/notificationStore";
import AiDrawerHeader from "./AiDrawerHeader";
import AssistantContent from "./AssistantContent";
import InsightContent from "./InsightContent";
import SuggestionList from "./SuggestionList";
import { useAiDrawerResize } from "./useAiDrawerResize";
import type { DrillDownSuggestion, KnowledgeCard } from "@/types/ai";
import type { AiDrawerProps } from "./types";
import DAILY_REPORT_PROMPT from "@/config/dailyReportPrompt";
import WEEKLY_REPORT_PROMPT from "@/config/weeklyReportPrompt";
import DRILL_DOWN_PROMPT from "@/config/drillDownPrompt";

let _suggestionIdCounter = 0;
function nextSuggestionId(): string {
  return `dd-${Date.now().toString(36)}-${++_suggestionIdCounter}`;
}

const DRILL_DOWN_MARKER = "DRILL_DOWN_SUGGESTIONS";

function extractDrillDownSuggestions(text: string): DrillDownSuggestion[] {
  const idx = text.lastIndexOf(DRILL_DOWN_MARKER);
  if (idx === -1) return extractInlineJsonSuggestions(text);

  const block = text.slice(idx + DRILL_DOWN_MARKER.length).trim();
  const suggestions: DrillDownSuggestion[] = [];
  const parts = block.split(/\n(?=[-*]\s)/);
  for (const part of parts) {
    const lines = part.split("\n");
    const labelLine = lines[0].replace(/^[-*]\s+/, "").trim();
    if (
      labelLine.length <= 5 ||
      labelLine.startsWith("```") ||
      labelLine.startsWith("---")
    )
      continue;
    const jsonMatch = part.match(/```json\s*([\s\S]*?)```/);
    let query: DrillDownQuery | undefined;
    if (jsonMatch) {
      try {
        query = JSON.parse(jsonMatch[1]);
      } catch {
        /* ignore */
      }
    }
    suggestions.push({
      id: nextSuggestionId(),
      label: labelLine,
      prompt: labelLine,
      query,
    });
  }
  return suggestions;
}

function extractInlineJsonSuggestions(text: string): DrillDownSuggestion[] {
  const suggestions: DrillDownSuggestion[] = [];
  const pattern =
    /([^\n`]*?针对[^\n`]*?)\s*`{2,3}json\s*(\{(?:"columns"|"metrics")[\s\S]*?\})\s*`{2,3}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const label = match[1].replace(/^[-*\s]+/, "").trim();
    if (label.length <= 5) continue;
    let query: DrillDownQuery | undefined;
    try {
      query = JSON.parse(match[2]);
    } catch {
      /* ignore */
    }
    suggestions.push({ id: nextSuggestionId(), label, prompt: label, query });
  }
  return suggestions;
}

function stripDrillDownSection(text: string): string {
  let result = text;
  const idx = result.lastIndexOf(DRILL_DOWN_MARKER);
  if (idx !== -1) {
    result = result.slice(0, idx).trim();
  }
  result = stripInlineJsonQueries(result);
  return result;
}

function stripInlineJsonQueries(text: string): string {
  const result = text.replace(
    /`{2,3}json\s*(\{(?:[^{}]|\{[^{}]*\})*\})\s*`{2,3}/g,
    (match, json) => {
      if (json.includes('"columns"') || json.includes('"metrics"')) return "";
      return match;
    },
  );
  return result.replace(/\n{3,}/g, "\n\n").trim();
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
  const activeThread = useConversationStore((s) => s.getActiveThread()) ?? null;

  const [configOpen, setConfigOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DrillDownSuggestion[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(open);
  const isAssist = variant === "assistant";
  const dateRangeRef = useRef("");
  const CACHE_TTL = 5 * 60 * 1000;
  const reportCacheRef = useRef<{
    timestamp: number;
    summaryContext: string;
    dateRange: string;
  } | null>(null);
  const DRILLDOWN_CACHE_TTL = 5 * 60 * 1000;
  const drillDownCacheRef = useRef<{
    timestamp: number;
    summaryContext: string;
    dateRange: string;
  } | null>(null);

  const handleMouseDown = useAiDrawerResize(
    typeof drawerWidth === "number" ? drawerWidth : 640,
    setDrawerWidth,
  );

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (!isAssist) {
        insight.clear();
      }
    }
    prevOpenRef.current = open;
  }, [open, insight, isAssist]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeThread?.messages, streamingText]);

  const ensureThread = useCallback(() => {
    if (!activeThreadId) return createThread();
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
        const full = await stream(
          text,
          history,
          (t) => setStreamingText(stripDrillDownSection(t)),
          true,
        );
        setStreamingText("");
        addMessage(threadId, "assistant", {
          type: "text",
          body: stripDrillDownSection(full),
        });
        const drillDowns = extractDrillDownSuggestions(full);
        if (drillDowns.length > 0) setSuggestions(drillDowns);
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
        body: prevMsg?.content.type === "text" ? prevMsg.content.body : "",
      });
    }
  }, [activeThread]);

  const handleCardClick = (card: KnowledgeCard) => {
    if (card.kind === "doc") {
      setActiveDoc(card.docKey);
    } else if (card.title === "生成日报") {
      void startReport(
        "日报",
        "📊 正在从数据集查询昨日数据...",
        card.prompt,
        async () => {
          const { fetchDailyReportData } = await import("@/api/dailyReport");
          const data = await fetchDailyReportData();
          return { summaryContext: data.summaryContext, dateRange: "昨日" };
        },
      );
    } else if (card.title === "生成周报") {
      const cached = reportCacheRef.current;
      const now = Date.now();
      void startReport(
        "周报",
        cached && now - cached.timestamp < CACHE_TTL
          ? "📊 正在生成周报（使用缓存数据）..."
          : "📊 正在从数据集查询两周数据...",
        card.prompt,
        async () => {
          if (cached && now - cached.timestamp < CACHE_TTL) {
            return {
              summaryContext: cached.summaryContext,
              dateRange: cached.dateRange,
            };
          }
          const { fetchWeeklyReportData } = await import("@/api/weeklyReport");
          const data = await fetchWeeklyReportData();
          const dateRange = `${data.week1Label}, ${data.week2Label}`;
          reportCacheRef.current = {
            timestamp: Date.now(),
            summaryContext: data.summaryContext,
            dateRange,
          };
          return { summaryContext: data.summaryContext, dateRange };
        },
      );
    } else {
      void startNewChat(card.prompt);
    }
  };

  const startNewChat = async (text: string) => {
    const threadId = createThread();
    addMessage(threadId, "user", { type: "text", body: text });
    setSuggestions([]);
    setStreamingText("");
    try {
      const full = await stream(text, [], (t) =>
        setStreamingText(stripDrillDownSection(t)),
      );
      setStreamingText("");
      addMessage(threadId, "assistant", {
        type: "text",
        body: stripDrillDownSection(full),
      });
      const drillDowns = extractDrillDownSuggestions(full);
      if (drillDowns.length > 0) setSuggestions(drillDowns);
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
        const full = await stream(fullPrompt, [], (t) =>
          setStreamingText(stripDrillDownSection(t)),
        );
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
          message:
            "数据查询失败，请稍后重试。如果问题持续，请检查 Superset 后端是否正常运行。",
          retryable: true,
        });
      }
    },
    [createThread, addMessage, stream],
  );

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
          data = {
            summaryContext: cached.summaryContext,
            dateRange: cached.dateRange,
          };
        } else {
          data = await fetchDrillDownData();
          drillDownCacheRef.current = { timestamp: Date.now(), ...data };
        }
      }
      dateRangeRef.current = data.dateRange;
      setStreamingText("");
      const dateInjectedPrompt = DRILL_DOWN_PROMPT.replace(
        "{dateRange}",
        data.dateRange,
      );
      const fullPrompt = [
        dateInjectedPrompt,
        "",
        "### 钻取明细数据",
        "",
        data.summaryContext,
        "",
        `请根据以上数据，完成以下钻取分析任务：${suggestion.prompt}`,
      ].join("\n");
      const full = await stream(fullPrompt, [], (t) =>
        setStreamingText(stripDrillDownSection(t)),
      );
      setStreamingText("");
      addMessage(threadId, "assistant", {
        type: "text",
        body: stripDrillDownSection(full),
      });
      const secondary = extractDrillDownSuggestions(full);
      if (secondary.length > 0) setSuggestions(secondary);
    } catch {
      setStreamingText("");
      addMessage(threadId, "assistant", {
        type: "error",
        message: "钻取数据查询失败，请稍后重试",
        retryable: true,
      });
    } finally {
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === suggestion.id ? { ...s, loading: false } : s,
        ),
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

  const subtitle = isAssist
    ? !activeDoc
      ? activePreset.model
      : undefined
    : chartMeta
      ? `${chartMeta.slice_name || `#${chartId}`} · ${activePreset.model}`
      : activePreset.model;

  return (
    <Box
      sx={{
        width: open ? (typeof drawerWidth === "number" ? drawerWidth : 640) : 0,
        flexShrink: 0,
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "width 350ms cubic-bezier(0.4, 0, 0.2, 1)",
        borderLeft: "1px solid",
        borderColor: "divider",
        visibility: open ? "visible" : "hidden",
      }}
    >
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Drag handle */}
        <Box
          onMouseDown={handleMouseDown}
          sx={{
            width: 4,
            flexShrink: 0,
            cursor: "ew-resize",
            "&:hover": { bgcolor: "primary.main", opacity: 0.5 },
            transition: (t) =>
              t.transitions.create("background-color", {
                duration: t.transitions.duration.shorter,
              }),
          }}
        />

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <AiDrawerHeader
            title={title}
            subtitle={subtitle}
            showSettings={isAssist && !activeDoc}
            showBack={isAssist ? !!(activeDoc || threads.length > 0) : true}
            onBack={() => {
              if (isAssist && activeDoc) setActiveDoc(null);
              else if (isAssist) {
                createThread();
                setSuggestions([]);
                setStreamingText("");
              } else openAiDrawer("assistant");
            }}
            onSettings={() => setConfigOpen(true)}
            onClose={handleClose}
          />

          {isAssist && activeDoc ? (
            <DocViewer docKey={activeDoc} />
          ) : isAssist ? (
            <AssistantContent
              ref={scrollRef}
              activeThread={activeThread}
              knowledgeCards={knowledgeCards}
              streaming={streaming}
              streamingText={streamingText}
              dataLoading={dataLoading}
              onCardClick={handleCardClick}
              onRetry={handleRetry}
            />
          ) : (
            <InsightContent
              insight={insight}
              chartId={chartId}
              chartMeta={chartMeta}
              onCopy={() => void handleCopyAll()}
              onRefresh={() => {
                if (chartId != null)
                  void insight.generate(chartId, filters || {});
              }}
            />
          )}

          {/* Input area */}
          {isAssist && (
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderTop: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
              }}
            >
              <SuggestionList
                suggestions={suggestions}
                disabled={streaming || dataLoading}
                onSelect={(s) => void startDrillDown(s)}
              />
              <SmartInput
                onSend={(t) => void handleSend(t)}
                onStop={streamStop}
                streaming={streaming}
              />
            </Box>
          )}

          <AiConfigDialog
            open={configOpen}
            onClose={() => setConfigOpen(false)}
          />
        </Box>
      </Box>
    </Box>
  );
}
