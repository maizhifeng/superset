import { WebSocket } from "ws";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { SessionStore } from "./session-store.js";
import { getWsAuthToken } from "./session-store.js";
import { executeQuerySuperset, getSchema } from "./tools/querySuperset.js";
import { buildChartInsightPrompt } from "./tools/chartData.js";
import { loadAgentConfig, type AgentConfig, type ReportPerspective } from "./agent-config.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { tryRenderStructuredContent, buildFallbackOutput } from "./renderer.js";
import {
  CHART_INSIGHT_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  DATA_DICT_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
} from "./prompts.js";
import { saveSessionMessages, type StoredMessage } from "./store.js";

// ── Event sender abstraction ────────────────────────────────────
export interface AgentEventSender {
  (event: {
    type: string;
    storeSessionId?: string;
    [key: string]: unknown;
  }): void;
}

// ── Per-intent reasoning ────────────────────────────────────────
const REASONING_INTENT_PATTERNS = [
  /(?:日报|周报|月报|报表|报告)/,
  /(?:对比|环比|同比|vs|与上[周月天]|较上[周月天])/,
  /(?:深度|详细)分析/,
  /(?:计算|换算|变化率|占比|汇总)/,
  /(?:趋势|走势|预测|预测)/,
  /(?:复盘|总结|归因|排查|诊断)/,
];

/**
 * Decide whether a prompt benefits from chain-of-thought reasoning.
 * Report/comparison/multi-step-computation requests get reasoning enabled;
 * simple lookups stay fast and deterministic.
 */
export function isReasoningIntent(message: string): boolean {
  return REASONING_INTENT_PATTERNS.some((re) => re.test(message));
}

const REPORT_INTENT_PATTERNS = [/(?:日报|周报|月报|报表|报告)/];

/**
 * Whether the prompt asks for a periodic report (daily/weekly/monthly).
 * Report requests are served by fetching every configured analysis
 * perspective directly (deterministic data acquisition) and handing the
 * data to the built-in agent to write the report.
 */
export function isReportIntent(message: string): boolean {
  return REPORT_INTENT_PATTERNS.some((re) => re.test(message));
}

const DICT_INTENT_PATTERNS = [/(?:数据字典|字段定义|字段含义|数据模型)/];

/**
 * Whether the prompt asks for the dataset data dictionary. Dictionary
 * requests are served by injecting the fetched dataset schema (dimension
 * columns and metric definitions) into the prompt.
 */
export function isDictIntent(message: string): boolean {
  return DICT_INTENT_PATTERNS.some((re) => re.test(message));
}

// ── Deterministic report data fetching ──────────────────────────
/**
 * Extract cell rows from a `toMarkdownTable` result. Both producer and
 * consumer live in this codebase, so the pipe-separated layout is stable.
 * Returns an empty array for error strings / non-table content.
 */
export function parseMarkdownRows(md: string): string[][] {
  const rows: string[][] = [];
  for (const line of md.split("\n")) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.every((c) => /^---$/.test(c))) continue; // separator line
    rows.push(cells);
  }
  // rows[0] is the header
  return rows.slice(1);
}

/**
 * Fetch every configured analysis perspective through the Superset chart
 * data API. Emits tool-execution progress events so the UI shows each
 * perspective query, then returns the combined markdown data.
 *
 * Perspectives with `topBy`/`topMetric`/`topN` run a two-step drilldown:
 * first the top-N values of `topBy` by `topMetric`, then the perspective
 * query filtered to those values (IN filter). This bounds the injected
 * data volume and matches the perspective description.
 */
