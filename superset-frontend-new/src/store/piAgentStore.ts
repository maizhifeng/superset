import { create } from "zustand";
import { useAgentStore } from "@/store/agentStore";
import type { AgentStep, StepType } from "@/types/ai";
import type { ServerMessage, InsightEvent } from "@/api/piAgentClient";

/**
 * Transient runtime state for the pi-agent WebSocket session.
 *
 * Kept separate from the persisted session history (agentStore): this store
 * holds connection flags, model list, and per-session stream buffers
 * (text/thinking deltas, reasoning flags, running-session set, completed
 * thinking, captured turn-step offsets).  It is deliberately NOT persisted.
 *
 * The fields are keyed by session id because the connection juggles one
 * active session at a time but a finished turn's thinking must be retained
 * (completedThinking) for the drawer to show after the buffer is cleared.
 */

type ReasoningState = "streaming" | "done";

interface PiAgentConnectionState {
  isConnected: boolean;
  currentSessionId: string | null;
  currentModel: string;
  modelList: { id: string; name?: string }[];

  // per-session buffers
  text: Record<string, string>;
  thinking: Record<string, string>;
  reasoning: Record<string, ReasoningState>;
  running: string[];
  completedThinking: Record<string, string>;
  turnStepCount: Record<string, number>;

  setConnected: (connected: boolean) => void;
  setCurrentSession: (sessionId: string) => void;
  setModel: (model: string) => void;
  setModelList: (models: { id: string; name?: string }[], current?: string) => void;
  resetSessionBuffers: (sessionId: string) => void;
  appendText: (sessionId: string, delta: string) => void;
  appendThinking: (sessionId: string, delta: string) => void;
  finishReasoning: (sessionId: string) => void;
  captureStepCount: (sessionId: string, count: number) => void;
  completeTurn: (sessionId: string) => void;
  failTurn: (sessionId: string) => void;
  clearBuffers: (sessionId: string) => void;
  clearRuntime: () => void;
}

export const usePiAgentStore = create<PiAgentConnectionState>()((set) => ({
  isConnected: false,
  currentSessionId: null,
  currentModel: "",
  modelList: [],
  text: {},
  thinking: {},
  reasoning: {},
  running: [],
  completedThinking: {},
  turnStepCount: {},

  setConnected: (connected) => set({ isConnected: connected }),

  setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),

  setModel: (model) => set({ currentModel: model }),

  setModelList: (models, current) =>
    set((state) => ({
      modelList: models,
      currentModel: current ?? state.currentModel,
    })),

  resetSessionBuffers: (sessionId) =>
    set((state) => ({
      text: { ...state.text, [sessionId]: "" },
      thinking: { ...state.thinking, [sessionId]: "" },
      reasoning: { ...state.reasoning, [sessionId]: "streaming" },
      running: state.running.includes(sessionId)
        ? state.running
        : [...state.running, sessionId],
    })),

  appendText: (sessionId, delta) =>
    set((state) => ({
      text: {
        ...state.text,
        [sessionId]: (state.text[sessionId] ?? "") + delta,
      },
    })),

  appendThinking: (sessionId, delta) =>
    set((state) => ({
      thinking: {
        ...state.thinking,
        [sessionId]: (state.thinking[sessionId] ?? "") + delta,
      },
    })),

  finishReasoning: (sessionId) =>
    set((state) => ({
      reasoning: { ...state.reasoning, [sessionId]: "done" },
    })),

  captureStepCount: (sessionId, count) =>
    set((state) => ({
      turnStepCount: { ...state.turnStepCount, [sessionId]: count },
    })),

  completeTurn: (sessionId) =>
    set((state) => {
      const finishedThinking = state.thinking[sessionId] ?? "";
      const completedThinking = finishedThinking
        ? { ...state.completedThinking, [sessionId]: finishedThinking }
        : state.completedThinking;
      return {
        reasoning: { ...state.reasoning, [sessionId]: "done" },
        running: state.running.filter((s) => s !== sessionId),
        completedThinking,
      };
    }),

  failTurn: (sessionId) =>
    set((state) => ({
      running: state.running.filter((s) => s !== sessionId),
    })),

  clearBuffers: (sessionId) =>
    set((state) => ({
      text: { ...state.text, [sessionId]: "" },
      thinking: { ...state.thinking, [sessionId]: "" },
      turnStepCount: Object.fromEntries(
        Object.entries(state.turnStepCount).filter(([k]) => k !== sessionId),
      ),
    })),

  clearRuntime: () =>
    set({
      isConnected: false,
      currentSessionId: null,
      currentModel: "",
      modelList: [],
      text: {},
      thinking: {},
      reasoning: {},
      running: [],
      completedThinking: {},
      turnStepCount: {},
    }),
}));

