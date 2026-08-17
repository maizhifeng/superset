import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/* ---------- module-level mocks ---------- */

const {
  mockSendInsight,
  mockAbortInsight,
  mockSubscribeInsight,
  mockGetOrCreateAgentClient,
  getInsightListener,
} = vi.hoisted(() => {
  let listener: ((event: unknown) => void) | undefined;
  const sendInsight = vi.fn();
  const abortInsight = vi.fn();
  const client = { sendInsight, abortInsight };
  return {
    mockSendInsight: sendInsight,
    mockAbortInsight: abortInsight,
    mockSubscribeInsight: vi.fn((fn: unknown) => {
      listener = fn as (event: unknown) => void;
      return () => {};
    }),
    mockGetOrCreateAgentClient: vi.fn(() => client),
    getInsightListener: () => listener,
  };
});

vi.mock("@/hooks/usePiAgent", () => ({
  usePiAgent: vi.fn(() => ({})),
  subscribeInsight: (fn: unknown) => mockSubscribeInsight(fn),
  getOrCreateAgentClient: () => mockGetOrCreateAgentClient(),
}));

/* ---------- imports ---------- */

import { useInsight } from "@/pages/Dashboard/hooks/useInsight";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  mockSubscribeInsight.mockClear();
});

test("generate sends an insight request with chartId and filters", () => {
  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.generate(42, { team: "A" });
  });

  expect(result.current.loading).toBe(true);
  expect(mockGetOrCreateAgentClient).toHaveBeenCalled();
  expect(mockSendInsight).toHaveBeenCalledTimes(1);
  const [requestId, payload] = mockSendInsight.mock.calls[0] as [
    string,
    { chartId?: number; filters?: Record<string, unknown> },
  ];
  expect(requestId).toMatch(/^insight_/);
  expect(payload).toEqual({ chartId: 42, filters: { team: "A" } });
});

test("sendMessage sends a follow-up prompt for the current request", () => {
  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.generate(1, {});
  });
  const [requestId] = mockSendInsight.mock.calls[0] as [string, unknown];

  act(() => {
    result.current.sendMessage("再对比一下上周");
  });

  expect(mockSendInsight).toHaveBeenCalledWith(requestId, {
    prompt: "再对比一下上周",
  });
});

test("sendMessage before generate sets an error", () => {
  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.sendMessage("你好");
  });

  expect(result.current.error).toContain("先生成分析");
  expect(mockSendInsight).not.toHaveBeenCalled();
});

test("stop aborts the current request", () => {
  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.generate(7, {});
  });
  const [requestId] = mockSendInsight.mock.calls[0] as [string, unknown];

  act(() => {
    result.current.stop();
  });

  expect(mockAbortInsight).toHaveBeenCalledWith(requestId);
  expect(result.current.loading).toBe(false);
});

test("insight events update text, reasoning and loading state", () => {
  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.generate(1, {});
  });
  const [requestId] = mockSendInsight.mock.calls[0] as [string, unknown];
  const listener = getInsightListener();
  expect(listener).toBeDefined();

  act(() => {
    listener?.({
      type: "message_update",
      storeSessionId: requestId,
      insight: true,
      assistantMessageEvent: { type: "text_delta", delta: "消耗" },
    });
  });
  act(() => {
    listener?.({
      type: "message_update",
      storeSessionId: requestId,
      insight: true,
      assistantMessageEvent: { type: "text_delta", delta: "上升" },
    });
  });
  act(() => {
    listener?.({
      type: "thinking_delta",
      storeSessionId: requestId,
      insight: true,
      delta: "先看趋势",
    });
  });

  expect(result.current.insightText).toBe("消耗上升");
  expect(result.current.reasoningText).toBe("先看趋势");

  act(() => {
    listener?.({
      type: "agent_end",
      storeSessionId: requestId,
      insight: true,
      messages: [],
    });
  });
  expect(result.current.loading).toBe(false);
});

test("insight events for other requests are ignored", () => {
  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.generate(1, {});
  });
  const listener = getInsightListener();

  act(() => {
    listener?.({
      type: "message_update",
      storeSessionId: "insight_other",
      insight: true,
      assistantMessageEvent: { type: "text_delta", delta: "别的请求" },
    });
  });

  expect(result.current.insightText).toBe("");
});

test("error events set the error message", () => {
  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.generate(1, {});
  });
  const [requestId] = mockSendInsight.mock.calls[0] as [string, unknown];
  const listener = getInsightListener();

  act(() => {
    listener?.({
      type: "error",
      storeSessionId: requestId,
      insight: true,
      message: "图表数据获取失败",
      retryable: true,
    });
  });

  expect(result.current.error).toBe("图表数据获取失败");
  expect(result.current.loading).toBe(false);
});

test("clear resets text, reasoning and error", () => {
  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.generate(1, {});
  });
  const [requestId] = mockSendInsight.mock.calls[0] as [string, unknown];
  const listener = getInsightListener();

  act(() => {
    listener?.({
      type: "message_update",
      storeSessionId: requestId,
      insight: true,
      assistantMessageEvent: { type: "text_delta", delta: "内容" },
    });
  });
  act(() => {
    result.current.clear();
  });

  expect(result.current.insightText).toBe("");
  expect(mockAbortInsight).toHaveBeenCalledWith(requestId);
});
