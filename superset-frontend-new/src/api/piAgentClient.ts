import { getAgentWsUrl } from "@/utils/agentWsUrl";

type ModelInfo = { id: string; name?: string };
type ServerMessage =
  | { type: "session_created"; sessionId: string }
  | { type: "agent_start"; storeSessionId?: string }
  | {
      type: "message_update";
      storeSessionId?: string;
      assistantMessageEvent: { type: "text_delta"; delta: string };
    }
  | { type: "thinking_delta"; storeSessionId?: string; delta: string }
  | {
      type: "tool_execution_start";
      storeSessionId?: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | { type: "tool_execution_update"; toolCallId: string; partialResult: string }
  | {
      type: "tool_execution_end";
      storeSessionId?: string;
      toolCallId: string;
      result: string;
    }
  | {
      type: "agent_end";
      storeSessionId?: string;
      messages: unknown[];
      finalText?: string;
    }
  | { type: "model_list"; models: ModelInfo[]; current?: string }
  | { type: "error"; message: string; retryable: boolean };

/** Event handler for messages received from the pi-agent WebSocket. */
export type PiAgentEventHandler = (event: ServerMessage) => void;

const RECONNECT_BASE_MS = 1500;
const PENDING_TIMEOUT_MS = 5000;

/**
 * Low-level WebSocket client for the pi-agent server.  Wraps session
 * creation, prompt streaming, auth, reconnect and buffering; consumed by
 * usePiAgent which translates the events into agentStore sessions/steps.
 */
export class PiAgentClient {
  private ws: WebSocket | null = null;
  private userId: string;
  private sessionId: string | null = null;
  private storeSessionId: string | null = null;
  private handlers: PiAgentEventHandler[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingMessages: unknown[] = [];
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  on(handler: PiAgentEventHandler): void {
    this.handlers.push(handler);
  }

  off(handler: PiAgentEventHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  connect(storeSessionId: string): void {
    this.storeSessionId = storeSessionId;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "new_session", user_id: this.userId, storeSessionId });
      return;
    }

    const wsUrl = getAgentWsUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      const token = localStorage.getItem("superset_token");
      if (token) {
        this.send({ type: "auth", access_token: token });
      }
      this.flushPending();
      this.send({ type: "new_session", user_id: this.userId, storeSessionId });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "session_created") {
          this.sessionId = msg.sessionId;
          this.clearPendingTimer();
          this.flushPending();
        }
        this.handlers.forEach((h) => h(msg));
      } catch {
        // skip malformed messages
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.reconnectAttempts = 999;
    this.clearReconnect();
    this.clearPendingTimer();
    this.ws?.close();
    this.ws = null;
  }

  selectSession(storeSessionId: string): void {
    this.sessionId = storeSessionId;
    this.flushPending();
    this.send({ type: "new_session", user_id: this.userId, storeSessionId });
  }

  sendMessage(text: string, storeSessionId?: string): void {
    const msg: Record<string, unknown> = { type: "prompt", message: text };
    if (storeSessionId) msg.storeSessionId = storeSessionId;
    if (!this.sessionId) {
      this.pendingMessages.push(msg);
      this.startPendingTimer();
      return;
    }
    this.send(msg);
  }

  setModel(model: string): void {
    const payload = { type: "set_model" as const, model, user_id: this.userId };
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingMessages.push(payload);
      this.startPendingTimer();
      return;
    }
    this.send(payload);
  }

  abort(): void {
    this.send({ type: "abort" });
  }

  private startPendingTimer(): void {
    if (this.pendingTimer) return;
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this.pendingMessages.unshift({
        type: "new_session",
        user_id: this.userId,
        storeSessionId: this.storeSessionId || "reconnect",
      });
      this.reconnect();
    }, PENDING_TIMEOUT_MS);
  }

  private clearPendingTimer(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  private flushPending(): void {
    for (const msg of this.pendingMessages) {
      this.send(msg);
    }
    this.pendingMessages = [];
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private reconnect(): void {
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
    this.connect(this.storeSessionId || "reconnect");
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = RECONNECT_BASE_MS * Math.min(this.reconnectAttempts, 5);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }
}
