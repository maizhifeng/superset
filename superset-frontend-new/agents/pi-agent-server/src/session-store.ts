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

  has(ws: WebSocket, storeSessionId: string): boolean {
    return this.getWsStore(ws).has(storeSessionId);
  }

  getAgentSession(
    ws: WebSocket,
    storeSessionId: string,
  ): AgentSession | undefined {
    return this.getWsStore(ws).get(storeSessionId)?.agentSession;
  }

  getSession(storeSessionId: string): Session | undefined {
    return this.sessions.get(storeSessionId);
  }

  getCurrentSessionId(ws: WebSocket): string | undefined {
    return this.wsCurrentSessionId.get(ws);
  }

  setCurrentSessionId(ws: WebSocket, storeSessionId: string): void {
    this.wsCurrentSessionId.set(ws, storeSessionId);
  }

  create(
    ws: WebSocket,
    storeSessionId: string,
    userId: string,
    agentSession: AgentSession,
    datasetId?: number,
  ): void {
    const wsStore = this.getWsStore(ws);
    if (wsStore.has(storeSessionId)) {
      return; // already exists, just activate
    }
    this.sessions.set(storeSessionId, {
      id: storeSessionId,
      userId,
      state: "idle",
      datasetId,
    });
    wsStore.set(storeSessionId, { agentSession, unsub: () => {} });
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

  remove(ws: WebSocket, storeSessionId: string): void {
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
    }
    store.clear();
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

  setState(storeSessionId: string, state: Session["state"]): void {
    const session = this.sessions.get(storeSessionId);
    if (session) {
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

// Per-WebSocket Superset auth token (from frontend's login session)
const wsAuthTokens = new WeakMap<WebSocket, string>();

export function setWsAuthToken(ws: WebSocket, token: string): void {
  wsAuthTokens.set(ws, token);
}

export function getWsAuthToken(ws: WebSocket): string | undefined {
  return wsAuthTokens.get(ws);
}

// Per-WebSocket verified identity (resolved from the JWT by ws-auth).
// null means the token was rejected; undefined means not yet verified.
const wsVerifiedUsers = new WeakMap<WebSocket, string | null>();
const wsAuthPending = new WeakMap<WebSocket, Promise<string | null> | null>();

export function setWsVerifiedUser(
  ws: WebSocket,
  username: string | null,
): void {
  wsVerifiedUsers.set(ws, username);
}

export function getWsVerifiedUser(ws: WebSocket): string | null | undefined {
  return wsVerifiedUsers.get(ws);
}

export function setWsAuthPending(
  ws: WebSocket,
  pending: Promise<string | null> | null,
): void {
  wsAuthPending.set(ws, pending);
}

export function getWsAuthPending(
  ws: WebSocket,
): Promise<string | null> | null | undefined {
  return wsAuthPending.get(ws);
}
