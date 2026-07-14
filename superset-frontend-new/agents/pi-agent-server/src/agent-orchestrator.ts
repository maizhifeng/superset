import { WebSocket } from "ws";
import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { SessionStore } from "./session-store.js";
import type { ToolCallArg } from "./types.js";
import { executeQuerySuperset, getSchema } from "./tools/querySuperset.js";
import {
  tryRenderStructuredContent,
  buildFallbackOutput,
} from "./renderer.js";

const MAX_TOOL_ROUNDS = parseInt(process.env.AGENT_MAX_TOOL_ROUNDS || "10", 10) || 10;

// ── Event sender abstraction ────────────────────────────────────
export interface AgentEventSender {
  (event: {
    type: string;
    storeSessionId?: string;
    [key: string]: unknown;
  }): void;
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
  const last = toolMessages[toolMessages.length - 1] as Record<
    string,
    unknown
  >;
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content))
    return (last.content as Array<unknown>)
      .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text ?? ""))
      .join("\n");
  return "";
}

// ── Tool factories ─────────────────────────────────────────────
export function createTools(
  userId: string,
  getAuthToken?: () => string | undefined,
  getDatasetId?: () => number | undefined,
): ToolDefinition[] {
  return [
    {
      name: "get_dataset_schema",
      label: "获取数据集元数据",
      description:
        "获取当前数据集的可用维度列名和聚合指标名列表。返回结果包含所有可用的列名和指标名，用于构建后续的数据查询。此工具不执行数据查询，只返回元数据。每次对话开始时必须先调用此工具获取正确的列名和指标名。",
      parameters: Type.Object({}),
      execute: async () => {
        const token = getAuthToken?.();
        const dsId = getDatasetId?.();
        const schema = await getSchema(userId, token, dsId);
        return {
          content: [{ type: "text" as const, text: schema || "（未获取到 Schema 信息）" }],
          details: {},
        };
      },
    },
    {
      name: "query_superset",
      label: "查询数据集",
      description:
        "从数据集查询按维度聚合的数据，返回 markdown 表格。列名和指标名必须使用 get_dataset_schema 返回的名称，不得自行猜测。示例：columns=[\"渠道商\"], metrics=[\"指标名1\",\"指标名2\"], time_range=\"Last 7 days\"。",
      parameters: Type.Object({
        columns: Type.Array(Type.String(), {
          description: "分组维度列名。必须使用 get_dataset_schema 返回的列名。",
        }),
        metrics: Type.Array(Type.String(), {
          description:
            "聚合指标名。必须使用 get_dataset_schema 返回的指标名。区分大小写。",
        }),
        time_range: Type.Optional(
          Type.String({ description: "时间范围，默认 Last 14 days" }),
        ),
        filters: Type.Optional(
          Type.Union(
            [
              Type.Record(
                Type.String(),
                Type.Union([Type.String(), Type.Number()]),
              ),
              Type.String(),
            ],
            {
              description:
                '列级过滤条件，key=列名 value=过滤值。当分析指定了具体游戏/渠道/媒体时，必须传入对应的过滤条件。如 {"主游戏":"三国：天命再临"} 或 {"渠道商":"微信小游戏"}',
            },
          ),
        ),
        orderby: Type.Optional(
          Type.Array(Type.Tuple([Type.String(), Type.Boolean()]), {
            description:
              '必须是条目的标准 JSON 数组，如 [["指标名", false]]。每个条目是一个 [列名, 是否降序] 的二元组。',
          }),
        ),
        row_limit: Type.Optional(
          Type.Number({
            maximum: 1000,
            description:
              "返回行数上限，必须是纯数字，默认 100。禁止使用字符串或模板语法。",
          }),
        ),
        show_all: Type.Optional(
          Type.Boolean({
            description:
              "是否显示全部数据行。默认 false，只展示占比前 95% 的主要项。当用户要求「完整」「全部」「所有明细」时设为 true。",
          }),
        ),
      }),
      execute: async (toolCallId, params, signal, onUpdate, ctx) => {
        const token = getAuthToken?.();
        const result = await executeQuerySuperset(
          params as Record<string, unknown>,
          userId,
          signal,
          token,
        );
        return { content: [{ type: "text" as const, text: result }], details: {} };
      },
    },
  ];
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
    emit({ type: "error", storeSessionId, message: "会话不存在", retryable: false });
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

  try {
    emit({ type: "agent_start", storeSessionId });

    let toolRound = 0;
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

      if (event.type === "tool_execution_start") {
        toolRound++;

        if (toolRound > MAX_TOOL_ROUNDS) {
          terminated = true;
          sessionStore.deleteSubscription(storeSessionId);
          sessionStore.updateUnsub(ws, storeSessionId, () => {});
          sessionStore.setState(storeSessionId, "idle");
          agentSession.dispose();
          emit({
            type: "agent_end",
            storeSessionId,
            messages: [],
            finalText: `工具调用次数过多（超过 ${MAX_TOOL_ROUNDS} 次），已自动终止`,
          });
          return;
        }
        const args = event.args as ToolCallArg;
        emit({
          type: "tool_execution_start",
          storeSessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args,
        });
      }

      if (event.type === "tool_execution_end") {
        const resultText =
          event.result?.content
            ?.map((c: unknown) =>
              typeof c === "string" ? c : (c as { text?: string }).text ?? "",
            )
            .join("\n") ?? "";
        emit({
          type: "tool_execution_end",
          storeSessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: resultText,
        });
      }
    });

    sessionStore.setSubscription(storeSessionId, unsub);
    sessionStore.updateUnsub(ws, storeSessionId, unsub);

    await agentSession.prompt(message);

    const current = sessionStore.getSession(storeSessionId);
    if (!current || current.state !== "running") return;

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
  } catch (e: unknown) {
    // 主动 abort 时 session 已被移除，发 agent_end 而非 error，保留已有内容不被清除
    if (!sessionStore.getSession(storeSessionId)) {
      emit({
        type: "agent_end",
        storeSessionId,
        messages: (agentSession.state.messages ?? []) as unknown[],
        finalText: extractLastAssistantText(agentSession.state.messages ?? []),
      });
    } else {
      emit({
        type: "error",
        storeSessionId,
        message: (e as Error).message ?? "未知错误",
        retryable: true,
      });
    }
  } finally {
    if (sessionStore.getSession(storeSessionId)) {
      sessionStore.deleteSubscription(storeSessionId);
      sessionStore.updateUnsub(ws, storeSessionId, () => {});
      sessionStore.setState(storeSessionId, "idle");
    }
  }
}