export async function fetchReportData(
  config: AgentConfig,
  userId: string,
  emit: AgentEventSender,
  storeSessionId: string,
  authToken?: string,
): Promise<string> {
  const { perspectives, defaultTimeRange } = config.report;
  const results: string[] = [];

  for (let i = 0; i < perspectives.length; i++) {
    const p = perspectives[i];
    const args: Record<string, unknown> = {
      columns: p.columns,
      metrics: p.metrics,
      time_range: defaultTimeRange,
    };
    if (p.orderby) args.orderby = p.orderby;
    if (p.showAll) args.show_all = true;
    if (p.rowLimit) args.row_limit = p.rowLimit;

    let data: string;
    try {
      if (p.topBy && p.topMetric && p.topN) {
        data = await fetchTopDrilldown(
          p,
          defaultTimeRange,
          userId,
          emit,
          storeSessionId,
          authToken,
          i,
        );
      } else {
        const toolCallId = `direct-${Date.now()}-${i}`;
        emit({
          type: "tool_execution_start",
          storeSessionId,
          toolCallId,
          toolName: "query_superset",
          args,
        });
        data = await executeQuerySuperset(args, userId, undefined, authToken);
        emit({
          type: "tool_execution_end",
          storeSessionId,
          toolCallId,
          toolName: "query_superset",
          result: data,
        });
      }
    } catch (err) {
      data = `查询失败: ${(err as Error).message ?? String(err)}`;
      logger.warn(
        "query",
        `direct perspective query failed (${p.name}): ${(err as Error).message ?? String(err)}`,
      );
    }

    results.push(`### 视角 ${i + 1}：${p.name}（${p.description}）\n${data}`);
  }

  return results.join("\n\n");
}

async function fetchTopDrilldown(
  p: ReportPerspective,
  defaultTimeRange: string,
  userId: string,
  emit: AgentEventSender,
  storeSessionId: string,
  authToken: string | undefined,
  perspectiveIndex: number,
): Promise<string> {
  const topBy = p.topBy as string;
  const topMetric = p.topMetric as string;
  const topN = p.topN as number;

  // Step 1: rank the top-N values of topBy by topMetric
  const topArgs: Record<string, unknown> = {
    columns: [topBy],
    metrics: [topMetric],
    time_range: defaultTimeRange,
    orderby: [[topMetric, false]],
    row_limit: topN,
  };
  const topToolCallId = `top-${Date.now()}-${perspectiveIndex}`;
  emit({
    type: "tool_execution_start",
    storeSessionId,
    toolCallId: topToolCallId,
    toolName: "query_superset",
    args: topArgs,
  });
  const topData = await executeQuerySuperset(
    topArgs,
    userId,
    undefined,
    authToken,
  );
  emit({
    type: "tool_execution_end",
    storeSessionId,
    toolCallId: topToolCallId,
    toolName: "query_superset",
    result: topData,
  });

  // Step 2: perspective query filtered to the top values
  const topValues = parseMarkdownRows(topData)
    .map((row) => row[0])
    .filter((v) => v && v !== "-");
  const args: Record<string, unknown> = {
    columns: p.columns,
    metrics: p.metrics,
    time_range: defaultTimeRange,
  };
  if (p.orderby) args.orderby = p.orderby;
  if (p.showAll) args.show_all = true;
  if (p.rowLimit) args.row_limit = p.rowLimit;
  if (topValues.length > 0) {
    args.filters = { [topBy]: topValues };
  }

  const toolCallId = `drill-${Date.now()}-${perspectiveIndex}`;
  emit({
    type: "tool_execution_start",
    storeSessionId,
    toolCallId,
    toolName: "query_superset",
    args,
  });
  const data = await executeQuerySuperset(args, userId, undefined, authToken);
  emit({
    type: "tool_execution_end",
    storeSessionId,
    toolCallId,
    toolName: "query_superset",
    result: data,
  });

  const header =
    topValues.length > 0
      ? `> 按 ${topMetric} 排名前 ${topValues.length} 的${topBy}：${topValues.join("、")}\n\n`
      : "";
  return `${header}${data}`;
}

// ── Validation ──────────────────────────────────────────────────
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAgentOutput(
  text: string,
  messages: unknown[],
): ValidationResult {
  const errors: string[] = [];
  const hasToolResults = messages.some(
    (m: unknown) =>
      (m as Record<string, unknown>).role === "tool" ||
      (m as Record<string, unknown>).tool_calls,
  );

  if (hasToolResults) {
    return { valid: true, errors: [] };
  }

  if (!text?.trim()) {
    errors.push("输出内容为空");
    return { valid: false, errors };
  }

  errors.push("未调用 query_superset 获取数据");
  return { valid: false, errors };
}

