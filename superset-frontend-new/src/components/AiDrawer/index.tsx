import { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";

import ArticleIcon from "@mui/icons-material/Article";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import StorageIcon from "@mui/icons-material/Storage";
import DocViewer from "@/components/DocViewer";
import { getDocTitle } from "@/components/docCatalog";
import SmartInput from "@/components/AiDrawer/SmartInput";
import { useAiConfigStore } from "@/config/aiConfig";
import { useInsight } from "@/pages/Dashboard/hooks/useInsight";
import { useDrawerStore } from "@/store/drawerState";
import { useNotificationStore } from "@/store/notificationStore";
import { usePiAgent } from "@/hooks/usePiAgent";
import { useAgentStore } from "@/store/agentStore";
import AiDrawerHeader from "./AiDrawerHeader";
import AssistantContent from "./AssistantContent";
import InsightContent from "./InsightContent";
import { useAiDrawerResize } from "./useAiDrawerResize";
import type { KnowledgeCard } from "@/types/ai";
import type { AiDrawerProps } from "./types";

const DAILY_REPORT_PROMPT =
  "请生成昨日数据日报。先调用 get_dataset_schema 获取当前数据集的可用维度列和指标，然后由你自行决定查询方式与报告结构，与昨日数据对比前日变化，输出数据有据、结论清晰的完整日报。日报按以下四个视角组织，每个视角输出近 7 天重点指标变化趋势（结合昨日 vs 前日对比，指出趋势与异常），可补充你认为有价值的分析角度：1. 平台维度（新增进入、消耗、充值流水）；2. 主游戏维度（新增进入、消耗、cpa、ltv_1~ltv_7）；3. 重点主游戏下渠道商维度（按消耗或新增进入排名靠前的主游戏，其下各渠道商）；4. 平台+媒体维度。指标与列名必须逐字使用 schema 中的确切名称，不得改写（如「新增进入」不能写成「新增用户」）。禁止 LaTeX。";

const WEEKLY_REPORT_PROMPT =
  "请生成上周数据周报。先调用 get_dataset_schema 获取当前数据集的可用维度列和指标，然后由你自行决定分析维度、对比方式与报告结构（可选角度如项目、渠道商、媒体、平台、团队、趋势等，选择你认为最有洞察的），与上周数据对比前周变化，输出数据有据、结论清晰的完整周报。禁止 LaTeX。";

const DICT_PROMPT =
  "请介绍当前广告投放数据集的数据字典：调用 get_dataset_schema 获取可用的维度列和指标，说明各字段的业务含义（日期、主游戏、渠道商、媒体、平台、团队、消耗、新增进入、CPA、ROI、LTV 等）。";

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
    prompt: DICT_PROMPT,
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
  const pi = usePiAgent();
  const notify = useNotificationStore((s) => s.notify);
  const { activePreset } = useAiConfigStore();
  const drawerWidth = useDrawerStore((s) => s.drawerWidth);
  const setDrawerWidth = useDrawerStore((s) => s.setDrawerWidth);
  const openAiDrawer = useDrawerStore((s) => s.openAiDrawer);
  const insight = useInsight();
  const sessions = useAgentStore((s) => s.sessions);
  const createSession = useAgentStore((s) => s.createSession);
  const activeSession = useAgentStore((s) => s.getActiveSession()) ?? null;

  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(open);
  const isAssist = variant === "assistant";

  const handleMouseDown = useAiDrawerResize(
    typeof drawerWidth === "number" ? drawerWidth : 640,
    setDrawerWidth,
  );

  useEffect(() => {
    if (!isAssist) return;
    if (open) {
      const store = useAgentStore.getState();
      let sid = store.activeSessionId;
      const exists = store.sessions.some((s) => s.id === sid);
      if (!sid || !exists) sid = store.createSession();
      pi.connect(sid);
    } else {
      pi.disconnect();
    }
    // pi is intentionally omitted: connect/disconnect follows drawer lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAssist]);

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
  }, [
    activeSession?.messages,
    pi.currentText,
    pi.currentThinking,
    pi.turnSteps,
  ]);

  const ensureSession = useCallback(() => {
    const store = useAgentStore.getState();
    let sid = store.activeSessionId;
    if (!sid || !store.sessions.some((s) => s.id === sid)) {
      sid = store.createSession();
    }
    pi.connect(sid);
    return sid;
  }, [pi]);

  const handleSend = useCallback(
    (text: string) => {
      ensureSession();
      pi.sendMessage(text);
    },
    [ensureSession, pi],
  );

  const handleCardClick = (card: KnowledgeCard) => {
    if (card.kind === "doc") {
      setActiveDoc(card.docKey);
      return;
    }
    ensureSession();
    pi.sendMessage(card.prompt);
  };

  const handleClose = () => {
    if (isAssist) {
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

  const subtitle = isAssist
    ? !activeDoc
      ? pi.currentModel
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
            showBack={isAssist ? !!(activeDoc || sessions.length > 0) : true}
            onBack={() => {
              if (isAssist && activeDoc) setActiveDoc(null);
              else if (isAssist) {
                createSession();
                ensureSession();
              } else openAiDrawer("assistant");
            }}
            onClose={handleClose}
          />

          {isAssist && activeDoc ? (
            <DocViewer docKey={activeDoc} />
          ) : isAssist ? (
            <AssistantContent
              ref={scrollRef}
              activeSession={activeSession}
              knowledgeCards={knowledgeCards}
              streaming={pi.isRunning}
              streamingText={pi.currentText}
              thinking={pi.currentThinking}
              thinkingDone={pi.isThinkingDone}
              turnSteps={pi.turnSteps}
              isConnected={pi.isConnected}
              onCardClick={handleCardClick}
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
              <SmartInput
                onSend={(t) => handleSend(t)}
                onStop={pi.abort}
                streaming={pi.isRunning}
                currentModel={pi.currentModel}
                modelList={pi.modelList}
                onModelChange={pi.setModel}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
