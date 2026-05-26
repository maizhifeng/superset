import { useState, useRef, useCallback } from "react";
import { streamChartInsight, streamChat, abortSession } from "@/api/aiInsight";
import { useAiConfigStore } from "@/config/aiConfig";

interface ModelConfig {
  provider: string;
  model: string;
}

export function useInsight() {
  const [insightText, setInsightText] = useState("");
  const [reasoningText, setReasoningText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentToolCalls, setCurrentToolCalls] = useState<
    { tool: string; status: "calling" | "done" }[]
  >([]);
  const activePreset = useAiConfigStore((s) => s.activePreset);
  const modelConfigRef = useRef<ModelConfig>({
    provider: activePreset.provider,
    model: activePreset.model,
  });
  modelConfigRef.current = {
    provider: activePreset.provider,
    model: activePreset.model,
  };
  const abortRef = useRef<AbortController | null>(null);

  const modelConfig: ModelConfig = {
    provider: activePreset.provider,
    model: activePreset.model,
  };

  const updateModelConfig = useCallback((cfg: ModelConfig) => {
    useAiConfigStore.getState().update(activePreset.id, {
      provider: cfg.provider,
      model: cfg.model,
    });
  }, [activePreset.id]);

  const generate = useCallback(
    async (chartId: number, filters: Record<string, unknown> = {}) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setLoading(true);
      setError("");
      setInsightText("");
      setReasoningText("");
      setCurrentToolCalls([]);

      try {
        const sid = await streamChartInsight(
          chartId,
          filters,
          {
            onSession: (sid) => setSessionId(sid),
            onToolCall: (tool) =>
              setCurrentToolCalls((prev) => [...prev, { tool, status: "calling" }]),
            onToolResult: (tool) =>
              setCurrentToolCalls((prev) =>
                prev.map((t) => (t.tool === tool ? { ...t, status: "done" } : t)),
              ),
            onText: (token) => setInsightText((prev) => prev + token),
            onReasoning: (token) => setReasoningText((prev) => prev + token),
            onStatus: (status) => {
              if (status.startsWith("retry")) {
                setCurrentToolCalls((prev) => [...prev, { tool: `⏳ ${status}`, status: "calling" }]);
              }
            },
          },
          abort.signal,
          modelConfigRef.current,
        );
        setSessionId(sid);
      } catch (e: unknown) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "分析失败，请重试");
      } finally {
        setLoading(false);
        setCurrentToolCalls([]);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      if (!sessionId) return;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setLoading(true);
      setError("");
      setCurrentToolCalls([]);
      setInsightText((prev) => prev + "\n\n---\n\n");

      try {
        await streamChat(sessionId, message, {
          onToolCall: (tool) =>
            setCurrentToolCalls((prev) => [...prev, { tool, status: "calling" }]),
          onToolResult: (tool) =>
            setCurrentToolCalls((prev) =>
              prev.map((t) => (t.tool === tool ? { ...t, status: "done" } : t)),
            ),
          onText: (token) => setInsightText((prev) => prev + token),
          onReasoning: (token) => setReasoningText((prev) => prev + token),
        }, abort.signal, modelConfigRef.current);
      } catch (e: unknown) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "消息发送失败");
      } finally {
        setLoading(false);
        setCurrentToolCalls([]);
      }
    },
    [sessionId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (sessionId) abortSession(sessionId).catch(() => {});
    setLoading(false);
    setCurrentToolCalls([]);
  }, [sessionId]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    if (sessionId) abortSession(sessionId).catch(() => {});
    setInsightText("");
    setReasoningText("");
    setLoading(false);
    setError("");
    setSessionId(null);
    setCurrentToolCalls([]);
  }, [sessionId]);

  return {
    insightText, reasoningText, loading, error, sessionId,
    currentToolCalls, generate, sendMessage, clear, stop,
    modelConfig, updateModelConfig,
  };
}