export function extractLastAssistantText(messages: unknown[]): string {
  const assistantMessages = messages.filter(
    (m: unknown) => (m as Record<string, unknown>).role === "assistant",
  );
  if (assistantMessages.length === 0) return "";
  const last = assistantMessages[assistantMessages.length - 1] as Record<
    string,
    unknown
  >;
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content))
    return (last.content as Array<{ text?: string }>)
      .map((c) => c.text ?? "")
      .join("\n");
  return "";
}

export function extractToolResultText(messages: unknown[]): string {
  const toolMessages = messages.filter(
    (m: unknown) => (m as Record<string, unknown>).role === "tool",
  );
  if (toolMessages.length === 0) return "";
  const last = toolMessages[toolMessages.length - 1] as Record<string, unknown>;
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content))
    return (last.content as Array<unknown>)
      .map((c) =>
        typeof c === "string" ? c : ((c as { text?: string }).text ?? ""),
      )
      .join("\n");
  return "";
}

/**
 * Reduce agent transcript messages to the plain-text user/assistant turns
 * that get persisted for session restore.
 */
export function extractPersistableMessages(messages: unknown[]): StoredMessage[] {
  const contentText = (content: unknown): string => {
    if (typeof content === "string") return content;
    if (Array.isArray(content))
      return (content as Array<{ text?: string }>)
        .map((c) => c.text ?? "")
        .join("\n");
    return "";
  };
  const out: StoredMessage[] = [];
  for (const m of messages) {
    const rec = m as { role?: string; content?: unknown };
    if (rec.role !== "user" && rec.role !== "assistant") continue;
    const text = contentText(rec.content).trim();
    if (text) out.push({ role: rec.role, content: text });
  }
  return out;
}

