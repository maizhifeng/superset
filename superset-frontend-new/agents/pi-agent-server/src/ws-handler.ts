import { WebSocket } from "ws";
import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ModelInfo, ServerMessage, Session } from "./types.js";
import { executeQuerySuperset } from "./tools/querySuperset.js";

const MAX_TOOL_ROUNDS = 10;
const sessions = new Map<string, Session>();
const subscriptions = new Map<string, () => void>();

// Per-WebSocket session store: storeSessionId → { agentSession, unsub }
// All sessions stay alive until explicitly deleted (delete_session, close).
const wsSessions = new WeakMap<WebSocket, Map<string, { agentSession: AgentSession; unsub: () => void }>>();

function getWsStore(ws: WebSocket): Map<string, { agentSession: AgentSession; unsub: () => void }> {
  let store = wsSessions.get(ws);
  if (!store) {
    store = new Map();
    wsSessions.set(ws, store);
  }
  return store;
}

function createQueryTool(userId: string): ToolDefinition {
  return {
    name: "query_superset",
    description:
      "从广告投放数据集（数据集 26）查询按维度聚合的数据，返回 markdown 表格。columns 必须包含「日期」以展示分天趋势，可附加其他维度。各维度含义：日期=数据日期，媒体=广告投放平台（微信/抖音/华为等），平台=操作系统（iOS/Android），渠道商=具体合作渠道，主游戏=游戏项目名，团队=运营团队。metrics 指定聚合指标（如 SUM(消耗)）。示例：columns=[\"日期\", \"媒体\"], metrics=[\"SUM(消耗)\", \"cpa\"], time_range=\"Last 7 days\"",
    parameters: Type.Object({
      columns: Type.Array(Type.String(), {
        description:
          "分组维度：日期=数据日期，媒体=广告投放平台（微信/抖音/华为），平台=操作系统（iOS/Android），渠道商=具体合作渠道，主游戏=游戏项目，团队=运营团队。必须包含「日期」。",
      }),
      metrics: Type.Array(Type.String(), { description: "查询指标" }),
      time_range: Type.Optional(
        Type.String({ description: "时间范围，默认 Last 14 days" }),
      ),
      filters: Type.Optional(
        Type.Object(
          {},
          {
            description:
              '列级过滤条件。当分析指定了具体游戏/渠道/媒体时，必须传入对应的过滤条件。如 {"主游戏":"三国：天命再临"} 或 {"渠道商":"微信小游戏"}',
          },
        ),
      ),
      orderby: Type.Optional(
        Type.Array(Type.Array(Type.Any()), {
          description: '排序，如 [["SUM(消耗)", false]]',
        }),
      ),
      row_limit: Type.Optional(
        Type.Number({ maximum: 1000, description: "返回行数上限，默认 100" }),
      ),
    }),
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const result = await executeQuerySuperset(
        params as Record<string, unknown>,
        userId,
        signal,
      );
      return { content: [{ type: "text" as const, text: result }] };
    },
  };
}

