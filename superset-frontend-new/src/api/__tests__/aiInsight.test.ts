import { test, expect, vi, beforeEach, afterEach } from "vitest";

/* ---------- module-level mock ---------- */

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/config/aiConfig", () => ({
  getActivePreset: vi.fn(() => ({
    id: "lmstudio",
    label: "LM Studio",
    provider: "lmstudio",
    model: "gemma-4-e2b-it",
    baseUrl: "/llm",
  })),
  useAiConfigStore: vi.fn(),
}));

/* ---------- imports ---------- */

import { streamChartInsight, streamChat, abortSession } from "@/api/aiInsight";
import api from "@/api";

function chartMeta(overrides?: Record<string, unknown>) {
  return {
    data: {
      result: {
        id: 106,
        slice_name: "Test Chart",
        viz_type: "line",
        datasource_id: 26,
        datasource_type: "table",
        params: JSON.stringify({ metrics: ["count"], groupby: ["category"] }),
        ...overrides,
      },
    },
  };
}

function chartData(rows: Record<string, unknown>[]) {
  return {
    data: {
      result: [
        { data: rows, colnames: rows.length ? Object.keys(rows[0]) : [] },
      ],
    },
  };
}

/** Return a ReadableStream that emits SSE chunks */
function sseStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

function mockLlmFetch(bodyMatcher?: (body: string) => void) {
  vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    if (typeof url === "string" && url.includes("/chat/completions")) {
      if (bodyMatcher) bodyMatcher(init?.body as string);
      return Promise.resolve({
        ok: true,
        body: sseStream(
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
          'data: {"choices":[{"delta":{"content":" World"}}]}\n',
          "data: [DONE]\n",
        ),
      } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ========== abortSession ========== */

test("abortSession is a no-op", async () => {
  await expect(abortSession("ses_123")).resolves.toBeUndefined();
});

/* ========== streamChat ========== */

test("streamChat calls LLM directly with messages", async () => {
  let capturedBody: string | undefined;
  mockLlmFetch((body) => {
    capturedBody = body;
  });

  const onText = vi.fn();
  const onDone = vi.fn();
  await streamChat("ses_ignored", "Hi there", { onText, onDone });

  expect(capturedBody).toBeDefined();
  const parsed = JSON.parse(capturedBody!);
  expect(parsed.messages).toEqual([{ role: "user", content: "Hi there" }]);
  expect(parsed.stream).toBe(true);
  expect(onText).toHaveBeenCalledWith("Hello");
  expect(onText).toHaveBeenCalledWith(" World");
  expect(onDone).toHaveBeenCalled();
});

test("streamChat aborts on signal", async () => {
  const abortController = new AbortController();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = (init as RequestInit)?.signal;
        if (signal) {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }
      }),
  );

  const promise = streamChat(
    "",
    "msg",
    { onText: vi.fn() },
    abortController.signal,
  );
  abortController.abort();
  await expect(promise).rejects.toThrow();
});

/* ========== streamChartInsight ========== */

test("streamChartInsight throws on chart fetch failure", async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error("Network down"));
  await expect(streamChartInsight(1, {}, { onText: vi.fn() })).rejects.toThrow(
    "获取图表信息失败",
  );
});

test("streamChartInsight throws when datasource_id is missing", async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: { result: { params: "{}" } },
  });
  await expect(streamChartInsight(1, {}, { onText: vi.fn() })).rejects.toThrow(
    "图表数据源 ID 为空",
  );
});

test("streamChartInsight fetches chart data and streams LLM result", async () => {
  vi.mocked(api.get).mockResolvedValueOnce(chartMeta());
  vi.mocked(api.post).mockResolvedValueOnce(
    chartData([
      { category: "A", count: 10 },
      { category: "B", count: 20 },
    ]),
  );

  let promptBody: string | undefined;
  mockLlmFetch((body) => {
    promptBody = body;
  });

  const onText = vi.fn();
  const onDone = vi.fn();
  const onStatus = vi.fn();

  const sid = await streamChartInsight(1, {}, { onText, onDone, onStatus });

  expect(sid).toBe("");
  expect(promptBody).toBeDefined();
  const parsed = JSON.parse(promptBody!);
  expect(parsed.messages[0].role).toBe("system");
  expect(parsed.messages[0].content).toContain("数据分析师");
  expect(parsed.messages[1].role).toBe("user");
  expect(parsed.messages[1].content).toContain("Test Chart");
  expect(parsed.messages[1].content).toContain("category");
  expect(parsed.stream).toBe(true);
  expect(onText).toHaveBeenCalledWith("Hello");
  expect(onDone).toHaveBeenCalled();
});

test("streamChartInsight passes filters to chart data query", async () => {
  vi.mocked(api.get).mockResolvedValueOnce(chartMeta());
  vi.mocked(api.post).mockResolvedValueOnce(chartData([]));

  mockLlmFetch();

  const filters = {
    time_filter: {
      column: "date",
      value: ["2024-01-01", "2024-12-31"],
      filterType: "time_range",
    },
    cat_filter: {
      column: "region",
      value: ["US", "EU"],
      filterType: "filter_select",
    },
  };

  await streamChartInsight(1, filters, { onText: vi.fn() });

  const postCall = vi
    .mocked(api.post)
    .mock.calls.find(([url]) => url === "/chart/data");
  expect(postCall).toBeDefined();
  const payload = postCall![1] as Record<string, unknown>;
  const queries = (payload.queries as Record<string, unknown>[])[0];
  expect(queries.filters).toEqual(
    expect.arrayContaining([
      { col: "date", op: ">=", val: "2024-01-01" },
      { col: "date", op: "<=", val: "2024-12-31" },
      { col: "region", op: "IN", val: ["US", "EU"] },
    ]),
  );
});

test("streamChartInsight passes modelCfg to LLM", async () => {
  vi.mocked(api.get).mockResolvedValueOnce(chartMeta());
  vi.mocked(api.post).mockResolvedValueOnce(chartData([{ a: 1 }]));

  let promptBody: string | undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
    if (typeof url === "string" && url.includes("/chat/completions")) {
      promptBody = init?.body as string;
      return Promise.resolve({
        ok: true,
        body: sseStream("data: [DONE]\n"),
      } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });

  await streamChartInsight(1, {}, { onText: vi.fn() }, undefined, {
    provider: "lmstudio",
    model: "my-model",
    baseUrl: "/llm",
  });

  expect(promptBody).toBeDefined();
  const parsed = JSON.parse(promptBody!);
  expect(parsed.model).toBe("my-model");
});
