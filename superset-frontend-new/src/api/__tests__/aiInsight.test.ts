import { test, expect, vi, beforeEach, afterEach } from "vitest";

/* ---------- module-level mocks (hoisted) ---------- */

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const { mockSubscribe } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
}));
vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: vi.fn(() => ({
    event: { subscribe: mockSubscribe },
  })),
}));

/* ---------- imports after mocks ---------- */

import { streamChartInsight, streamChat, abortSession } from "@/api/aiInsight";
import api from "@/api";

/* ---------- helpers ---------- */

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Partial<Response>>,
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(handler as any);
}

function chartMeta(overrides?: Record<string, unknown>) {
  return {
    data: {
      result: {
        id: 106, slice_name: "Test Chart", viz_type: "line",
        datasource_id: 26, datasource_type: "table",
        params: JSON.stringify({ metrics: ["count"], groupby: ["category"] }),
        ...overrides,
      },
    },
  };
}

function chartData(rows: Record<string, unknown>[]) {
  return {
    data: { result: [{ data: rows, colnames: rows.length ? Object.keys(rows[0]) : [] }] },
  };
}

function sessionJson(id: string) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ id }) });
}

/* Create an async generator from an array */
async function* arrayToAsyncIterable<T>(arr: T[]): AsyncIterable<T> {
  for (const item of arr) yield item;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribe.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ========== abortSession ========== */

test("abortSession sends POST to /opencode/session/{id}/abort", async () => {
  mockFetch(() => Promise.resolve({ ok: true } as Response));
  await abortSession("ses_123");
  expect(globalThis.fetch).toHaveBeenCalledWith(
    "/opencode/session/ses_123/abort",
    expect.objectContaining({ method: "POST" }),
  );
});

test("abortSession does not throw on network error", async () => {
  mockFetch(() => Promise.reject(new Error("fail")));
  await expect(abortSession("ses_abc")).resolves.toBeUndefined();
});

/* ========== streamChat ========== */

test("streamChat subscribes to events, sends prompt, streams results", async () => {
  const events = arrayToAsyncIterable([
    { type: "server.connected", properties: {} },
    { type: "message.part.delta", properties: { sessionID: "ses_chat", field: "text", delta: "Hello" } },
    { type: "session.status", properties: { sessionID: "ses_chat", status: { type: "idle" } } },
  ]);
  mockSubscribe.mockResolvedValue({ stream: events });

  mockFetch((url) => {
    if (url.includes("/prompt_async")) return Promise.resolve({ ok: true } as Response);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  const onText = vi.fn();
  const onDone = vi.fn();

  await streamChat("ses_chat", "Hi there", { onText, onDone });

  expect(mockSubscribe).toHaveBeenCalled();
  expect(onText).toHaveBeenCalledWith("Hello");
  expect(onDone).toHaveBeenCalled();
});

test("streamChat filters events by sessionID", async () => {
  const events = arrayToAsyncIterable([
    { type: "message.part.delta", properties: { sessionID: "other", field: "text", delta: "IGNORED" } },
    { type: "message.part.delta", properties: { sessionID: "ses_chat", field: "text", delta: "KEPT" } },
    { type: "session.status", properties: { sessionID: "ses_chat", status: { type: "idle" } } },
  ]);
  mockSubscribe.mockResolvedValue({ stream: events });
  mockFetch(() => Promise.resolve({ ok: true } as Response));

  const onText = vi.fn();
  await streamChat("ses_chat", "msg", { onText });
  expect(onText).toHaveBeenCalledTimes(1);
  expect(onText).toHaveBeenCalledWith("KEPT");
});

test("streamChat handles onReasoning callback", async () => {
  const events = arrayToAsyncIterable([
    { type: "server.connected", properties: {} },
    { type: "message.part.updated", properties: { sessionID: "ses_r", part: { type: "reasoning", text: "thinking..." } } },
    { type: "session.status", properties: { sessionID: "ses_r", status: { type: "idle" } } },
  ]);
  mockSubscribe.mockResolvedValue({ stream: events });
  mockFetch(() => Promise.resolve({ ok: true } as Response));

  const onReasoning = vi.fn();
  await streamChat("ses_r", "msg", { onReasoning, onText: vi.fn() });
  expect(onReasoning).toHaveBeenCalledWith("thinking...");
});

test("streamChat stops on session.error", async () => {
  const events = arrayToAsyncIterable([
    { type: "session.error", properties: { sessionID: "ses_e", error: "Something broke" } },
  ]);
  mockSubscribe.mockResolvedValue({ stream: events });
  mockFetch(() => Promise.resolve({ ok: true } as Response));

  const onError = vi.fn();
  await streamChat("ses_e", "msg", { onError, onText: vi.fn() });
  expect(onError).toHaveBeenCalledWith("Something broke");
});

test("streamChat aborts on signal", async () => {
  const abortController = new AbortController();
  const events = arrayToAsyncIterable([
    { type: "server.connected", properties: {} },
  ]);
  mockSubscribe.mockResolvedValue({ stream: events });
  mockFetch(() => Promise.resolve({ ok: true } as Response));

  const onText = vi.fn();
  const promise = streamChat("ses_a", "msg", { onText }, abortController.signal);
  abortController.abort();
  await promise;
  expect(onText).not.toHaveBeenCalled();
});

/* ========== streamChartInsight ========== */

test("streamChartInsight throws on chart fetch failure", async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error("Network down"));
  await expect(
    streamChartInsight(1, {}, { onText: vi.fn() }),
  ).rejects.toThrow("获取图表信息失败");
});

test("streamChartInsight throws when datasource_id is missing", async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { result: { params: "{}" } } });
  await expect(
    streamChartInsight(1, {}, { onText: vi.fn() }),
  ).rejects.toThrow("图表数据源 ID 为空");
});

