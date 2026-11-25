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
import type { Session } from "./types.js";

interface SessionEntry {
  agentSession: AgentSession;
  unsub: () => void;
}

export class SessionStore {
  private sessions = new Map<string, Session>();
  private subscriptions = new Map<string, () => void>();
  private wsSessions = new WeakMap<WebSocket, Map<string, SessionEntry>>();
  private wsCurrentSessionId = new WeakMap<WebSocket, string>();

  private getWsStore(ws: WebSocket): Map<string, SessionEntry> {
    let store = this.wsSessions.get(ws);
    if (!store) {
      store = new Map();
      this.wsSessions.set(ws, store);
    }
    return store;
  }

  has(ws: WebSocket, storeSessionId: string, userId: string): boolean {
    const session = this.sessions.get(storeSessionId);
    return (
      session?.userId === userId && this.getWsStore(ws).has(storeSessionId)
    );
  }

  getAgentSession(
    ws: WebSocket,
    storeSessionId: string,
    userId: string,
  ): AgentSession | undefined {
    if (this.sessions.get(storeSessionId)?.userId !== userId) return undefined;
    return this.getWsStore(ws).get(storeSessionId)?.agentSession;
  }

  getSession(storeSessionId: string, userId?: string): Session | undefined {
    const session = this.sessions.get(storeSessionId);
    if (!session) return undefined;
    if (userId !== undefined && session.userId !== userId) return undefined;
    return session;
  }

  getCurrentSessionId(ws: WebSocket): string | undefined {
    return this.wsCurrentSessionId.get(ws);
  }

  setCurrentSessionId(
    ws: WebSocket,
    storeSessionId: string,
    userId: string,
  ): void {
    if (this.sessions.get(storeSessionId)?.userId !== userId) return;
    this.wsCurrentSessionId.set(ws, storeSessionId);
  }

  create(
    ws: WebSocket,
    storeSessionId: string,
    userId: string,
    agentSession: AgentSession,
    datasetId?: number,
  ): AgentSession {
    const existing = this.sessions.get(storeSessionId);
    if (existing && existing.userId !== userId) {
      throw new Error("storeSessionId 已被其他用户使用");
    }
    const wsStore = this.getWsStore(ws);
    const wsEntry = wsStore.get(storeSessionId);
    if (wsEntry) {
      return wsEntry.agentSession;
    }
    this.sessions.set(storeSessionId, {
      id: storeSessionId,
      userId,
      state: "idle",
      datasetId,
    });
    wsStore.set(storeSessionId, { agentSession, unsub: () => {} });
    return agentSession;
  }

  setSubscription(storeSessionId: string, unsub: () => void): void {
    const old = this.subscriptions.get(storeSessionId);
    if (old) old();
    this.subscriptions.set(storeSessionId, unsub);
  }

  getSubscription(storeSessionId: string): (() => void) | undefined {
    return this.subscriptions.get(storeSessionId);
  }

  deleteSubscription(storeSessionId: string): void {
    this.subscriptions.get(storeSessionId)?.();
    this.subscriptions.delete(storeSessionId);
  }

  remove(ws: WebSocket, storeSessionId: string, userId?: string): void {
    const session = this.sessions.get(storeSessionId);
    if (!session || (userId !== undefined && session.userId !== userId)) {
      return;
    }
    this.subscriptions.get(storeSessionId)?.();
    this.subscriptions.delete(storeSessionId);
    const wsStore = this.getWsStore(ws);
    const entry = wsStore.get(storeSessionId);
    if (entry) {
      entry.unsub();
      entry.agentSession.dispose();
    }
    wsStore.delete(storeSessionId);
    this.sessions.delete(storeSessionId);
  }

  /**
   * Remove every session bound to a WebSocket connection.  Used when the
   * per-connection model preference changes: sessions keep the model they
   * were created with, so all of them must be discarded and re-created with
   * the new model on the next prompt.
   */
  removeAll(ws: WebSocket): void {
    const store = this.getWsStore(ws);
    for (const [sid, entry] of store) {
      this.subscriptions.get(sid)?.();
      this.subscriptions.delete(sid);
      entry.unsub();
      entry.agentSession.dispose();
      this.sessions.delete(sid);
    }
    store.clear();
    this.wsCurrentSessionId.delete(ws);
  }

  cleanup(ws: WebSocket): void {
    const store = this.wsSessions.get(ws);
    if (!store) return;
    for (const [sid, entry] of store) {
      this.subscriptions.get(sid)?.();
      this.subscriptions.delete(sid);
      entry.unsub();
      entry.agentSession.dispose();
      this.sessions.delete(sid);
    }
    store.clear();
    this.wsCurrentSessionId.delete(ws);
  }

  // ── Per-WebSocket model preference ──────────────────────────
  private wsPreferredModel = new WeakMap<WebSocket, string>();

  setPreferredModel(ws: WebSocket, model: string): void {
    this.wsPreferredModel.set(ws, model);
  }

  getPreferredModel(ws: WebSocket): string | undefined {
    return this.wsPreferredModel.get(ws);
  }

  updateUnsub(ws: WebSocket, storeSessionId: string, unsub: () => void): void {
    const wsStore = this.getWsStore(ws);
    const existing = wsStore.get(storeSessionId);
    if (existing) {
      existing.unsub = unsub;
    }
  }

  setState(
    storeSessionId: string,
    state: Session["state"],
    userId?: string,
  ): void {
    const session = this.sessions.get(storeSessionId);
    if (session && (userId === undefined || session.userId === userId)) {
      session.state = state;
    }
  }
}

// Module-level per-WebSocket model preference (accessed by index.ts too)
const wsModelPreferences = new WeakMap<WebSocket, string>();

export function setWsPreferredModel(ws: WebSocket, model: string): void {
  wsModelPreferences.set(ws, model);
}

export function getWsPreferredModel(ws: WebSocket): string | undefined {
  return wsModelPreferences.get(ws);
}

export interface VerifiedUserContext {
  userId: string;
  token: string;
}

// Per-WebSocket verified identity (resolved from the JWT by ws-auth).
// null means the token was rejected; undefined means not yet verified.
const wsVerifiedUsers = new WeakMap<WebSocket, VerifiedUserContext | null>();
const wsAuthPending = new WeakMap<
  WebSocket,
  Promise<VerifiedUserContext | null> | null
>();

export function setWsVerifiedUser(
  ws: WebSocket,
  context: VerifiedUserContext | null,
): void {
  wsVerifiedUsers.set(ws, context);
}

export function getWsVerifiedUser(
  ws: WebSocket,
): VerifiedUserContext | null | undefined {
  return wsVerifiedUsers.get(ws);
}

export function setWsAuthPending(
  ws: WebSocket,
  pending: Promise<VerifiedUserContext | null> | null,
): void {
  wsAuthPending.set(ws, pending);
}

export function getWsAuthPending(
  ws: WebSocket,
): Promise<VerifiedUserContext | null> | null | undefined {
  return wsAuthPending.get(ws);
}
