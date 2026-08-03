import { useState, useRef, useCallback } from "react";
import { streamChartInsight, streamChat } from "@/api/aiInsight";
import { useAiConfigStore, getActivePreset } from "@/config/aiConfig";

interface InsightMessage {
  role: "user" | "assistant";
  content: string;
}

interface ModelConfig {
  provider: string;
  model: string;
}

export function useInsight() {
  const [insightText, setInsightText] = useState("");
  const [reasoningText, setReasoningText] = useState("");
  const [messages, setMessages] = useState<InsightMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activePreset = useAiConfigStore((s) => s.activePreset);
  const abortRef = useRef<AbortController | null>(null);

  const modelConfig: ModelConfig = {
    provider: activePreset.provider,
    model: activePreset.model,
  };

  const updateModelConfig = useCallback(
    (cfg: ModelConfig) => {
      useAiConfigStore.getState().update(activePreset.id, {
        provider: cfg.provider,
        model: cfg.model,
      });
    },
    [activePreset.id],
  );

  const generate = useCallback(
    async (chartId: number, filters: Record<string, unknown> = {}) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      setLoading(true);
      setError("");
      setInsightText("");
      setReasoningText("");
      setMessages([]);

      try {
        const preset = getActivePreset();
        await streamChartInsight(
          chartId,
          filters,
          {
            onText: (token) => setInsightText((prev) => prev + token),
            onReasoning: (token) => setReasoningText((prev) => prev + token),
            onStatus: (_status) => {
              /* status updates handled internally */
            },
          },
          abort.signal,
          {
            provider: preset.provider,
            model: preset.model,
            baseUrl: preset.baseUrl,
          },
        );
      } catch (e: unknown) {
        if ((e as Error).name === "AbortError") return;
        setError(
          e instanceof Error && e.message ? e.message : "分析失败，请重试",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const history = messages;
      const userMsg: InsightMessage = { role: "user", content: message };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError("");
      setInsightText((prev) => prev + "\n\n---\n\n");

      try {
        const preset = getActivePreset();
        await streamChat(
          "",
          message,
          {
            onText: (token) => setInsightText((prev) => prev + token),
            onReasoning: (token) => setReasoningText((prev) => prev + token),
          },
          abort.signal,
          {
            provider: preset.provider,
            model: preset.model,
            baseUrl: preset.baseUrl,
          },
          history,
        );
      } catch (e: unknown) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error && e.message ? e.message : "消息发送失败");
      } finally {
        setLoading(false);
      }
    },
    [messages],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setInsightText("");
    setReasoningText("");
    setMessages([]);
    setLoading(false);
    setError("");
  }, []);

  return {
    insightText,
    reasoningText,
    messages,
    loading,
    error,
    currentToolCalls: [],
    generate,
    sendMessage,
    clear,
    stop,
    modelConfig,
    updateModelConfig,
  };
}