test("streamChartInsight fetches chart data, creates session, streams result", async () => {
  vi.mocked(api.get).mockResolvedValueOnce(chartMeta());
  vi.mocked(api.post).mockResolvedValueOnce(chartData([
    { category: "A", count: 10 },
    { category: "B", count: 20 },
  ]));

  const events = arrayToAsyncIterable([
    { type: "server.connected", properties: {} },
    { type: "tool_call", properties: { sessionID: "ses_ci", tool: { name: "get_chart_data" } } },
    { type: "tool_result", properties: { sessionID: "ses_ci", tool: { name: "get_chart_data" } } },
    { type: "message.part.delta", properties: { sessionID: "ses_ci", field: "text", delta: "Analysis result" } },
    { type: "session.status", properties: { sessionID: "ses_ci", status: { type: "idle" } } },
  ]);
  mockSubscribe.mockResolvedValue({ stream: events });

  /* PATCH /config + POST /session + POST /prompt_async */
  let sessionCreated = false;
  let promptSent = false;
  mockFetch((url, init) => {
    if (url === "/opencode/config") return Promise.resolve({ ok: true } as Response);
    if (url === "/opencode/session") {
      sessionCreated = true;
      return sessionJson("ses_ci");
    }
    if (url.includes("/prompt_async")) {
      promptSent = true;
      return Promise.resolve({ ok: true } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  const onText = vi.fn();
  const onToolCall = vi.fn();
  const onToolResult = vi.fn();
  const onDone = vi.fn();
  const onStatus = vi.fn();

  const sid = await streamChartInsight(1, {}, { onText, onToolCall, onToolResult, onDone, onStatus });

  expect(sid).toBe("ses_ci");
  expect(sessionCreated).toBe(true);
  expect(promptSent).toBe(true);
  expect(onText).toHaveBeenCalledWith("Analysis result");
  expect(onToolCall).toHaveBeenCalledWith("get_chart_data");
  expect(onToolResult).toHaveBeenCalledWith("get_chart_data");
  expect(onDone).toHaveBeenCalled();
});

test("streamChartInsight passes filters to chart data query", async () => {
  vi.mocked(api.get).mockResolvedValueOnce(chartMeta());
  vi.mocked(api.post).mockResolvedValueOnce(chartData([]));

  mockSubscribe.mockResolvedValue({ stream: arrayToAsyncIterable([
    { type: "server.connected", properties: {} },
    { type: "session.status", properties: { sessionID: "ses_f", status: { type: "idle" } } },
  ]) });
  mockFetch((url) => {
    if (url === "/opencode/config") return Promise.resolve({ ok: true } as Response);
    if (url === "/opencode/session") return sessionJson("ses_f");
    if (url.includes("/prompt_async")) return Promise.resolve({ ok: true } as Response);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  const filters = {
    time_filter: { column: "date", value: ["2024-01-01", "2024-12-31"], filterType: "time_range" },
    cat_filter: { column: "region", value: ["US", "EU"], filterType: "filter_select" },
  };

  await streamChartInsight(1, filters, { onText: vi.fn() });

  const postCall = vi.mocked(api.post).mock.calls.find(([url]) => url === "/chart/data");
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

test("streamChartInsight passes modelCfg to prompt body", async () => {
  vi.mocked(api.get).mockResolvedValueOnce(chartMeta());
  vi.mocked(api.post).mockResolvedValueOnce(chartData([{ a: 1 }]));

  mockSubscribe.mockResolvedValue({ stream: arrayToAsyncIterable([
    { type: "server.connected", properties: {} },
    { type: "session.status", properties: { sessionID: "ses_m", status: { type: "idle" } } },
  ]) });

  let promptBody: string | undefined;
  mockFetch((url, init) => {
    if (url === "/opencode/session") return sessionJson("ses_m");
    if (url.includes("/prompt_async")) {
      promptBody = init?.body as string;
      return Promise.resolve({ ok: true } as Response);
    }
    return Promise.resolve({ ok: true } as Response);
  });

  await streamChartInsight(1, {}, { onText: vi.fn() }, undefined, {
    provider: "custom",
    model: "my-model",
  });

  expect(promptBody).toBeDefined();
  const parsed = JSON.parse(promptBody!);
  expect(parsed.model).toEqual({ providerID: "custom", modelID: "my-model" });
});

test("streamChartInsight falls back to MCP on REST API failure", async () => {
  vi.mocked(api.get).mockResolvedValueOnce(chartMeta());
  /* Make data fetch fail */
  vi.mocked(api.post).mockRejectedValueOnce(new Error("data error"));

  mockSubscribe.mockResolvedValue({ stream: arrayToAsyncIterable([
    { type: "server.connected", properties: {} },
    { type: "session.status", properties: { sessionID: "ses_mcp", status: { type: "idle" } } },
  ]) });

  let mcpPromptSent = false;
  mockFetch((url, init) => {
    if (url === "/opencode/session") return sessionJson("ses_mcp");
    if (url.includes("/prompt_async")) {
      const body = JSON.parse(init?.body as string);
      if (body.parts?.[0]?.text?.includes("get_chart_data")) {
        mcpPromptSent = true;
      }
      return Promise.resolve({ ok: true } as Response);
    }
    return Promise.resolve({ ok: true } as Response);
  });

  await streamChartInsight(1, {}, { onText: vi.fn() });
  expect(mcpPromptSent).toBe(true);
});
