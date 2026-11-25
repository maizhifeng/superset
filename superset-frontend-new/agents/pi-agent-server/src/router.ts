/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { WebSocket } from "ws";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ClientMessage, ModelInfo, ServerMessage } from "./types.js";
import {
  SessionStore,
  setWsPreferredModel,
  getWsPreferredModel,
  setWsVerifiedUser,
  getWsVerifiedUser,
  setWsAuthPending,
  getWsAuthPending,
  type VerifiedUserContext,
} from "./session-store.js";
import { verifyToken } from "./ws-auth.js";
import {
  processPrompt,
  processInsight,
  type AgentEventSender,
} from "./agent-orchestrator.js";
import {
  getSessionOwner,
  loadSessionMessages,
  toAgentMessages,
  deleteSession as deleteStoredSession,
  setPreferredModel,
} from "./store.js";

type SessionFactory = (
  userId: string,
  ws: WebSocket,
) => Promise<AgentSession | null>;

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

const wsAuthGenerations = new WeakMap<WebSocket, number>();

function beginAuthVerification(ws: WebSocket, token: string | null): void {
  setWsVerifiedUser(ws, null);
  if (!token) {
    setWsAuthPending(ws, null);
    return;
  }
  const generation = (wsAuthGenerations.get(ws) ?? 0) + 1;
  wsAuthGenerations.set(ws, generation);
  const pending: Promise<VerifiedUserContext | null> = (async () => {
    const userId = await verifyToken(token);
    if (wsAuthGenerations.get(ws) !== generation) return null;
    const context = userId ? { userId, token } : null;
    setWsVerifiedUser(ws, context);
    return context;
  })();
  setWsAuthPending(ws, pending);
}

async function ensureVerified(
  ws: WebSocket,
): Promise<VerifiedUserContext | null> {
  const pending = getWsAuthPending(ws);
  if (pending) {
    try {
      await pending;
    } catch {
      setWsVerifiedUser(ws, null);
    }
    if (getWsAuthPending(ws) === pending) setWsAuthPending(ws, null);
  }
  const context = getWsVerifiedUser(ws);
  if (!context) return null;
  const userId = await verifyToken(context.token);
  if (userId !== context.userId) {
    setWsVerifiedUser(ws, null);
    return null;
  }
  return context;
}

function sendAuthError(
  ws: WebSocket,
  insight?: { storeSessionId?: string },
): void {
  send(ws, {
    type: "error",
    message: "未认证：请先通过 auth 消息提供有效的访问令牌",
    retryable: true,
    ...insight,
    ...(insight ? { insight: true } : {}),
  });
}

async function canAccessSession(
  ws: WebSocket,
  sessionStore: SessionStore,
  storeSessionId: string,
  identity: VerifiedUserContext,
): Promise<boolean> {
  const active = sessionStore.getSession(storeSessionId);
  const owner = active?.userId ?? (await getSessionOwner(storeSessionId));
  if (owner && owner !== identity.userId) {
    send(ws, {
      type: "error",
      message: "无权访问该会话",
      retryable: false,
      storeSessionId,
    });
    return false;
  }
  return true;
}

async function loadOwnedSession(
  ws: WebSocket,
  sessionStore: SessionStore,
  storeSessionId: string,
  identity: VerifiedUserContext,
  sessionFactory: SessionFactory,
  datasetId?: number,
): Promise<AgentSession | null> {
  const existing = sessionStore.getAgentSession(
    ws,
    storeSessionId,
    identity.userId,
  );
  if (existing) return existing;
  if (!(await canAccessSession(ws, sessionStore, storeSessionId, identity))) {
    return null;
  }

  const agentSession = await sessionFactory(identity.userId, ws);
  if (!agentSession) {
    send(ws, {
      type: "error",
      message: "无法创建 AI 会话",
      retryable: false,
      storeSessionId,
    });
    return null;
  }

  try {
    const history = await loadSessionMessages(storeSessionId, identity.userId);
    if (history && history.length > 0) {
      agentSession.state.messages = toAgentMessages(history);
    }
    const activeSession = sessionStore.create(
      ws,
      storeSessionId,
      identity.userId,
      agentSession,
      datasetId,
    );
    if (activeSession !== agentSession) agentSession.dispose();
    return activeSession;
  } catch (error) {
    agentSession.dispose();
    send(ws, {
      type: "error",
      message: (error as Error).message,
      retryable: false,
      storeSessionId,
    });
    return null;
  }
}

