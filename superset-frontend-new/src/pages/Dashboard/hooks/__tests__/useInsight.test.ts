import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/* ---------- module-level mocks ---------- */

vi.mock("@/api/aiInsight", () => ({
  streamChartInsight: vi.fn(),
  streamChat: vi.fn(),
}));

const { mockUpdate, mockUseAiConfigStore, mockGetActivePreset } = vi.hoisted(
  () => {
    const update = vi.fn();
    const activePreset = {
      id: "lmstudio",
      label: "LM Studio",
      provider: "lmstudio",
      model: "gemma-4-e4b-it",
      baseUrl: "/llm",
    };
    const state = {
      presets: [activePreset],
      activePresetId: "lmstudio",
      activePreset,
      update,
    };
    const store = Object.assign(
      vi.fn((selector?: unknown) =>
        typeof selector === "function" ? selector(state) : state,
      ),
      { getState: vi.fn(() => state) },
    );
    const getActivePreset = vi.fn(() => activePreset);
    return {
      mockUpdate: update,
      mockUseAiConfigStore: store,
      mockGetActivePreset: getActivePreset,
    };
  },
);
vi.mock("@/config/aiConfig", () => ({
  useAiConfigStore: mockUseAiConfigStore,
  getActivePreset: mockGetActivePreset,
}));

/* ---------- imports ---------- */

import { useInsight } from "@/pages/Dashboard/hooks/useInsight";
import { streamChartInsight, streamChat } from "@/api/aiInsight";

beforeEach(() => {
  vi.clearAllMocks();
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
  expect(result.current.currentToolCalls).toEqual([]);
  expect(result.current.modelConfig).toEqual({
    provider: "lmstudio",
    model: "gemma-4-e4b-it",
  });
});

/* ========== modelConfig ========== */

test("updateModelConfig calls store update with preset id and config", () => {
  const { result } = renderHook(() => useInsight());
  act(() => {
    result.current.updateModelConfig({ provider: "custom", model: "my-model" });
  });
  expect(mockUpdate).toHaveBeenCalledWith("lmstudio", {
    provider: "custom",
    model: "my-model",
  });
});

/* ========== generate ========== */

test("generate calls streamChartInsight with chartId, filters, and modelConfig", async () => {
  vi.mocked(streamChartInsight).mockResolvedValueOnce("");

  const { result } = renderHook(() => useInsight());

  act(() => {
    void result.current.generate(42, {
      filter: { column: "x", value: "y", filterType: "filter_select" },
    });
  });

  expect(result.current.loading).toBe(true);
  expect(result.current.insightText).toBe("");

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(streamChartInsight).toHaveBeenCalledWith(
    42,
    { filter: { column: "x", value: "y", filterType: "filter_select" } },
    expect.objectContaining({
      onText: expect.any(Function),
      onReasoning: expect.any(Function),
      onStatus: expect.any(Function),
    }),
    expect.any(AbortSignal),
    { provider: "lmstudio", model: "gemma-4-e4b-it", baseUrl: "/llm" },
  );
});

test("generate populates insightText via onText callback", async () => {
  vi.mocked(streamChartInsight).mockImplementation(
    (_chartId, _filters, callbacks) => {
      callbacks.onText?.("Hello ");
      callbacks.onText?.("World");
      return Promise.resolve("");
    },
  );

  const { result } = renderHook(() => useInsight());
  act(() => {
    void result.current.generate(1);
  });
  await waitFor(() => expect(result.current.insightText).toBe("Hello World"));
});

test("generate populates reasoningText via onReasoning callback", async () => {
  vi.mocked(streamChartInsight).mockImplementation(
    (_chartId, _filters, callbacks) => {
      callbacks.onReasoning?.("Step 1...");
      callbacks.onReasoning?.("Step 2...");
      return Promise.resolve("");
    },
  );

  const { result } = renderHook(() => useInsight());
  act(() => {
    void result.current.generate(1);
  });
  await waitFor(() =>
    expect(result.current.reasoningText).toBe("Step 1...Step 2..."),
  );
});

test("generate sets error on failure", async () => {
  vi.mocked(streamChartInsight).mockRejectedValueOnce(
    new Error("Something broke"),
  );

  const { result } = renderHook(() => useInsight());
  act(() => {
    void result.current.generate(1);
  });
  await waitFor(() => expect(result.current.error).toBe("Something broke"));
  expect(result.current.loading).toBe(false);
});

test("generate does not set error on AbortError", async () => {
  const err = new Error("aborted");
  err.name = "AbortError";
  vi.mocked(streamChartInsight).mockRejectedValueOnce(err);

  const { result } = renderHook(() => useInsight());
  act(() => {
    void result.current.generate(1);
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("");
});

test("generate aborts previous request on second call", async () => {
  const abortSpy = vi.fn();
  vi.mocked(streamChartInsight).mockImplementation((_c, _f, _cb, signal) => {
    signal?.addEventListener("abort", abortSpy);
    return new Promise<string>(() => {});
  });

  const { result } = renderHook(() => useInsight());
  act(() => {
    void result.current.generate(1);
  });
  act(() => {
    void result.current.generate(2);
  });
  await vi.waitFor(() => expect(abortSpy).toHaveBeenCalled());
});

/* ========== sendMessage ========== */

test("sendMessage calls streamChat with message, modelConfig, and history", () => {
  vi.mocked(streamChat).mockResolvedValueOnce(undefined);

  const { result } = renderHook(() => useInsight());

  act(() => {
    void result.current.sendMessage("Follow up");
  });
  expect(streamChat).toHaveBeenCalledWith(
    "",
    "Follow up",
    expect.any(Object),
    expect.any(AbortSignal),
    expect.objectContaining({ provider: "lmstudio", baseUrl: "/llm" }),
    [],
  );
});

test("sendMessage appends follow-up with separator to insightText", async () => {
  vi.mocked(streamChartInsight).mockImplementation((_c, _f, cb) => {
    cb.onText?.("First analysis");
    return Promise.resolve("");
  });
  vi.mocked(streamChat).mockImplementation((_id, _msg, cb) => {
    cb.onText?.("Follow-up response");
    return Promise.resolve();
  });

  const { result } = renderHook(() => useInsight());
  act(() => {
    void result.current.generate(1);
  });
  await waitFor(() =>
    expect(result.current.insightText).toBe("First analysis"),
  );

  act(() => {
    void result.current.sendMessage("tell me more");
  });
  await waitFor(() => {
    expect(result.current.insightText).toContain("---");
    expect(result.current.insightText).toContain("Follow-up response");
  });
});

/* ========== stop ========== */

test("stop aborts and resets loading", async () => {
  vi.mocked(streamChartInsight).mockImplementation(() => new Promise(() => {}));

  const { result } = renderHook(() => useInsight());
  act(() => {
    void result.current.generate(1);
  });
  await vi.waitFor(() => expect(result.current.loading).toBe(true));

  act(() => {
    void result.current.stop();
  });
  expect(result.current.loading).toBe(false);
});

/* ========== clear ========== */

test("clear resets all state and aborts", async () => {
  vi.mocked(streamChartInsight).mockImplementation((_c, _f, cb) => {
    cb.onText?.("some text");
    return Promise.resolve("");
  });

  const { result } = renderHook(() => useInsight());
  act(() => {
    void result.current.generate(1);
  });
  await waitFor(() => expect(result.current.insightText).toBe("some text"));

  act(() => {
    void result.current.clear();
  });
  expect(result.current.insightText).toBe("");
  expect(result.current.reasoningText).toBe("");
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe("");
});