export function handleConnection(
  ws: WebSocket,
  sessionFactory: (userId: string, queryTool: ToolDefinition, ws: WebSocket) => Promise<AgentSession | null>,
  modelList: ModelInfo[] = [],
): void {
  send(ws, { type: "model_list", models: modelList });
  ws.on("message", async (raw) => {
    await handleMessage(ws, sessionFactory, raw.toString());
  });

  ws.on("close", () => {
    const store = getWsStore(ws);
    for (const [, entry] of store) {
      entry.unsub();
      entry.agentSession.dispose();
    }
    store.clear();
  });
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function handlePrompt(
  ws: WebSocket,
  storeSid: string,
  agentSession: AgentSession,
  message: string,
): Promise<void> {
  const session = sessions.get(storeSid);
  if (!session) {
    send(ws, { type: "error", message: "会话不存在", retryable: false });
    return;
  }

  if (session.state === "running") {
    send(ws, {
      type: "error",
      message: "当前会话正在处理中，请等待完成或发送 abort",
      retryable: true,
    });
    return;
  }

  session.state = "running";

  try {
    send(ws, { type: "agent_start", storeSessionId: storeSid });

    const oldUnsub = subscriptions.get(storeSid);
    if (oldUnsub) oldUnsub();

    let toolRound = 0;

    const unsub = agentSession.subscribe((event) => {
      if (event.type === "message_update") {
        const ae = event.assistantMessageEvent;
        if (ae.type === "text_delta") {
          send(ws, {
            type: "message_update",
            storeSessionId: storeSid,
            assistantMessageEvent: { type: "text_delta", delta: ae.delta },
          });
        } else if (ae.type === "thinking_delta") {
          send(ws, {
            type: "thinking_delta",
            delta: ae.delta,
          });
        }
      }

      if (event.type === "tool_call") {
        toolRound++;
        if (toolRound > MAX_TOOL_ROUNDS) {
          send(ws, {
            type: "error",
            message: `工具调用次数过多（超过 ${MAX_TOOL_ROUNDS} 次），已自动终止`,
            retryable: false,
          });
          agentSession.dispose();
          return;
        }
        send(ws, {
          type: "tool_execution_start",
          storeSessionId: storeSid,
          toolCallId: event.id,
          toolName: event.toolName,
          args: event.args as any,
        });
      }

      if (event.type === "tool_result") {
        const resultText =
          event.result?.content
            ?.map((c: any) => (typeof c === "string" ? c : c.text ?? ""))
            .join("\n") ?? "";
        send(ws, {
          type: "tool_execution_end",
          storeSessionId: storeSid,
          toolCallId: event.id,
          result: resultText,
        });
      }
    });
    subscriptions.set(storeSid, unsub);
    // Update the wsSessions entry with the new unsubscribe
    const wsStore = getWsStore(ws);
    const existing = wsStore.get(storeSid);
    if (existing) existing.unsub = unsub;

    await agentSession.prompt(message);

    if (session.state !== "running") return;

    const messages = agentSession.state.messages ?? [];
    const finalText = messages
      .filter((m: any) => m.role === "assistant")
      .map((m: any) => {
        if (typeof m.content === "string") return m.content;
        if (Array.isArray(m.content))
          return m.content.map((c: any) => c.text ?? "").join("\n");
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
    send(ws, {
      type: "agent_end",
      storeSessionId: storeSid,
      messages,
      finalText,
    });
  } catch (e: unknown) {
    send(ws, {
      type: "error",
      message: (e as Error).message ?? "未知错误",
      retryable: true,
    });
  } finally {
    subscriptions.get(storeSid)?.();
    subscriptions.delete(storeSid);
    const wsStore = getWsStore(ws);
    const existing = wsStore.get(storeSid);
    if (existing) existing.unsub = () => {};
    session.state = "idle";
  }
}

async function handleMessage(
  ws: WebSocket,
  sessionFactory: (userId: string, queryTool: ToolDefinition, ws: WebSocket) => Promise<AgentSession | null>,
  raw: string,
): Promise<void> {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: "error", message: "无效的 JSON 消息", retryable: false });
    return;
  }

  switch (msg.type) {
    case "new_session": {
      const storeSid = msg.storeSessionId;
      if (!storeSid) {
        send(ws, { type: "error", message: "storeSessionId 是必需的", retryable: false });
        return;
      }
      // Don't dispose old session — keep it alive for future switching
      const wsStore = getWsStore(ws);
      if (wsStore.has(storeSid)) {
        // Already exists, just activate it
        send(ws, { type: "session_created", sessionId: storeSid });
        break;
      }
      const queryTool = createQueryTool(msg.user_id);
      const agentSession = await sessionFactory(msg.user_id, queryTool, ws);
      if (!agentSession) {
        send(ws, { type: "error", message: "无法创建 AI 会话", retryable: false });
        return;
      }
      sessions.set(storeSid, { id: storeSid, userId: msg.user_id, state: "idle" });
      wsStore.set(storeSid, { agentSession, unsub: () => {} });
      send(ws, { type: "session_created", sessionId: storeSid });
      break;
    }

    case "select_session": {
      const storeSid = msg.storeSessionId;
      send(ws, { type: "session_created", sessionId: storeSid });
      break;
    }

    case "prompt": {
      const storeSid = msg.storeSessionId;
      if (!storeSid) {
        send(ws, { type: "error", message: "storeSessionId 是必需的", retryable: false });
        return;
      }
      const wsStore = getWsStore(ws);
      let entry = wsStore.get(storeSid);
      if (!entry) {
        const userId = msg.user_id || (ws as any)._lastUserId || "anonymous";
        (ws as any)._lastUserId = userId;
        const queryTool = createQueryTool(userId);
        const agentSession = await sessionFactory(userId, queryTool, ws);
        if (!agentSession) {
          send(ws, { type: "error", message: "无法创建 AI 会话", retryable: false });
          return;
        }
        sessions.set(storeSid, { id: storeSid, userId, state: "idle" });
        wsStore.set(storeSid, { agentSession, unsub: () => {} });
        send(ws, { type: "session_created", sessionId: storeSid });
        entry = wsStore.get(storeSid)!;
      }
      await handlePrompt(ws, storeSid, entry.agentSession, msg.message);
      break;
    }

    case "set_model": {
      const userModel = msg.model;
      if (userModel) {
        (ws as any)._userModel = userModel;
      }
      break;
    }

    case "abort": {
      const sid = (ws as any)._sessionId as string | undefined;
      if (sid) {
        subscriptions.get(sid)?.();
        subscriptions.delete(sid);
        const wsStore = getWsStore(ws);
        const entry = wsStore.get(sid);
        if (entry) {
          entry.unsub();
          entry.agentSession.dispose();
        }
        wsStore.delete(sid);
        sessions.delete(sid);
      }
      break;
    }

    case "delete_session": {
      const storeSid = msg.storeSessionId;
      if (storeSid) {
        subscriptions.get(storeSid)?.();
        subscriptions.delete(storeSid);
        const wsStore = getWsStore(ws);
        const entry = wsStore.get(storeSid);
        if (entry) {
          entry.unsub();
          entry.agentSession.dispose();
        }
        wsStore.delete(storeSid);
        sessions.delete(storeSid);
      }
      break;
    }

    default:
      send(ws, {
        type: "error",
        message: `未知消息类型: ${msg.type}`,
        retryable: false,
      });
  }
}
