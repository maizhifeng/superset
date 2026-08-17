import { useEffect, useMemo, useRef } from "react";
import { useCallback } from "react";
import { PiAgentClient, type InsightEvent } from "@/api/piAgentClient";
import { useAgentStore } from "@/store/agentStore";
import { usePiAgentStore, reducePiAgentEvent } from "@/store/piAgentStore";
import { useAuthStore } from "@/store/authStore";
import type { AgentStep } from "@/types/ai";

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

// One WebSocket client per app instance.  The client is imperative (it owns
// the socket + reconnect timers); its events are reduced into the
// piAgentStore by the listener installed below.
let _client: PiAgentClient | null = null;
let _listenerInstalled = false;

/** Module-level registry of insight listeners (chart-insight events). */
const _insightListeners = new Set<(event: InsightEvent) => void>();

/** Subscribe to chart-insight events. Returns an unsubscribe function. */
export function subscribeInsight(
  listener: (event: InsightEvent) => void,
): () => void {
  _insightListeners.add(listener);
  return () => {
    _insightListeners.delete(listener);
  };
}

/**
 * Get the shared agent client, creating it (and installing the WebSocket
 * event listener) on first use.  Used by the insight hook to send requests
 * over the same connection.
 */
export function getOrCreateAgentClient(): PiAgentClient {
  installListener();
  return _client as PiAgentClient;
}

function installListener() {
  if (_listenerInstalled) return;
  _listenerInstalled = true;

  const user = useAuthStore.getState().user;
  const client = new PiAgentClient(user?.username ?? "anonymous");
  _client = client;

  client.on((event) => {
    const sid = usePiAgentStore.getState().currentSessionId ?? "";
    reducePiAgentEvent(event, sid, (insight) => {
      _insightListeners.forEach((fn) => fn(insight));
    });
  });
}

export function usePiAgent(): UsePiAgentReturn {
  const isConnected = usePiAgentStore((s) => s.isConnected);
  const currentSessionId = usePiAgentStore((s) => s.currentSessionId);
  const text = usePiAgentStore((s) => s.text);
  const thinking = usePiAgentStore((s) => s.thinking);
  const reasoning = usePiAgentStore((s) => s.reasoning);
  const running = usePiAgentStore((s) => s.running);
  const completedThinking = usePiAgentStore((s) => s.completedThinking);
  const turnStepCount = usePiAgentStore((s) => s.turnStepCount);
  const currentModel = usePiAgentStore((s) => s.currentModel);
  const modelList = usePiAgentStore((s) => s.modelList);
  const steps = useAgentStore(
    (s) => s.sessions.find((x) => x.id === currentSessionId)?.steps ?? [],
  );

  // Poll the socket's connected flag into the store so a connect that hasn't
  // fired its own event yet still reflects the real socket state.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const connected = _client?.connected ?? false;
      usePiAgentStore.setState((s) =>
        s.isConnected === connected ? s : { isConnected: connected },
      );
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const sid = currentSessionId;
  const currentText = sid ? (text[sid] ?? "") : "";
  const rawThinking = sid ? (thinking[sid] ?? "") : "";
  const completionThinking = sid ? completedThinking[sid] : undefined;
  const displayThinking = rawThinking || completionThinking || "";
  const isThinkingDone = sid ? reasoning[sid] === "done" : false;
  const isRunning =
    isConnected && sid ? running.includes(sid) : running.length > 0;

  const connect = useCallback((sessionId: string) => {
    const prev = usePiAgentStore.getState().currentSessionId;
    const isNew = prev !== null && prev !== sessionId;
    usePiAgentStore.getState().setCurrentSession(sessionId);

    if (_client?.connected) {
      if (isNew) _client.selectSession(sessionId);
      return;
    }

    installListener();
    // The server resolves the per-user persisted model preference when the
    // session is created, so nothing needs to be replayed client-side.
    _client!.connect(sessionId);
  }, []);

  const sendMessage = useCallback((text: string) => {
    const store = useAgentStore.getState();
    const sid = usePiAgentStore.getState().currentSessionId;
    if (!sid) return;
    store.addMessage(sid, "user", { type: "text", body: text });
    _client?.sendMessage(text, sid);
  }, []);

  const abort = useCallback(() => {
    _client?.abort();
    usePiAgentStore.getState().clearRuntime();
  }, []);

  const disconnect = useCallback(() => {
    _client?.disconnect();
    usePiAgentStore.getState().clearRuntime();
  }, []);

  const isSessionRunning = useCallback(
    (sessionId: string) =>
      usePiAgentStore.getState().running.includes(sessionId),
    [],
  );

  const setModel = useCallback((model: string) => {
    usePiAgentStore.getState().setModel(model);
    _client?.setModel(model);
  }, []);

  return useMemo(() => {
    const turnStart = sid ? turnStepCount[sid] : undefined;
    const turnSteps =
      turnStart !== undefined && steps.length >= turnStart
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
  }, [
    isConnected,
    isRunning,
    currentText,
    displayThinking,
    isThinkingDone,
    currentModel,
    modelList,
    steps,
    turnStepCount,
    sid,
    sendMessage,
    setModel,
    abort,
    connect,
    disconnect,
    isSessionRunning,
  ]);
}