// ── Prompt lifecycle ────────────────────────────────────────────
export async function processPrompt(
  ws: WebSocket,
  storeSessionId: string,
  agentSession: AgentSession,
  message: string,
  emit: AgentEventSender,
  sessionStore: SessionStore,
): Promise<void> {
  const session = sessionStore.getSession(storeSessionId);
  if (!session) {
    emit({
      type: "error",
      storeSessionId,
      message: "会话不存在",
      retryable: false,
    });
    return;
  }

  if (session.state === "running") {
    emit({
      type: "error",
      storeSessionId,
      message: "当前会话正在处理中，请等待完成或发送 abort",
      retryable: true,
    });
    return;
  }

  sessionStore.setState(storeSessionId, "running");

  const isReport = isReportIntent(message);
  const isDict = isDictIntent(message);
  const appConfig = loadConfig();

  // Enable chain-of-thought for report/comparison intents so calculations
  // (change rates, shares, LTV coefficients) are reasoned through and the
  // thinking stream is shown in the UI.
  const wantReasoning = isReasoningIntent(message);
  const setThinkingLevel = (level: string) => {
    if ("setThinkingLevel" in agentSession) {
      try {
        (
          agentSession as unknown as { setThinkingLevel: (l: string) => void }
        ).setThinkingLevel(level);
      } catch {
        /* model without reasoning support */
      }
    }
  };
  if (wantReasoning) setThinkingLevel(appConfig.reasoningLevel);

  // Override the pi coding-agent default system prompt per intent so the
  // model acts as a data analyst instead of a coding assistant.
  agentSession.state.systemPrompt = isReport
    ? REPORT_SYSTEM_PROMPT
    : isDict
      ? DATA_DICT_SYSTEM_PROMPT
      : CHAT_SYSTEM_PROMPT;

  // One retry with reasoning disabled when the provider rejects the
  // reasoning_effort parameter (e.g. models that do not support thinking).
  let reasoningRetried = false;

  const runOnce = async (): Promise<boolean> => {
    try {
      emit({ type: "agent_start", storeSessionId });

      let terminated = false;

      const unsub = agentSession.subscribe((event) => {
        if (terminated || !sessionStore.getSession(storeSessionId)) return;

        if (event.type === "message_update") {
          const ae = event.assistantMessageEvent;
          if (ae.type === "text_delta") {
            emit({
              type: "message_update",
              storeSessionId,
              assistantMessageEvent: { type: "text_delta", delta: ae.delta },
            });
          } else if (ae.type === "thinking_delta") {
            emit({ type: "thinking_delta", storeSessionId, delta: ae.delta });
          }
        }
      });

      sessionStore.setSubscription(storeSessionId, unsub);
      sessionStore.updateUnsub(ws, storeSessionId, unsub);

      // Report requests: fetch every analysis perspective deterministically
      // and hand the data to the built-in agent for writing the report.
      // Dictionary requests: inject the dataset schema. Regular prompts go
      // straight to the agent unchanged.
      let promptText = message;
      if (isReport) {
        const config = loadAgentConfig();
        const data = await fetchReportData(
          config,
          session.userId ?? "unknown",
          emit,
          storeSessionId,
          getWsAuthToken(ws),
        );
        promptText = [
          message,
          "",
          "以下是系统已获取的数据（各分析视角），请基于这些数据撰写完整报告：",
          "",
          "请先对每个视角计算核心指标的昨日 vs 前日变化率，再结合近 7 天趋势撰写报告。",
          "",
          data,
          "",
          `报告需覆盖全部 ${config.report.perspectives.length} 个分析视角，结合用户要求组织结构与重点，结论需有数据依据。`,
        ].join("\n");
      } else if (isDict) {
        const schema = await getSchema(
          session.userId ?? "unknown",
          getWsAuthToken(ws),
        );
        promptText = [
          message,
          "",
          "以下是系统已获取的数据集 Schema（维度列与指标定义）：",
          "",
          schema || "（Schema 获取失败，请说明数据字典暂不可用，不要编造字段定义）",
        ].join("\n");
      }

      await agentSession.prompt(promptText);

      const current = sessionStore.getSession(storeSessionId);
      if (!current || current.state !== "running") return true;

      const messages = agentSession.state.messages ?? [];
      let finalText = extractLastAssistantText(messages);

      const structuredRendered = tryRenderStructuredContent(finalText);
      if (structuredRendered !== null) {
        finalText = structuredRendered;
      } else if (messages.length > 0) {
        const toolData = extractToolResultText(messages);
        if (toolData) {
          finalText = buildFallbackOutput(toolData);
        }
      }

      emit({
        type: "agent_end",
        storeSessionId,
        messages,
        finalText,
      });

      // Persist the transcript so sessions survive server restarts and can
      // be restored with their full history on the next connection.
      const persistable = extractPersistableMessages(messages);
      if (persistable.length > 0) {
        const owner = sessionStore.getSession(storeSessionId);
        await saveSessionMessages(
          storeSessionId,
          owner?.userId ?? "unknown",
          persistable,
        );
      }
      return true;
    } catch (e: unknown) {
      const errMsg = (e as Error).message ?? String(e);
      const reasoningRejected =
        wantReasoning &&
        !reasoningRetried &&
        /reasoning|thinking|enable_thinking/i.test(errMsg);
      if (reasoningRejected && sessionStore.getSession(storeSessionId)) {
        reasoningRetried = true;
        logger.warn(
          "prompt",
          "reasoning request rejected, retrying without reasoning",
          errMsg,
        );
        sessionStore.deleteSubscription(storeSessionId);
        sessionStore.updateUnsub(ws, storeSessionId, () => {});
        setThinkingLevel("off");
        return false;
      }
      // 主动 abort 时 session 已被移除，发 agent_end 而非 error，保留已有内容不被清除
      if (!sessionStore.getSession(storeSessionId)) {
        emit({
          type: "agent_end",
          storeSessionId,
          messages: (agentSession.state.messages ?? []) as unknown[],
          finalText: extractLastAssistantText(
            agentSession.state.messages ?? [],
          ),
        });
      } else {
        emit({
          type: "error",
          storeSessionId,
          message: errMsg,
          retryable: true,
        });
      }
      return true;
    }
  };

  try {
    while (!(await runOnce())) {
      // retry loop; runOnce returns false only when reasoning was rejected
    }
  } finally {
    if (sessionStore.getSession(storeSessionId)) {
      sessionStore.deleteSubscription(storeSessionId);
      sessionStore.updateUnsub(ws, storeSessionId, () => {});
      sessionStore.setState(storeSessionId, "idle");
    }
  }
}

