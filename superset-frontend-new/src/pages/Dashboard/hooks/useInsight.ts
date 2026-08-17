import { useState, useRef, useCallback, useEffect } from "react";
import {
  subscribeInsight,
  getOrCreateAgentClient,
} from "@/hooks/usePiAgent";

/**
 * Chart insight via the shared Pi agent WebSocket. The agent server fetches
 * the chart data with the verified user token and streams the analysis
 * back; no LLM calls happen in the browser.
 */
export function useInsight() {
  const [insightText, setInsightText] = useState("");
  const [reasoningText, setReasoningText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef<string | null>(null);

  const generate = useCallback(
    (chartId: number, filters: Record<string, unknown> = {}) => {
      const requestId = `insight_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      requestIdRef.current = requestId;
      setLoading(true);
      setError("");
      setInsightText("");
      setReasoningText("");
      getOrCreateAgentClient().sendInsight(requestId, { chartId, filters });
    },
    [],
  );

  const sendMessage = useCallback((message: string) => {
    const requestId = requestIdRef.current;
    if (!requestId) {
      setError("请先生成分析后再提问");
      return;
    }
    setLoading(true);
    setError("");
    setInsightText((prev) => prev + "\n\n---\n\n");
    getOrCreateAgentClient().sendInsight(requestId, { prompt: message });
  }, []);

  const stop = useCallback(() => {
    const requestId = requestIdRef.current;
    if (requestId) getOrCreateAgentClient().abortInsight(requestId);
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    stop();
    setInsightText("");
    setReasoningText("");
    setError("");
  }, [stop]);

  useEffect(() => {
    const off = subscribeInsight((event) => {
      if (event.storeSessionId !== requestIdRef.current) return;
      switch (event.type) {
        case "agent_start":
          setLoading(true);
          break;
        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            setInsightText(
              (prev) => prev + event.assistantMessageEvent.delta,
            );
          }
          break;
        case "thinking_delta":
          setReasoningText((prev) => prev + event.delta);
          break;
        case "agent_end":
          setLoading(false);
          break;
        case "error":
          setError(event.message);
          setLoading(false);
          break;
      }
    });
    return off;
  }, []);

  return {
    insightText,
    reasoningText,
    loading,
    error,
    generate,
    sendMessage,
    clear,
    stop,
  };
}
