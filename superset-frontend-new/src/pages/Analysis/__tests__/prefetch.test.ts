import { beforeEach, expect, test, vi } from "vitest";

const { postChartDataMock } = vi.hoisted(() => ({
  postChartDataMock: vi.fn(),
}));

vi.mock("@/api/chartData", () => ({
  postChartData: postChartDataMock,
}));

import { defaultFilters } from "@/pages/Analysis/filters";
import {
  clearDrillPrefetchCache,
  prefetchDateDrill,
  prefetchDimensionBreakdown,
  prefetchDimensionDrill,
} from "@/pages/Analysis/prefetch";
import { clearAnalysisQueryCache } from "@/pages/Analysis/query";
import { getAnalysisTopic } from "@/pages/Analysis/topics";

const cost = getAnalysisTopic("cost")!;

const RESPONSE = {
  data: {
    result: [
      {
        data: [{ 渠道商: "ios", 返点后消耗: 10, cpa: 2 }],
        colnames: ["渠道商", "返点后消耗", "cpa"],
      },
    ],
  },
};

beforeEach(() => {
  postChartDataMock.mockReset();
  postChartDataMock.mockResolvedValue(RESPONSE);
  clearAnalysisQueryCache();
  clearDrillPrefetchCache();
});

test("prefetches the single combined query a date click issues", async () => {
  prefetchDateDrill(cost, defaultFilters(cost), "2026-10-04");
  // One combined query now serves both the day rows and the baseline history.
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(1));

  const payload = postChartDataMock.mock.calls[0][0] as {
    force: boolean;
    queries: {
      time_range: string;
      groupby: string[];
      metrics: unknown[];
    }[];
  };
  expect(payload.force).toBe(false);
  expect(payload.queries[0].groupby).toEqual(["渠道商", "日期"]);
  // The drill target of the cost topic is 主游戏 → 渠道商.
  expect(payload.queries[0].time_range).toBe("2026-09-05 : 2026-10-05");
  expect(payload.queries[0].metrics.length).toBeGreaterThan(1);
});

test("deduplicates repeated prefetches for the same date", async () => {
  prefetchDateDrill(cost, defaultFilters(cost), "2026-10-04");
  prefetchDateDrill(cost, defaultFilters(cost), "2026-10-04");
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(1));

  prefetchDateDrill(cost, defaultFilters(cost), "2026-10-05");
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(2));
});

test("a failed prefetch stays silent and can be retried", async () => {
  postChartDataMock.mockRejectedValueOnce(new Error("offline"));
  prefetchDateDrill(cost, defaultFilters(cost), "2026-10-04");
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(1));
  // Let the rejection settle so the prefetch bookkeeping is cleared.
  await new Promise((resolve) => setTimeout(resolve, 0));

  prefetchDateDrill(cost, defaultFilters(cost), "2026-10-04");
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(2));
});

test("prefetches the next dimension and drilled trend for a row hover", async () => {
  prefetchDimensionDrill(cost, defaultFilters(cost), "主游戏", "游戏 A");
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(2));

  const payloads = postChartDataMock.mock.calls.map(
    (call) =>
      call[0] as {
        force: boolean;
        queries: {
          groupby: string[];
          filters: { col: string; op: string; val: string[] }[];
        }[];
      },
  );
  const breakdown = payloads.find((payload) => payload.queries.length === 1);
  const trend = payloads.find((payload) => payload.queries.length === 2);
  expect(breakdown?.force).toBe(false);
  // The drill target of the cost topic is 主游戏 → 渠道商.
  expect(breakdown?.queries[0].groupby).toEqual(["渠道商"]);
  expect(breakdown?.queries[0].filters).toContainEqual({
    col: "主游戏",
    op: "IN",
    val: ["游戏 A"],
  });
  // The trend slice (2 queries) follows the drilled scope.
  expect(trend?.queries[0].filters).toContainEqual({
    col: "主游戏",
    op: "IN",
    val: ["游戏 A"],
  });
});

test("dimension prefetch is deduplicated per drill scope", async () => {
  prefetchDimensionDrill(cost, defaultFilters(cost), "主游戏", "游戏 A");
  prefetchDimensionDrill(cost, defaultFilters(cost), "主游戏", "游戏 A");
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(2));

  prefetchDimensionDrill(cost, defaultFilters(cost), "主游戏", "游戏 B");
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(4));
});

test("row hover inside a date drill warms only the table query", async () => {
  const filters = {
    ...defaultFilters(cost),
    focusDate: "2026-10-04",
  };
  prefetchDimensionDrill(cost, filters, "主游戏", "游戏 A");
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(1));

  const payload = postChartDataMock.mock.calls[0][0] as {
    queries: { groupby: string[]; time_range: string }[];
  };
  expect(payload.queries[0].groupby).toEqual(["渠道商"]);
  expect(payload.queries[0].time_range).toBe("2026-10-04 : 2026-10-05");
});

test("chains the next dimension breakdown for the top row", async () => {
  prefetchDimensionBreakdown(cost, defaultFilters(cost), "主游戏", "游戏 A");
  // First the channel table, then the media table for its top channel.
  await vi.waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(2));

  const queries = postChartDataMock.mock.calls.map(
    (call) =>
      call[0] as {
        queries: { groupby: string[]; filters: unknown[] }[];
      },
  );
  expect(queries[0].queries[0].groupby).toEqual(["渠道商"]);
  expect(queries[1].queries[0].groupby).toEqual(["媒体"]);
  expect(queries[1].queries[0].filters).toContainEqual({
    col: "渠道商",
    op: "IN",
    val: ["ios"],
  });
});
