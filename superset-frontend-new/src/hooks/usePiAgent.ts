import { useState, useEffect, useRef, useCallback } from "react";
import { PiAgentClient } from "@/api/piAgentClient";
import { useAgentStore } from "@/store/agentStore";
import { useAuthStore } from "@/store/authStore";
import { getAgentModel, setAgentModel } from "@/config/aiConfig";
import type { AgentStep, StepType } from "@/types/ai";

interface UsePiAgentReturn {
  isConnected: boolean;
  isRunning: boolean;
  currentText: string;
  currentThinking: string;
  isThinkingDone: boolean;
  currentModel: string;
  modelList: { id: string; name?: string }[];
  steps: AgentStep[];
  turnSteps: AgentStep[];
  sendMessage: (text: string) => void;
  setModel: (model: string) => void;
  abort: () => void;
  connect: (sessionId: string) => void;
  disconnect: () => void;
  isSessionRunning: (sessionId: string) => boolean;
}

// Module-level singleton state (no React hooks involved)
let _client: PiAgentClient | null = null;
let _sessionId: string | null = null;
const _textBuffers = new Map<string, string>();
const _thinkingBuffers = new Map<string, string>();
type ReasoningState = "streaming" | "done";
const _reasoningState = new Map<string, ReasoningState>();
const _runningSessions = new Set<string>();
const _completedThinking = new Map<string, string>();
const _turnStepCount = new Map<string, number>();
let _listenerInstalled = false;
let _modelList: { id: string; name?: string }[] = [];
let _currentModel = "";
const _modelListUpdaters = new Set<
  (models: { id: string; name?: string }[], current?: string) => void
>();
const _updaters = new Set<() => void>();

function notifyUpdaters() {
  _updaters.forEach((fn) => fn());
}

function installListener(userId: string) {
  if (_listenerInstalled) return;
  _listenerInstalled = true;

  const client = new PiAgentClient(userId);
  _client = client;

  client.on((event) => {
    const store = useAgentStore.getState();
    const sid = (event as any).storeSessionId || _sessionId;
    if (!sid) return;

    switch (event.type) {
      case "agent_start":
        _textBuffers.set(sid, "");
        _thinkingBuffers.set(sid, "");
        _reasoningState.set(sid, "streaming");
        _runningSessions.add(sid);
        _turnStepCount.set(
          sid,
          store.sessions.find((s) => s.id === sid)?.steps.length ?? 0,
        );
        break;

      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          const delta = event.assistantMessageEvent.delta;
          const buf = _textBuffers.get(sid) ?? "";
          // first text_delta: transition reasoning streaming→done (idempotent)
          if (!buf && _reasoningState.get(sid) === "streaming") {
            const thought = _thinkingBuffers.get(sid);
            if (thought && thought.length > 0) {
              _reasoningState.set(sid, "done");
            }
          }
          _textBuffers.set(sid, buf + delta);
        }
        break;

      case "thinking_delta":
        if ((event as any).delta) {
          const delta = (event as any).delta;
          const buf = _thinkingBuffers.get(sid) ?? "";
          _thinkingBuffers.set(sid, buf + delta);
        }
        break;

      case "tool_execution_start": {
        const toolName = event.toolName || "query_superset";
        const stepType: StepType =
          toolName === "get_dataset_schema" ? "schema" : "query";
        const args = event.args as Record<string, unknown> | undefined;

        // Generate human-readable description from tool args
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

        const step: AgentStep = {
          id: event.toolCallId,
          type: stepType,
          status: "running",
          description,
          args,
          timestamp: Date.now(),
        };
        store.addStep(sid, step);
        break;
      }

      case "tool_execution_end": {
        const stepTimestamp = Date.now();
        const rawResult = event.result as string | undefined;

        const duration =
          stepTimestamp -
          (store
            .getActiveSession()
            ?.steps.find((s) => s.id === event.toolCallId)?.timestamp ??
            stepTimestamp);
        store.updateStep(sid, event.toolCallId, {
          status: "done",
          result: rawResult?.slice(0, 500),
          duration,
        });
        break;
      }

      case "agent_end": {
        _runningSessions.delete(sid);
        _reasoningState.set(sid, "done");
        const finishedThinking = _thinkingBuffers.get(sid) ?? "";
        if (finishedThinking) {
          _completedThinking.set(sid, finishedThinking);
        }
        // if text never arrived, use thinking content as the answer
        const textContent = _textBuffers.get(sid) ?? "";
        const summary =
          (event as any).finalText || textContent || finishedThinking || "";
        const stepStart = _turnStepCount.get(sid) ?? 0;
        const turnSteps =
          store.sessions.find((s) => s.id === sid)?.steps.slice(stepStart) ??
          [];
        _turnStepCount.delete(sid);
        store.addMessage(sid, "assistant", {
          type: "agent_done",
          steps: turnSteps,
          summary,
          thinking: finishedThinking || undefined,
        });
        store.setSessionSummary(sid, summary.slice(0, 200));
        _textBuffers.delete(sid);
        _thinkingBuffers.delete(sid);
        _reasoningState.delete(sid);
        break;
      }

      case "error":
        _runningSessions.delete(sid);
        store.addMessage(sid, "assistant", {
          type: "error",
          message: event.message,
          retryable: event.retryable,
        });
        break;

      case "model_list": {
        const models = (event as any).models ?? [];
        _modelList = models;
        const current = (event as any).current;
        if (typeof current === "string" && current.length > 0) {
          _currentModel = current;
          const saved = getAgentModel();
          if (saved && saved !== current) {
            // A saved preference is replayed only when the provider still
            // serves it; an empty model list (provider not ready at boot)
            // still replays because the server skips validation then.
            const savedAvailable =
              models.length === 0 ||
              models.some((m: { id: string }) => m.id === saved);
            if (savedAvailable) {
              client.setModel(saved);
            } else {
              // The saved model was removed from the provider: fall back to
              // the server current model and persist it so this dead
              // preference is not replayed (and rejected) on every connect.
              try {
                setAgentModel(current);
              } catch {
                /* config store unavailable */
              }
            }
          }
        } else if (_modelList.length > 0 && !_currentModel) {
          _currentModel = _modelList[0].id;
        }
        _modelListUpdaters.forEach((fn) => fn(_modelList, _currentModel));
        break;
      }
    }

    notifyUpdaters();
  });
}