// ── Chart insight lifecycle ─────────────────────────────────────
/**
 * Run a chart-insight request: fetch the chart data through the Superset
 * API (with the verified user token) and stream the analysis back. Insight
 * events carry `insight: true` so the client can route them to the insight
 * drawer without touching chat sessions. Follow-up prompts reuse the same
 * agent session (history kept in memory for the connection lifetime) and
 * skip data fetching. Insight turns are transient and are not persisted.
 */
export async function processInsight(
  ws: WebSocket,
  storeSessionId: string,
  agentSession: AgentSession,
  chartId: number | undefined,
  filters: Record<string, unknown>,
  followUpPrompt: string | undefined,
  emit: AgentEventSender,
  sessionStore: SessionStore,
): Promise<void> {
  const emitInsight: AgentEventSender = (event) =>
    emit({ ...event, insight: true });
  const sendError = (message: string, retryable: boolean) =>
    emitInsight({
      type: "error",
      storeSessionId,
      message,
      retryable,
    });

  const session = sessionStore.getSession(storeSessionId);
  if (!session) {
    sendError("会话不存在", false);
    return;
  }
  if (session.state === "running") {
    sendError("当前会话正在处理中，请等待完成或发送 abort", true);
    return;
  }
  sessionStore.setState(storeSessionId, "running");

  try {
    emitInsight({ type: "agent_start", storeSessionId });

    let promptText = followUpPrompt ?? "";
    if (chartId !== undefined) {
      try {
        promptText = await buildChartInsightPrompt(
          chartId,
          filters,
          session.userId ?? "unknown",
          getWsAuthToken(ws),
        );
      } catch (e) {
        sendError(
          `图表数据获取失败: ${(e as Error).message ?? String(e)}`,
          true,
        );
        return;
      }
    }

    // Insight sessions are created per request, so overriding the system
    // prompt here only affects this analysis.
    agentSession.state.systemPrompt = CHART_INSIGHT_SYSTEM_PROMPT;

    let terminated = false;
    const unsub = agentSession.subscribe((event) => {
      if (terminated || !sessionStore.getSession(storeSessionId)) return;
      if (event.type === "message_update") {
        const ae = event.assistantMessageEvent;
        if (ae.type === "text_delta") {
          emitInsight({
            type: "message_update",
            storeSessionId,
            assistantMessageEvent: { type: "text_delta", delta: ae.delta },
          });
        }
      }
    });
    sessionStore.setSubscription(storeSessionId, unsub);
    sessionStore.updateUnsub(ws, storeSessionId, unsub);

    await agentSession.prompt(promptText);

    const messages = agentSession.state.messages ?? [];
    const finalText = extractLastAssistantText(messages);
    emitInsight({
      type: "agent_end",
      storeSessionId,
      messages,
      finalText,
    });
  } catch (e: unknown) {
    const errMsg = (e as Error).message ?? String(e);
    if (!sessionStore.getSession(storeSessionId)) {
      emitInsight({
        type: "agent_end",
        storeSessionId,
        messages: (agentSession.state.messages ?? []) as unknown[],
        finalText: extractLastAssistantText(agentSession.state.messages ?? []),
      });
    } else {
      sendError(errMsg, true);
    }
  } finally {
    if (sessionStore.getSession(storeSessionId)) {
      sessionStore.deleteSubscription(storeSessionId);
      sessionStore.updateUnsub(ws, storeSessionId, () => {});
      sessionStore.setState(storeSessionId, "idle");
    }
  }
}