export function handleConnection(
  ws: WebSocket,
  sessionFactory: SessionFactory,
  modelList: ModelInfo[] = [],
  defaultModel = "",
): void {
  const sessionStore = new SessionStore();

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

    if (msg.type === "auth") {
      beginAuthVerification(ws, msg.access_token);
      return;
    }

    const identity = await ensureVerified(ws);
    if (!identity) {
      sendAuthError(
        ws,
        msg.type === "insight"
          ? { storeSessionId: msg.storeSessionId }
          : undefined,
      );
      return;
    }

    switch (msg.type) {
      case "new_session": {
        if (!msg.storeSessionId) {
          send(ws, {
            type: "error",
            message: "storeSessionId 是必需的",
            retryable: false,
          });
          break;
        }
        const agentSession = await loadOwnedSession(
          ws,
          sessionStore,
          msg.storeSessionId,
          identity,
          sessionFactory,
          msg.dataset_id,
        );
        if (!agentSession) break;
        sessionStore.setCurrentSessionId(
          ws,
          msg.storeSessionId,
          identity.userId,
        );
        send(ws, { type: "session_created", sessionId: msg.storeSessionId });
        break;
      }

      case "select_session": {
        if (!msg.storeSessionId) {
          send(ws, {
            type: "error",
            message: "storeSessionId 是必需的",
            retryable: false,
          });
          break;
        }
        const agentSession = await loadOwnedSession(
          ws,
          sessionStore,
          msg.storeSessionId,
          identity,
          sessionFactory,
        );
        if (!agentSession) break;
        sessionStore.setCurrentSessionId(
          ws,
          msg.storeSessionId,
          identity.userId,
        );
        send(ws, { type: "session_created", sessionId: msg.storeSessionId });
        break;
      }

      case "prompt": {
        const storeSessionId =
          msg.storeSessionId ?? sessionStore.getCurrentSessionId(ws);
        if (!storeSessionId) {
          send(ws, {
            type: "error",
            message: "storeSessionId 是必需的",
            retryable: false,
          });
          break;
        }
        const agentSession = await loadOwnedSession(
          ws,
          sessionStore,
          storeSessionId,
          identity,
          sessionFactory,
        );
        if (!agentSession) break;
        sessionStore.setCurrentSessionId(ws, storeSessionId, identity.userId);

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
          identity,
        );
        break;
      }

      case "insight": {
        if (!msg.storeSessionId) {
          send(ws, {
            type: "error",
            message: "storeSessionId 是必需的",
            retryable: false,
            insight: true,
          });
          break;
        }
        const agentSession = await loadOwnedSession(
          ws,
          sessionStore,
          msg.storeSessionId,
          identity,
          sessionFactory,
        );
        if (!agentSession) break;

        const emit: AgentEventSender = (event) => {
          send(ws, event as unknown as ServerMessage);
        };

        await processInsight(
          ws,
          msg.storeSessionId,
          agentSession,
          msg.chartId,
          msg.filters ?? {},
          msg.prompt,
          emit,
          sessionStore,
          identity,
        );
        break;
      }

      case "set_model": {
        if (!msg.model) break;
        if (
          modelList.length > 0 &&
          !modelList.some((model) => model.id === msg.model)
        ) {
          send(ws, {
            type: "error",
            message: `模型 "${msg.model}" 不在可用模型列表中`,
            retryable: false,
          });
          break;
        }
        const currentSid = sessionStore.getCurrentSessionId(ws);
        const currentSession = currentSid
          ? sessionStore.getSession(currentSid, identity.userId)
          : undefined;
        sessionStore.removeAll(ws);
        setWsPreferredModel(ws, msg.model);
        await setPreferredModel(identity.userId, msg.model);
        if (currentSession) {
          send(ws, { type: "session_created", sessionId: currentSession.id });
        }
        sendModelList(ws, modelList, defaultModel);
        break;
      }

      case "abort": {
        const storeSessionId =
          msg.storeSessionId ?? sessionStore.getCurrentSessionId(ws);
        if (
          storeSessionId &&
          (await canAccessSession(ws, sessionStore, storeSessionId, identity))
        ) {
          sessionStore.remove(ws, storeSessionId, identity.userId);
        }
        break;
      }

      case "delete_session": {
        if (
          !msg.storeSessionId ||
          !(await canAccessSession(
            ws,
            sessionStore,
            msg.storeSessionId,
            identity,
          ))
        ) {
          break;
        }
        sessionStore.remove(ws, msg.storeSessionId, identity.userId);
        await deleteStoredSession(msg.storeSessionId, identity.userId);
        break;
      }

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
