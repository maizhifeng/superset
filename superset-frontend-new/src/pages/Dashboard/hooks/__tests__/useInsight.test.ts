import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/* ---------- module-level mocks ---------- */

vi.mock("@/api/aiInsight", () => ({
  streamChartInsight: vi.fn(),
  streamChat: vi.fn(),
  abortSession: vi.fn(),
}));

const mockGetModelConfig = vi.fn();
const mockSetModelConfig = vi.fn();
vi.mock("@/api/aiModelConfig", () => ({
  getModelConfig: (...args: unknown[]) => mockGetModelConfig(...args),
  setModelConfig: (...args: unknown[]) => mockSetModelConfig(...args),
}));

/* ---------- imports ---------- */

import { useInsight } from "@/pages/Dashboard/hooks/useInsight";
import { streamChartInsight, streamChat, abortSession } from "@/api/aiInsight";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModelConfig.mockReturnValue({ provider: "lmstudio", model: "gemma-4-e4b-it" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ========== initial state ========== */

test("returns default state on mount", () => {
  const { result } = renderHook(() => useInsight());
  expect(result.current.insightText).toBe("");
  expect(result.current.reasoningText).toBe("");
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe("");
  expect(result.current.sessionId).toBeNull();
  expect(result.current.currentToolCalls).toEqual([]);
  expect(result.current.modelConfig).toEqual({ provider: "lmstudio", model: "gemma-4-e4b-it" });
});

/* ========== modelConfig ========== */

test("updateModelConfig persists to localStorage and updates state", () => {
  const { result } = renderHook(() => useInsight());
  act(() => {
    result.current.updateModelConfig({ provider: "custom", model: "my-model" });
  });
  expect(mockSetModelConfig).toHaveBeenCalledWith({ provider: "custom", model: "my-model" });
  expect(result.current.modelConfig).toEqual({ provider: "custom", model: "my-model" });
});

/* ========== generate ========== */

test("generate calls streamChartInsight with chartId, filters, and modelConfig", async () => {
  vi.mocked(streamChartInsight).mockResolvedValueOnce("ses_new");

  const { result } = renderHook(() => useInsight());

  act(() => {
    result.current.generate(42, { filter: { column: "x", value: "y", filterType: "filter_select" } });
  });

  expect(result.current.loading).toBe(true);
  expect(result.current.insightText).toBe("");

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(streamChartInsight).toHaveBeenCalledWith(
    42,
    { filter: { column: "x", value: "y", filterType: "filter_select" } },
    expect.objectContaining({
      onSession: expect.any(Function),
      onToolCall: expect.any(Function),
      onToolResult: expect.any(Function),
      onText: expect.any(Function),
      onReasoning: expect.any(Function),
      onStatus: expect.any(Function),
    }),
    expect.any(AbortSignal),
    { provider: "lmstudio", model: "gemma-4-e4b-it" },
  );
  expect(result.current.sessionId).toBe("ses_new");
});

test("generate populates insightText via onText callback", async () => {
  vi.mocked(streamChartInsight).mockImplementation(async (_chartId, _filters, callbacks) => {
    callbacks.onText?.("Hello ");
    callbacks.onText?.("World");
    return "ses_t";
  });

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await waitFor(() => expect(result.current.insightText).toBe("Hello World"));
});

test("generate populates reasoningText via onReasoning callback", async () => {
  vi.mocked(streamChartInsight).mockImplementation(async (_chartId, _filters, callbacks) => {
    callbacks.onReasoning?.("Step 1...");
    callbacks.onReasoning?.("Step 2...");
    return "ses_r";
  });

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await waitFor(() => expect(result.current.reasoningText).toBe("Step 1...Step 2..."));
});

test("generate populates currentToolCalls via onToolCall / onToolResult", async () => {
  vi.mocked(streamChartInsight).mockImplementation(async (_chartId, _filters, callbacks) => {
    callbacks.onToolCall?.("get_data");
    callbacks.onToolResult?.("get_data");
    return "ses_tc";
  });

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await waitFor(() => expect(result.current.currentToolCalls).toEqual([])); // cleared on finally
});

test("generate sets error on failure", async () => {
  vi.mocked(streamChartInsight).mockRejectedValueOnce(new Error("Something broke"));

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await waitFor(() => expect(result.current.error).toBe("Something broke"));
  expect(result.current.loading).toBe(false);
});

test("generate does not set error on AbortError", async () => {
  const err = new Error("aborted");
  err.name = "AbortError";
  vi.mocked(streamChartInsight).mockRejectedValueOnce(err);

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("");
});

test("generate aborts previous request on second call", async () => {
  const abortSpy = vi.fn();
  vi.mocked(streamChartInsight).mockImplementation(
    (_c, _f, _cb, signal) => {
      signal?.addEventListener("abort", abortSpy);
      /* Never resolve — second call will abort this */
      return new Promise<string>(() => {});
    },
  );

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  /* Second call should abort the first */
  act(() => { result.current.generate(2); });
  /* The first AbortController's signal should have been aborted */
  await vi.waitFor(() => expect(abortSpy).toHaveBeenCalled());
});

/* ========== sendMessage ========== */

test("sendMessage does nothing without sessionId", () => {
  const { result } = renderHook(() => useInsight());
  act(() => { result.current.sendMessage("hello"); });
  expect(streamChat).not.toHaveBeenCalled();
});

test("sendMessage calls streamChat with sessionId and message", async () => {
  vi.mocked(streamChartInsight).mockResolvedValueOnce("ses_sm");
  vi.mocked(streamChat).mockResolvedValueOnce(undefined);

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await waitFor(() => expect(result.current.sessionId).toBe("ses_sm"));

  act(() => { result.current.sendMessage("Follow up"); });
  expect(streamChat).toHaveBeenCalledWith(
    "ses_sm",
    "Follow up",
    expect.any(Object),
    expect.any(AbortSignal),
    expect.objectContaining({ provider: "lmstudio" }),
  );
});

test("sendMessage appends follow-up with separator to insightText", async () => {
  vi.mocked(streamChartInsight).mockImplementation(async (_c, _f, cb) => {
    cb.onText?.("First analysis");
    return "ses_fu";
  });
  vi.mocked(streamChat).mockImplementation(async (_id, _msg, cb) => {
    cb.onText?.("Follow-up response");
  });

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await waitFor(() => expect(result.current.insightText).toBe("First analysis"));

  act(() => { result.current.sendMessage("tell me more"); });
  await waitFor(() => {
    expect(result.current.insightText).toContain("---");
    expect(result.current.insightText).toContain("Follow-up response");
  });
});

/* ========== stop ========== */

test("stop aborts session and resets loading", async () => {
  vi.mocked(streamChartInsight).mockImplementation(() => new Promise(() => {})); // never resolves
  vi.mocked(abortSession).mockResolvedValue(undefined);

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await vi.waitFor(() => expect(result.current.loading).toBe(true));

  act(() => { result.current.stop(); });
  expect(result.current.loading).toBe(false);
  expect(result.current.currentToolCalls).toEqual([]);
  /* insightText is preserved */
});

/* ========== clear ========== */

test("clear resets all state and aborts session", async () => {
  vi.mocked(streamChartInsight).mockImplementation(async (_c, _f, cb) => {
    cb.onText?.("some text");
    return "ses_clr";
  });
  vi.mocked(abortSession).mockResolvedValue(undefined);

  const { result } = renderHook(() => useInsight());
  act(() => { result.current.generate(1); });
  await waitFor(() => expect(result.current.insightText).toBe("some text"));

  act(() => { result.current.clear(); });
  expect(result.current.insightText).toBe("");
  expect(result.current.reasoningText).toBe("");
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe("");
  expect(result.current.sessionId).toBeNull();
  expect(result.current.currentToolCalls).toEqual([]);
});