export function usePiAgent(): UsePiAgentReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(_runningSessions.size > 0);
  const [currentText, setCurrentText] = useState("");
  const [currentThinking, setCurrentThinking] = useState("");
  const savedModel =
    typeof window !== "undefined" ? getAgentModel() : "gemma-4-e2b-it";
  const [currentModel, setCurrentModel] = useState(_currentModel || savedModel);
  const [modelList, setModelList] =
    useState<{ id: string; name?: string }[]>(_modelList);
  const [steps, setSteps] = useState<AgentStep[]>([]);

  // Stable hooks to avoid HMR reorder issues — always 4 useState + 1 callback ref
  const callbackRef = useRef<() => void>(() => {
    setIsConnected(_client?.connected ?? false);
    setIsRunning(_runningSessions.size > 0);
    const active = _sessionId;
    if (active) {
      setCurrentText(_textBuffers.get(active) ?? "");
      setCurrentThinking(_thinkingBuffers.get(active) ?? "");
    }
  });

  useEffect(() => {
    const cb = callbackRef.current;
    _updaters.add(cb);
    const modelUpdater = (
      models: { id: string; name?: string }[],
      current?: string,
    ) => {
      setModelList(models);
      if (current) setCurrentModel(current);
    };
    _modelListUpdaters.add(modelUpdater);
    return () => {
      _updaters.delete(cb);
      _modelListUpdaters.delete(modelUpdater);
    };
  }, []);

  useEffect(() => {
    const unsub = useAgentStore.subscribe((state) => {
      const active = state.sessions.find((s) => s.id === state.activeSessionId);
      if (active) setSteps(active.steps);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(_client?.connected ?? false);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const connect = useCallback((sessionId: string) => {
    const prev = _sessionId;
    const isNew = prev !== null && prev !== sessionId;
    _sessionId = sessionId;

    if (_client?.connected) {
      if (isNew) _client.selectSession(sessionId);
      return;
    }

    const user = useAuthStore.getState().user;
    installListener(user?.username ?? "anonymous");
    // On a fresh page load the module model state is unknown: queue the
    // saved preference BEFORE new_session so the first session is created
    // with the right model (pending messages flush before new_session on
    // connect). The model_list flow remains the fallback for server
    // restarts (replay or fallback-to-current).
    if (!_currentModel) {
      try {
        const saved = getAgentModel();
        if (saved) _client?.setModel(saved);
      } catch {
        /* config store unavailable */
      }
    }
    _client!.connect(sessionId);
  }, []);

  const sendMessage = useCallback((text: string) => {
    const store = useAgentStore.getState();
    const sid = _sessionId;
    if (!sid) return;
    store.addMessage(sid, "user", { type: "text", body: text });
    _client?.sendMessage(text, sid);
  }, []);

  const abort = useCallback(() => {
    _client?.abort();
    _runningSessions.clear();
    setIsRunning(false);
  }, []);

  const disconnect = useCallback(() => {
    _client?.disconnect();
    _runningSessions.clear();
    setIsConnected(false);
  }, []);

  const isSessionRunning = useCallback(
    (sessionId: string) => _runningSessions.has(sessionId),
    [],
  );

  const setModel = useCallback((model: string) => {
    try {
      setAgentModel(model);
    } catch {
      /* config store unavailable */
    }
    _currentModel = model;
    _client?.setModel(model);
    setCurrentModel(model);
  }, []);

  const sid = _sessionId;
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const completionThinking = sid ? _completedThinking.get(sid) : undefined;
  const displayThinking = currentThinking || completionThinking || "";
  const isThinkingDone = sid ? _reasoningState.get(sid) === "done" : false;
  const turnStart = sid ? _turnStepCount.get(sid) : undefined;
  const turnSteps =
    turnStart !== undefined && sid === activeSessionId
      ? steps.slice(turnStart)
      : [];

  return {
    isConnected,
    isRunning,
    currentText,
    currentThinking: displayThinking,
    isThinkingDone,
    currentModel,
    modelList,
    steps,
    turnSteps,
    sendMessage,
    setModel,
    abort,
    connect,
    disconnect,
    isSessionRunning,
  };
}
