import { test, expect, vi, beforeEach, afterEach } from "vitest";

/* ---------- mock config ---------- */
vi.mock("@/config/llm", () => ({
  getLlmConfig: vi.fn(() => ({ baseUrl: "/llm/api/v1", model: "test-model" })),
}));

/* ---------- imports ---------- */
import { generateInsightStream } from "@/api/llm";

/* ---------- helpers ---------- */

function sseEvent(event: string, data: string): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`);
}

function sseData(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

function jsonLine(json: string): Uint8Array {
  return new TextEncoder().encode(json + "\n");
}

function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let idx = 0;
  return new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(chunks[idx++]);
      } else {
        controller.close();
      }
    },
  });
}

function mockFetchStream(chunks: Uint8Array[]): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    body: makeStream(chunks),
  } as unknown as Response);
}

function mockFetchJson(data: Record<string, unknown>): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    body: makeStream([new TextEncoder().encode(JSON.stringify(data))]),
  } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ========== basic SSE streaming ========== */

test("streams LM Studio SSE format with event/data", async () => {
  mockFetchStream([
    sseEvent("reasoning.delta", JSON.stringify({ content: "thinking..." })),
    sseEvent("message.delta", JSON.stringify({ content: "Hello" })),
    sseEvent("message.delta", JSON.stringify({ content: " world" })),
    sseEvent("chat.end", ""),
  ]);

  const onContent = vi.fn();
  const onReasoning = vi.fn();

  await generateInsightStream("sys", "user prompt", onContent, onReasoning);

  expect(onReasoning).toHaveBeenCalledWith("thinking...");
  expect(onContent).toHaveBeenCalledTimes(2);
  expect(onContent).toHaveBeenNthCalledWith(1, "Hello");
  expect(onContent).toHaveBeenNthCalledWith(2, " world");
});

test("streams LM Studio SSE format with data: lines (no event header)", async () => {
  mockFetchStream([
    sseData(JSON.stringify({ type: "reasoning.delta", content: "think" })),
    sseData(JSON.stringify({ type: "message.delta", content: "Hi" })),
  ]);

  const onContent = vi.fn();
  const onReasoning = vi.fn();

  await generateInsightStream("", "prompt", onContent, onReasoning);

  expect(onReasoning).toHaveBeenCalledWith("think");
  expect(onContent).toHaveBeenCalledWith("Hi");
});

test("streams OpenAI-compatible SSE format", async () => {
  mockFetchStream([
    sseData(JSON.stringify({ choices: [{ delta: { reasoning_content: "step 1" } }] })),
    sseData(JSON.stringify({ choices: [{ delta: { content: "Answer" } }] })),
  ]);

  const onContent = vi.fn();
  const onReasoning = vi.fn();

  await generateInsightStream("", "prompt", onContent, onReasoning);

  expect(onReasoning).toHaveBeenCalledWith("step 1");
  expect(onContent).toHaveBeenCalledWith("Answer");
});

test("streams raw JSON lines without data: prefix (OpenAI batch format)", async () => {
  mockFetchStream([
    jsonLine(JSON.stringify({ choices: [{ message: { content: "batch response" } }] })),
  ]);

  const onContent = vi.fn();

  await generateInsightStream("", "prompt", onContent);

  expect(onContent).toHaveBeenCalledWith("batch response");
});

test("handles [DONE] signal", async () => {
  mockFetchStream([
    sseData("[DONE]"),
  ]);

  const onContent = vi.fn();

  await generateInsightStream("", "prompt", onContent);

  expect(onContent).not.toHaveBeenCalled();
});

test("handles non-SSE (batch) JSON response", async () => {
  mockFetchJson({
    output: [
      { type: "reasoning", content: "thinking..." },
      { type: "message", content: "Full response text" },
    ],
  });

  const onContent = vi.fn();
  const onReasoning = vi.fn();

  await generateInsightStream("", "prompt", onContent, onReasoning);

  expect(onReasoning).toHaveBeenCalledWith("thinking...");
  expect(onContent).toHaveBeenCalledWith("Full response text");
});

test("handles non-SSE OpenAI format", async () => {
  mockFetchJson({
    choices: [
      {
        message: {
          content: "Final answer",
          reasoning_content: "Deep thought",
        },
      },
    ],
  });

  const onContent = vi.fn();
  const onReasoning = vi.fn();

  await generateInsightStream("", "prompt", onContent, onReasoning);

  expect(onReasoning).toHaveBeenCalledWith("Deep thought");
  expect(onContent).toHaveBeenCalledWith("Final answer");
});

/* ========== error handling ========== */

test("throws on HTTP error", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: false,
    status: 500,
    text: () => Promise.resolve("Internal error"),
  } as unknown as Response);

  await expect(
    generateInsightStream("", "prompt", vi.fn()),
  ).rejects.toThrow("LLM request failed (500)");
});

test("throws on non-streaming response when JSON fails to parse", async () => {
  mockFetchStream([new TextEncoder().encode("not json")]);

  await expect(
    generateInsightStream("", "prompt", vi.fn()),
  ).rejects.toThrow("Failed to parse LLM response");
});

test("skips malformed SSE JSON without throwing", async () => {
  mockFetchStream([
    sseData("not valid json"),
    sseData(JSON.stringify({ choices: [{ delta: { content: "OK" } }] })),
  ]);

  const onContent = vi.fn();

  await generateInsightStream("", "prompt", onContent);

  expect(onContent).toHaveBeenCalledWith("OK");
});

test("throws when body is null (no reader)", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    body: null,
  } as unknown as Response);

  await expect(
    generateInsightStream("", "prompt", vi.fn()),
  ).rejects.toThrow("Stream not supported");
});

/* ========== request payload ========== */

test("sends correct request payload with model and prompts", async () => {
  mockFetchStream([sseEvent("chat.end", "")]);

  const fetchSpy = vi.mocked(globalThis.fetch);

  await generateInsightStream("You are helpful", "Hello", vi.fn());

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, init] = fetchSpy.mock.calls[0];
  expect(url).toBe("/llm/api/v1/chat");
  const body = JSON.parse(init!.body as string);
  expect(body.model).toBe("test-model");
  expect(body.system_prompt).toBe("You are helpful");
  expect(body.input).toBe("Hello");
  expect(body.temperature).toBe(0.7);
  expect(body.max_output_tokens).toBe(8192);
  expect(body.stream).toBe(true);
});
