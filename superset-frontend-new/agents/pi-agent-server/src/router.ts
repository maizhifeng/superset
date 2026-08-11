import { WebSocket } from "ws";
import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ClientMessage, ModelInfo, ServerMessage } from "./types.js";
import {
  SessionStore,
  setWsPreferredModel,
  getWsPreferredModel,
  setWsAuthToken,
  getWsAuthToken,
} from "./session-store.js";
import { setPreferredModel } from "./model-preference.js";
import {
  processPrompt,
  createTools,
  type AgentEventSender,
} from "./agent-orchestrator.js";

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendModelList(
  ws: WebSocket,
  modelList: ModelInfo[],
  defaultModel: string,
): void {
  send(ws, {
    type: "model_list",
    models: modelList,
    current: getWsPreferredModel(ws) ?? defaultModel,
  });
}

function parseMessage(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (!msg || typeof msg !== "object" || !msg.type) return null;
    return msg as ClientMessage;
  } catch {
    return null;
  }
}

export function handleConnection(
  ws: WebSocket,
  sessionFactory: (
    userId: string,
    tools: ToolDefinition[],
    ws: WebSocket,
  ) => Promise<AgentSession | null>,
  modelList: ModelInfo[] = [],
  accessToken?: string,
  defaultModel = "",
): void {
  const sessionStore = new SessionStore();

  if (accessToken) {
    setWsAuthToken(ws, accessToken);
  }

  sendModelList(ws, modelList, defaultModel);

  ws.on("message", async (raw) => {
    const msg = parseMessage(raw.toString());
    if (!msg) {
      send(ws, {
        type: "error",
        message: "无效的 JSON 消息",
        retryable: false,
      });
      return;
    }

    switch (msg.type) {
      case "auth":
        if (msg.access_token) {
          setWsAuthToken(ws, msg.access_token);
        }
        break;

      case "new_session":
        await handleNewSession(ws, sessionStore, msg, sessionFactory);
        break;

      case "select_session":
        send(ws, { type: "session_created", sessionId: msg.storeSessionId });
        break;

      case "prompt":
        await handlePromptMessage(ws, sessionStore, msg, sessionFactory);
        break;

      case "set_model":
        if (msg.model) {
          // Reject models the provider does not serve (skip validation when
          // the model list is unavailable, e.g. provider was down at boot).
          if (
            modelList.length > 0 &&
            !modelList.some((m) => m.id === msg.model)
          ) {
            send(ws, {
              type: "error",
              message: `模型 "${msg.model}" 不在可用模型列表中`,
              retryable: false,
            });
            break;
          }
          setWsPreferredModel(ws, msg.model);
          if (msg.user_id) {
            setPreferredModel(msg.user_id, msg.model);
          }
          // Sessions keep the model they were created with, so discard ALL
          // sessions of this connection — the next prompt recreates them
          // with the newly selected model (this also covers sessions created
          // before the first prompt, which had no "current session" set).
          const currentSid = sessionStore.getCurrentSessionId(ws);
          sessionStore.removeAll(ws);
          if (currentSid) {
            send(ws, { type: "session_created", sessionId: currentSid });
          }
          // Echo the updated model state so the client selector stays in sync
          sendModelList(ws, modelList, defaultModel);
        }
        break;

      case "abort":
        handleAbort(ws, sessionStore, msg);
        break;

      case "delete_session":
        sessionStore.remove(ws, msg.storeSessionId);
        break;

      default:
        send(ws, {
          type: "error",
          message: `未知消息类型: ${(msg as ClientMessage).type}`,
          retryable: false,
        });
    }
  });

  ws.on("close", () => {
    sessionStore.cleanup(ws);
  });
}

async function handleNewSession(
  ws: WebSocket,
  sessionStore: SessionStore,
  msg: ClientMessage & { type: "new_session" },
  sessionFactory: (
    userId: string,
    tools: ToolDefinition[],
    ws: WebSocket,
  ) => Promise<AgentSession | null>,
): Promise<void> {
  const { storeSessionId, user_id } = msg;
  if (!storeSessionId) {
    send(ws, {
      type: "error",
      message: "storeSessionId 是必需的",
      retryable: false,
    });
    return;
  }

  if (sessionStore.has(ws, storeSessionId)) {
    send(ws, { type: "session_created", sessionId: storeSessionId });
    return;
  }

  const tools = createTools(
    user_id,
    () => getWsAuthToken(ws),
    () => sessionStore.getSession(storeSessionId)?.datasetId,
  );
  const agentSession = await sessionFactory(user_id, tools, ws);
  if (!agentSession) {
    send(ws, {
      type: "error",
      message: "无法创建 AI 会话",
      retryable: false,
    });
    return;
  }

  sessionStore.create(ws, storeSessionId, user_id, agentSession, msg.dataset_id);
  send(ws, { type: "session_created", sessionId: storeSessionId });
}

async function handlePromptMessage(
  ws: WebSocket,
  sessionStore: SessionStore,
  msg: ClientMessage & { type: "prompt" },
  sessionFactory: (
    userId: string,
    tools: ToolDefinition[],
    ws: WebSocket,
  ) => Promise<AgentSession | null>,
): Promise<void> {
  const storeSessionId =
    msg.storeSessionId ?? sessionStore.getCurrentSessionId(ws);
  if (!storeSessionId) {
    send(ws, {
      type: "error",
      message: "storeSessionId 是必需的",
      retryable: false,
    });
    return;
  }

  let agentSession = sessionStore.getAgentSession(ws, storeSessionId);
  if (!agentSession) {
    // Auto-create session
    const userId = msg.user_id || "anonymous";
    const tools = createTools(
      userId,
      () => getWsAuthToken(ws),
    );
    const newSession = await sessionFactory(userId, tools, ws);
    if (!newSession) {
      send(ws, {
        type: "error",
        message: "无法创建 AI 会话",
        retryable: false,
      });
      return;
    }
    agentSession = newSession;
    sessionStore.create(ws, storeSessionId, userId, agentSession);
  }

  sessionStore.setCurrentSessionId(ws, storeSessionId);

  const emit: AgentEventSender = (event) => {
    send(ws, event as unknown as ServerMessage);
  };

  await processPrompt(
    ws,
    storeSessionId,
    agentSession,
    msg.message,
    emit,
    sessionStore,
  );
}

function handleAbort(
  ws: WebSocket,
  sessionStore: SessionStore,
  msg: ClientMessage & { type: "abort" },
): void {
  const sid = msg.storeSessionId ?? sessionStore.getCurrentSessionId(ws);
  if (sid) {
    sessionStore.remove(ws, sid);
  }
}
