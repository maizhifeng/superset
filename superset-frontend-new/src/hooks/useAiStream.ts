import { useState, useRef, useCallback } from "react";
import { DEFAULT_CHAT_SYSTEM_PROMPT } from "@/config/systemPrompts";

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
    enableTools?: boolean,
  ) => Promise<string>;
  stop: () => void;
  streaming: boolean;
}

export function useAiStream(options: UseAiStreamOptions = {}): UseAiStreamReturn {
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const stream = useCallback(
    async (
      text: string,
      history?: { role: string; content: string }[],
      onToken?: (full: string) => void,
      enableTools?: boolean,
    ) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setStreaming(true);

      let full = "";
      let errored = false;

      const { streamDirectChat, streamWithTools } = await import("@/api/aiInsight");
      const { getActivePreset } = await import("@/config/aiConfig");
      const preset = getActivePreset();

      const systemPrompt =
        options.systemPrompt ?? DEFAULT_CHAT_SYSTEM_PROMPT;

      const notify = (onToken ?? options.onToken);

      const onText = (token: string) => {
        full += token;
        if (notify) notify(full);
      };

      try {
        if (enableTools) {
          await streamWithTools(
            systemPrompt,
            text,
            { onText, onError: () => { errored = true; } },
            abort.signal,
            {
              provider: preset.provider,
              model: preset.model,
              baseUrl: preset.baseUrl,
            },
            history,
          );
        } else {
          await streamDirectChat(
            text,
            systemPrompt,
            { onText, onError: () => { errored = true; } },
            abort.signal,
            {
              provider: preset.provider,
              model: preset.model,
              baseUrl: preset.baseUrl,
            },
            history,
          );
        }
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
