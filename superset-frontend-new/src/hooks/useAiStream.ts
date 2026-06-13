import { useState, useRef, useCallback } from "react";

interface UseAiStreamOptions {
  systemPrompt?: string;
  onToken?: (text: string) => void;
  onError?: (error: string) => void;
}

interface UseAiStreamReturn {
  stream: (
    text: string,
    history?: { role: string; content: string }[],
    onToken?: (full: string) => void,
  ) => Promise<string>;
  stop: () => void;
  streaming: boolean;
}

export function useAiStream(options: UseAiStreamOptions = {}): UseAiStreamReturn {
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef(0);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    cancelAnimationFrame(rafRef.current);
    setStreaming(false);
  }, []);

  const stream = useCallback(
    async (
      text: string,
      history?: { role: string; content: string }[],
      onToken?: (full: string) => void,
    ) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setStreaming(true);

      let full = "";
      let errored = false;
      let inTable = false;

      const { streamDirectChat } = await import("@/api/aiInsight");
      const { getActivePreset } = await import("@/config/aiConfig");
      const preset = getActivePreset();

      const systemPrompt =
        options.systemPrompt ??
        "You are a helpful data analysis assistant embedded inside Starfly. " +
          "Answer general questions about Starfly features, data visualization, " +
          "SQL, and data analysis. Be concise and practical.\n" +
          "IMPORTANT: Do NOT output any reasoning, planning, or thinking process. " +
          "Output only the final answer directly.";

      const notify = (onToken ?? options.onToken);
      const lastLine = () => {
        const nl = full.lastIndexOf("\n");
        return nl >= 0 ? full.slice(nl + 1) : full;
      };

      const tryRender = () => {
        if (!notify) return;
        const ll = lastLine();
        if (ll.startsWith("|")) {
          if (!ll.endsWith("|") || ll.length <= 1) return;
          if (!full.endsWith("|\n")) return;
          inTable = true;
        } else if (ll.trim() === "" && inTable) {
          return;
        } else if (inTable) {
          return;
        } else {
          inTable = false;
        }
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => notify(full));
      };

      try {
        await streamDirectChat(
          text,
          systemPrompt,
          {
            onText: (token: string) => {
              full += token;
              tryRender();
            },
            onError: () => {
              errored = true;
            },
          },
          abort.signal,
          {
            provider: preset.provider,
            model: preset.model,
            baseUrl: preset.baseUrl,
          },
          history,
        );
        cancelAnimationFrame(rafRef.current);
        if (notify) notify(full);
      } catch (e: unknown) {
        if ((e as Error).name === "AbortError") {
          setStreaming(false);
          throw e;
        }
        errored = true;
        options.onError?.("AI 响应异常，请重试");
      } finally {
        setStreaming(false);
      }

      if (errored) throw new Error("AI 响应异常，请重试");
      return full;
    },
    [options],
  );

  return { stream, stop, streaming };
}
