import { beforeEach, expect, test, vi } from "vitest";

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock("@/api/chartData", () => ({
  postChartData: mockPost,
}));

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn().mockResolvedValue({ data: { result: {} } }),
  },
}));

import { clearAnalysisQueryCache } from "@/pages/Analysis/query";
import { getAnalysisTopic } from "@/pages/Analysis/topics";
import { warmAnalysisCaches } from "@/pages/Analysis/warmup";

const cost = getAnalysisTopic("cost")!;

beforeEach(() => {
  mockPost.mockReset();
  clearAnalysisQueryCache();
  mockPost.mockImplementation((payload: { queries: unknown[] }) =>
    Promise.resolve({
      data: { result: payload.queries.map(() => ({ data: [] })) },
    }),
  );
});

test("warms the cold KPI/trend/breakdown plans and skips warm ones", async () => {
  const first = await warmAnalysisCaches({
    topics: [cost],
    ranges: ["30d"],
    gapMs: 0,
  });
  expect(first).toEqual({ warmed: 1, skipped: 0 });
  // KPI (2 queries), trend (2 queries) and breakdown (1 query) = 3 requests.
  expect(mockPost).toHaveBeenCalledTimes(3);

  mockPost.mockClear();
  const second = await warmAnalysisCaches({
    topics: [cost],
    ranges: ["30d"],
    gapMs: 0,
  });
  expect(second).toEqual({ warmed: 0, skipped: 1 });
  expect(mockPost).not.toHaveBeenCalled();
});

test("can be driven by injected fetchers", async () => {
  const fetchers = {
    kpi: vi.fn().mockResolvedValue({}),
    trend: vi.fn().mockResolvedValue({}),
    breakdown: vi.fn().mockResolvedValue({}),
  };
  const result = await warmAnalysisCaches({
    topics: [cost],
    ranges: ["30d"],
    gapMs: 0,
    fetchers,
  });

  expect(result.warmed).toBe(1);
  expect(fetchers.kpi).toHaveBeenCalledTimes(1);
  expect(fetchers.trend).toHaveBeenCalledTimes(1);
  expect(fetchers.breakdown).toHaveBeenCalledTimes(1);
});