/**
 * Reduce a pi-agent event into the transient store and the persisted session
 * history.  Insight events are routed to {@link onInsight} and never touch
 * chat history.  Returns false if the event was dropped (no session id).
 */
function isInsightEvent(
  event: { type: string; storeSessionId?: string; insight?: boolean },
): event is InsightEvent {
  return event.insight === true && typeof event.storeSessionId === "string";
}

export function reducePiAgentEvent(
  event: ServerMessage,
  fallbackSessionId: string,
  onInsight?: (event: InsightEvent) => void,
): boolean {
  if (isInsightEvent(event)) {
    onInsight?.(event);
    return true;
  }

  const sid =
    ("storeSessionId" in event && event.storeSessionId) || fallbackSessionId;
  if (!sid) return false;

  const conn = usePiAgentStore.getState();
  const agent = useAgentStore.getState();

  switch (event.type) {
    case "agent_start": {
      const stepCount =
        agent.sessions.find((s) => s.id === sid)?.steps.length ?? 0;
      conn.setCurrentSession(sid);
      conn.captureStepCount(sid, stepCount);
      conn.resetSessionBuffers(sid);
      break;
    }

    case "message_update": {
      if (event.assistantMessageEvent.type === "text_delta") {
        const delta = event.assistantMessageEvent.delta;
        // First text delta: transition reasoning streaming -> done (idempotent).
        const current = conn.text[sid] ?? "";
        if (!current && conn.thinking[sid]) {
          conn.finishReasoning(sid);
        }
        conn.appendText(sid, delta);
      }
      break;
    }

    case "thinking_delta":
      if (event.delta) conn.appendThinking(sid, event.delta);
      break;

    case "tool_execution_start": {
      const step = buildStep(event);
      agent.addStep(sid, step);
      break;
    }

    case "tool_execution_end": {
      const stepTimestamp = Date.now();
      const prevTimestamp =
        agent.sessions
          .find((s) => s.id === sid)
          ?.steps.find((s) => s.id === event.toolCallId)?.timestamp ??
        stepTimestamp;
      agent.updateStep(sid, event.toolCallId, {
        status: "done",
        result: (event.result as string | undefined)?.slice(0, 500),
        duration: stepTimestamp - prevTimestamp,
      });
      break;
    }

    case "agent_end": {
      conn.completeTurn(sid);
      const finishedThinking = conn.completedThinking[sid] ?? "";
      const textContent = conn.text[sid] ?? "";
      const summary = event.finalText || textContent || finishedThinking || "";
      const stepStart = conn.turnStepCount[sid] ?? 0;
      const sessionSteps =
        agent.sessions.find((s) => s.id === sid)?.steps.slice(stepStart) ?? [];
      agent.addMessage(sid, "assistant", {
        type: "agent_done",
        steps: sessionSteps,
        summary,
        thinking: finishedThinking || undefined,
      });
      agent.setSessionSummary(sid, summary.slice(0, 200));
      conn.clearBuffers(sid);
      break;
    }

    case "error":
      conn.failTurn(sid);
      agent.addMessage(sid, "assistant", {
        type: "error",
        message: event.message,
        retryable: event.retryable,
      });
      break;

    case "model_list":
      conn.setModelList(event.models, event.current);
      break;
  }
  return true;
}

/** Build an AgentStep from a tool_execution_start event. */
function buildStep(
  event: Extract<ServerMessage, { type: "tool_execution_start" }>,
): AgentStep {
  const toolName = event.toolName || "query_superset";
  const stepType: StepType =
    toolName === "get_dataset_schema" ? "schema" : "query";
  const args = event.args as Record<string, unknown> | undefined;

  let description = toolName;
  if (toolName === "query_superset" && args) {
    const c = args.columns as string[] | undefined;
    const m = args.metrics as string[] | undefined;
    const t = args.time_range as string | undefined;
    const parts: string[] = [];
    if (c && c.length > 0) parts.push(`维度:${c.join(",")}`);
    if (m && m.length > 0) parts.push(`指标:${m.length}`);
    if (t) parts.push(t);
    description = parts.length > 0 ? parts.join(" | ") : toolName;
  }

  return {
    id: event.toolCallId,
    type: stepType,
    status: "running",
    description,
    args,
    timestamp: Date.now(),
  };
}
