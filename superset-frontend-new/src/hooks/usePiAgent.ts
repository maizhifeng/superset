import { useState, useEffect, useRef, useCallback } from "react";
import { PiAgentClient } from "@/api/piAgentClient";
import { useAgentStore } from "@/store/agentStore";
import { useAuthStore } from "@/store/authStore";
import type { AgentStep, StepType } from "@/components/AgentApp/types";

interface UsePiAgentReturn {
  isConnected: boolean;
  isRunning: boolean;
  currentText: string;
  currentThinking: string;
  isThinkingDone: boolean;
  currentModel: string;
  modelList: { id: string; name?: string }[];
  steps: AgentStep[];
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
let _textBuffers = new Map<string, string>();
let _thinkingBuffers = new Map<string, string>();
let _thinkingDone = new Set<string>();
let _runningSessions = new Set<string>();
let _completedThinking = new Map<string, string>();
let _listenerInstalled = false;
let _modelList: { id: string; name?: string }[] = [];
let _modelListUpdaters = new Set<(models: { id: string; name?: string }[]) => void>();
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
        _thinkingDone.delete(sid);
        _runningSessions.add(sid);
        break;

      case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            const delta = event.assistantMessageEvent.delta;
            const buf = _textBuffers.get(sid) ?? "";
            if (!buf && _thinkingBuffers.has(sid) && !_thinkingDone.has(sid)) {
              _thinkingDone.add(sid);
            }
            _textBuffers.set(sid, buf + delta);
          }
          break;

      case "thinking_delta":
          if ((event as any).delta) {
            const delta = (event as any).delta;
            if (_thinkingDone.has(sid)) _thinkingDone.delete(sid);
            const buf = _thinkingBuffers.get(sid) ?? "";
            _thinkingBuffers.set(sid, buf + delta);
          }
          break;

      case "tool_execution_start": {
        const toolName = (event.toolName as string) || "query_superset";
        const stepType: StepType = toolName === "get_dataset_schema" ? "schema" : "query";
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

        const duration = stepTimestamp - (store.getActiveSession()?.steps.find((s) => s.id === event.toolCallId)?.timestamp ?? stepTimestamp);
        store.updateStep(sid, event.toolCallId, {
          status: "done",
          result: rawResult?.slice(0, 500),
          duration,
        });
        break;
      }

      case "agent_end": {
        _runningSessions.delete(sid);
        _thinkingDone.add(sid);
        const finishedThinking = _thinkingBuffers.get(sid) ?? "";
        if (finishedThinking) {
          _completedThinking.set(sid, finishedThinking);
        }
        store.addMessage(sid, "assistant", {
          type: "agent_done",
          steps: store.getActiveSession()?.steps ?? [],
          summary: (event as any).finalText || _textBuffers.get(sid) || "",
        });
        store.setSessionSummary(sid, ((event as any).finalText || _textBuffers.get(sid) || "").slice(0, 200));
        _textBuffers.delete(sid);
        _thinkingBuffers.delete(sid);
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

      case "model_list":
        _modelList = (event as any).models ?? [];
        _modelListUpdaters.forEach((fn) => fn(_modelList));
        break;
    }

    notifyUpdaters();
  });
}

export function usePiAgent(): UsePiAgentReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(_runningSessions.size > 0);
  const [currentText, setCurrentText] = useState("");
  const [currentThinking, setCurrentThinking] = useState("");
  const savedModel = typeof window !== "undefined" ? localStorage.getItem("pi_agent_model") || "gemma-4-e2b-it" : "gemma-4-e2b-it";
  const [currentModel, setCurrentModel] = useState(savedModel);
  const [modelList, setModelList] = useState<{ id: string; name?: string }[]>(_modelList);
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
    _updaters.add(callbackRef.current);
    const modelUpdater = (models: { id: string; name?: string }[]) => setModelList(models);
    _modelListUpdaters.add(modelUpdater);
    return () => {
      _updaters.delete(callbackRef.current);
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
    const restored = typeof window !== "undefined" ? localStorage.getItem("pi_agent_model") : null;
    if (restored && restored !== "gemma-4-e2b-it") {
      _client?.setModel(restored);
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

  const isSessionRunning = useCallback((sessionId: string) => _runningSessions.has(sessionId), []);

  const setModel = useCallback((model: string) => {
    try { localStorage.setItem("pi_agent_model", model); } catch {}
    _client?.setModel(model);
    setCurrentModel(model);
  }, []);

  const sid = _sessionId;
  const completionThinking = sid ? _completedThinking.get(sid) : undefined;
  const displayThinking = currentThinking || completionThinking || "";
  const isThinkingDone = sid ? _thinkingDone.has(sid) : false;

  return { isConnected, isRunning, currentText, currentThinking: displayThinking, isThinkingDone, currentModel, modelList, steps, sendMessage, setModel, abort, connect, disconnect, isSessionRunning };
}
