import { getActivePreset } from "@/config/aiConfig";

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${text}`);
  }
}

function extractOutput(data: Record<string, unknown>): {
  content: string;
  reasoning: string;
} {
  // LM Studio REST API format: { output: [{ type: "message"|"reasoning", content: "..." }] }
  const output = data.output as Record<string, unknown>[] | undefined;
  if (output) {
    let content = "";
    let reasoning = "";
    for (const item of output) {
      if (item.type === "message") content += item.content || "";
      else if (item.type === "reasoning") reasoning += item.content || "";
    }
    return { content: content.trim(), reasoning: reasoning.trim() };
  }

  // OpenAI format fallback: { choices: [{ message: { content, reasoning_content } }] }
  const choices = data.choices as Record<string, unknown>[] | undefined;
  const choice = choices?.[0] as Record<string, unknown> | undefined;
  const message = choice?.message as Record<string, unknown> | undefined;
  return {
    content: ((message?.content as string) || "").trim(),
    reasoning: ((message?.reasoning_content as string) || "").trim(),
  };
}

export async function generateInsightStream(
  systemPrompt: string,
  userPrompt: string,
  onContent: (token: string) => void,
  onReasoning?: (token: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { model, baseUrl } = getActivePreset();
  const body = JSON.stringify({
    model,
    input: userPrompt,
    system_prompt: systemPrompt,
    temperature: 0.7,
    max_output_tokens: 8192,
    stream: true,
  });

  const res = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
  });

  await checkResponse(res);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Stream not supported");

  const decoder = new TextDecoder();
  let buffer = "";
  let isSSE: boolean | null = null;
  let fullText = "";
  let currentEvent = "";

  function yieldToReact(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    if (isSSE === null) {
      isSSE =
        chunk.trimStart().startsWith("data: ") ||
        chunk.includes("\nevent:") ||
        chunk.startsWith("event:");
    }

    if (isSSE) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("event: ")) {
          currentEvent = trimmed.slice(7).trim();
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);

            // LM Studio REST API format — type field tells us the event
            if (parsed.type === "reasoning.delta" && parsed.content) {
              onReasoning?.(parsed.content);
              await yieldToReact();
            } else if (parsed.type === "message.delta" && parsed.content) {
              onContent(parsed.content);
              await yieldToReact();
            } else if (parsed.type === "chat.end") {
              continue;
            }
            // Fallback for event/data split across chunks
            else if (currentEvent === "reasoning.delta" && parsed.content) {
              onReasoning?.(parsed.content);
              await yieldToReact();
            } else if (currentEvent === "message.delta" && parsed.content) {
              onContent(parsed.content);
              await yieldToReact();
            }
            // OpenAI-compatible format
            else {
              const delta = parsed.choices?.[0]?.delta;
              if (delta) {
                if (delta.reasoning_content) {
                  onReasoning?.(delta.reasoning_content);
                  await yieldToReact();
                }
                if (delta.content) {
                  onContent(delta.content);
                  await yieldToReact();
                }
              }
            }
          } catch {
            /* skip malformed JSON */
          }
          continue;
        }

        // Raw JSON lines without "data: " prefix
        if (trimmed.startsWith("{")) {
          try {
            const parsed = JSON.parse(trimmed);
            const delta = parsed.choices?.[0]?.delta;
            if (delta) {
              if (delta.reasoning_content) {
                onReasoning?.(delta.reasoning_content);
                await yieldToReact();
              }
              if (delta.content) {
                onContent(delta.content);
                await yieldToReact();
              }
            }
          } catch {
            /* skip */
          }
        }
      }
    } else {
      fullText += chunk;
    }
  }

  if (!isSSE && fullText) {
    try {
      const data = JSON.parse(fullText);
      const { content, reasoning } = extractOutput(data);
      if (reasoning) {
        onReasoning?.(reasoning);
        await yieldToReact();
      }
      if (content) {
        onContent(content);
        await yieldToReact();
      }
    } catch {
      throw new Error("Failed to parse LLM response");
    }
  }
}
