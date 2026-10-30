import { test, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChartDataResponseResult } from "@/utils/query/types";
import {
  defaultFilters,
  resolveTimeRange,
  type AnalysisFilters,
} from "@/pages/Analysis/filters";
import { getAnalysisTopic } from "@/pages/Analysis/topics";

const { mockPostChartData } = vi.hoisted(() => ({
  mockPostChartData: vi.fn(),
}));

vi.mock("@/api/chartData", () => ({
  postChartData: mockPostChartData,
}));

import {
  ANALYSIS_QUERY_CACHE_MAX_ENTRIES,
  ANALYSIS_QUERY_CACHE_TTL_MS,
  buildBreakdownQuery,
  buildCoreQueryPlan,
  buildDrillAnomalyQuery,
  buildDrillQueryPlan,
  buildKpiQueryPlan,
  buildTrendQueryPlan,
  buildQueryPlan,
  clearAnalysisQueryCache,
  fetchAnalysisData,
  fetchBreakdownData,
  fetchCoreData,
  peekBreakdownData,
  peekCoreData,
} from "@/pages/Analysis/query";
import {
  useAnalysisBreakdownData,
  useAnalysisCoreData,
  useAnalysisPageData,
} from "@/pages/Analysis/hooks/useAnalysisData";

const topic = getAnalysisTopic("cost")!;

function baseFilters() {
  return {
    ...defaultFilters(topic),
    range: "custom" as const,
    start: "2026-09-01",
    end: "2026-09-30",
    games: ["游戏 A"],
  };
}

function chartResult(
  rows: Record<string, string | number>[] = [],
): ChartDataResponseResult {
  return {
    data: rows,
    colnames: rows.length > 0 ? Object.keys(rows[0]) : [],
    coltypes: [],
    rowcount: rows.length,
    status: "success",
  };
}

function coreResponse(rows: Record<string, string | number>[]) {
  return {
    data: { result: [chartResult(rows), chartResult(), chartResult(), chartResult()] },
  };
}

function breakdownResponse(rows: Record<string, string | number>[]) {
  return { data: { result: [chartResult(rows)] } };
}

beforeEach(() => {
  mockPostChartData.mockReset();
  clearAnalysisQueryCache();
});

test("builds totals, daily trend and breakdown queries", () => {
  const plan = buildQueryPlan(topic, baseFilters(), "媒体");
  expect(plan.totals.groupby).toEqual([]);
  expect(plan.totals.time_range).toBe("2026-09-01 : 2026-09-30");
  expect(plan.totals.filters).toEqual([
    { col: "主游戏", op: "IN", val: ["游戏 A"] },
  ]);
  expect(plan.trend.groupby).toEqual(["日期"]);
  expect(plan.trend.orderby).toEqual([["日期", true]]);
  expect(plan.breakdown.groupby).toEqual(["媒体"]);
  expect(plan.breakdown.order_desc).toBe(true);
  expect(plan.breakdown.orderby).toEqual([["返点后消耗", false]]);
  expect(plan.breakdown.metrics ?? []).toContain("cpa");
  expect(plan.previous.time_range).not.toBe(plan.totals.time_range);
  expect(plan.previous.metrics).toEqual(plan.totals.metrics);
  expect(plan.previousTrend.time_range).not.toBe(plan.trend.time_range);
});

test("falls back to the default dimension for an unknown dimension", () => {
  const plan = buildQueryPlan(topic, baseFilters(), "不存在");
  expect(plan.breakdown.groupby).toEqual(["主游戏"]);
});

test("retention totals/breakdown end at the observation cutoff", () => {
  const retention = getAnalysisTopic("retention")!;
  const retentionFilters = {
    ...defaultFilters(retention),
    range: "30d" as const,
  };
  const plan = buildQueryPlan(retention, retentionFilters, "主游戏");
  expect(plan.totals.time_range).not.toBe(plan.trend.time_range);
  expect(plan.breakdown.time_range).toBe(plan.totals.time_range);
  expect(plan.trend.time_range).toBe(resolveTimeRange(retentionFilters));
});

test("drill filters narrow the trend but keep the KPI totals on page filters", () => {
  const filters = {
    ...baseFilters(),
    drill: { games: ["游戏 B"] },
  };
  const core = buildCoreQueryPlan(topic, filters);
  const breakdown = buildBreakdownQuery(topic, {
    ...filters,
    dimension: "媒体",
  });

  const pageFilter = { col: "主游戏", op: "IN", val: ["游戏 A"] };
  const drillFilter = { col: "主游戏", op: "IN", val: ["游戏 B"] };
  expect(core.totals.filters).toEqual([pageFilter]);
  expect(core.previous.filters).toEqual([pageFilter]);
  // The trend follows the drilled table scope, including its comparison window.
  expect(core.trend.filters).toEqual([drillFilter]);
  expect(core.previousTrend.filters).toEqual([drillFilter]);
  expect(breakdown.filters).toEqual([drillFilter]);
  expect(breakdown.groupby).toEqual(["媒体"]);
});

test("trend queries exclude natural traffic when the switch is off", () => {
  const filters = {
    ...baseFilters(),
    includeNatural: false,
  };
  const core = buildCoreQueryPlan(topic, filters);

  const naturalClause = { col: "媒体", op: "NOT IN", val: ["自然量"] };
  expect(core.trend.filters).toEqual([
    { col: "主游戏", op: "IN", val: ["游戏 A"] },
    naturalClause,
  ]);
  expect(core.previousTrend.filters).toEqual(core.trend.filters);
  // KPI totals keep the unfiltered page scope.
  expect(core.totals.filters).toEqual([
    { col: "主游戏", op: "IN", val: ["游戏 A"] },
  ]);
});

test("focus date only narrows the breakdown query", () => {
  const plan = buildQueryPlan(
    topic,
    { ...baseFilters(), focusDate: "2026-09-15" },
    "主游戏",
  );
  expect(plan.breakdown.time_range).toBe("2026-09-15 : 2026-09-16");
  expect(plan.trend.time_range).toBe("2026-09-01 : 2026-09-30");
  expect(plan.totals.time_range).toBe("2026-09-01 : 2026-09-30");
});

test("builds ad-hoc SUM metrics for additive columns", () => {
  const plan = buildQueryPlan(topic, baseFilters(), "主游戏");
  const netSpend = (plan.breakdown.metrics ?? []).find(
    (metric) =>
      typeof metric === "object" &&
      metric.expressionType === "SIMPLE" &&
      metric.label === "返点后消耗",
  );
  expect(netSpend).toMatchObject({
    expressionType: "SIMPLE",
    column: { column_name: "返点后消耗" },
    aggregate: "SUM",
  });
});

test("parses the five query results into sections", async () => {
  const totals: ChartDataResponseResult = {
    data: [{ cpa: 9.5 }],
    colnames: ["cpa"],
    coltypes: [0],
    rowcount: 1,
    status: "success",
  };
  const previous: ChartDataResponseResult = {
    data: [{ cpa: 10.5 }],
    colnames: ["cpa"],
    coltypes: [0],
    rowcount: 1,
    status: "success",
  };
  const trend: ChartDataResponseResult = {
    data: [{ 日期: "2026-09-01T00:00:00", cpa: 8 }],
    colnames: ["日期", "cpa"],
    coltypes: [0, 0],
    rowcount: 1,
    status: "success",
  };
  const previousTrend: ChartDataResponseResult = {
    data: [{ 日期: "2026-08-01T00:00:00", cpa: 7 }],
    colnames: ["日期", "cpa"],
    coltypes: [0, 0],
    rowcount: 1,
    status: "success",
  };
  const breakdown: ChartDataResponseResult = {
    data: [{ 主游戏: "游戏 A", cpa: 9 }],
    colnames: ["主游戏", "cpa"],
    coltypes: [0, 0],
    rowcount: 1,
    status: "success",
  };
  mockPostChartData.mockResolvedValue({
    data: { result: [totals, previous, trend, previousTrend, breakdown] },
  });

  const data = await fetchAnalysisData(
    buildQueryPlan(topic, baseFilters(), "主游戏"),
  );
  expect(data.totals.rows).toEqual([{ cpa: 9.5 }]);
  expect(data.previous.rows).toEqual([{ cpa: 10.5 }]);
  expect(data.trend.rows[0].cpa).toBe(8);
  expect(data.previousTrend.rows[0].cpa).toBe(7);
  expect(data.breakdown.rows[0]["主游戏"]).toBe("游戏 A");
  expect(mockPostChartData).toHaveBeenCalledWith(
    expect.objectContaining({
      datasource: { id: 26, type: "table" },
      result_format: "json",
      force: false,
      queries: expect.arrayContaining([
        expect.objectContaining({ time_range: expect.any(String) }),
      ]),
    }),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(
    (mockPostChartData.mock.calls[0][0] as { queries: unknown[] }).queries,
  ).toHaveLength(5);
});

test("keeps per-section errors instead of throwing", async () => {
  mockPostChartData.mockResolvedValue({
    data: {
      result: [
        {
          data: [],
          colnames: [],
          coltypes: [],
          rowcount: 0,
          status: "failed",
          error: "查询失败",
        },
        {
          data: [],
          colnames: [],
          coltypes: [],
          rowcount: 0,
          status: "success",
        },
        {
          data: [],
          colnames: [],
          coltypes: [],
          rowcount: 0,
          status: "success",
        },
        {
          data: [],
          colnames: [],
          coltypes: [],
          rowcount: 0,
          status: "success",
        },
        {
          data: [],
          colnames: [],
          coltypes: [],
          rowcount: 0,
          status: "success",
        },
      ],
    },
  });

  const data = await fetchAnalysisData(
    buildQueryPlan(topic, baseFilters(), "主游戏"),
  );
  expect(data.totals.error).toBe("查询失败");
  expect(data.totals.rows).toEqual([]);
});

test("serves an identical core query from cache instead of posting twice", async () => {
  mockPostChartData.mockResolvedValue(coreResponse([{ cpa: 9.5 }]));

  const first = await fetchCoreData(buildCoreQueryPlan(topic, baseFilters()));
  const second = await fetchCoreData(buildCoreQueryPlan(topic, baseFilters()));

  expect(mockPostChartData).toHaveBeenCalledTimes(1);
  expect(second).toBe(first);
  expect(peekCoreData(buildCoreQueryPlan(topic, baseFilters()))).toBe(first);
});

test("caches breakdown responses independently", async () => {
  mockPostChartData.mockResolvedValue(breakdownResponse([{ 媒体: "A" }]));

  const filters = { ...baseFilters(), dimension: "媒体" };
  const first = await fetchBreakdownData(buildBreakdownQuery(topic, filters));
  const second = await fetchBreakdownData(buildBreakdownQuery(topic, filters));

  expect(mockPostChartData).toHaveBeenCalledTimes(1);
  expect(second).toBe(first);
  expect(peekBreakdownData(buildBreakdownQuery(topic, filters))).toBe(first);
});

test("expires cached responses after the TTL", async () => {
  vi.useFakeTimers();
  try {
    mockPostChartData.mockResolvedValue(coreResponse([{ cpa: 1 }]));
    const plan = buildCoreQueryPlan(topic, baseFilters());

    await fetchCoreData(plan);
    await fetchCoreData(plan);
    expect(mockPostChartData).toHaveBeenCalledTimes(1);
    expect(peekCoreData(plan, { allowStale: false })).toBeDefined();

    vi.advanceTimersByTime(ANALYSIS_QUERY_CACHE_TTL_MS + 1);
    // Stale rows stay readable for stale-while-revalidate hooks.
    expect(peekCoreData(plan)).toBeDefined();
    expect(peekCoreData(plan, { allowStale: false })).toBeUndefined();

    await fetchCoreData(plan);
    expect(mockPostChartData).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("force refresh bypasses and overwrites the cache entry", async () => {
  mockPostChartData
    .mockResolvedValueOnce(coreResponse([{ cpa: 1 }]))
    .mockResolvedValueOnce(coreResponse([{ cpa: 2 }]));
  const plan = buildCoreQueryPlan(topic, baseFilters());

  const first = await fetchCoreData(plan);
  const forced = await fetchCoreData(plan, { force: true });

  expect(first.totals.rows).toEqual([{ cpa: 1 }]);
  expect(forced.totals.rows).toEqual([{ cpa: 2 }]);
  expect(mockPostChartData).toHaveBeenCalledTimes(2);
  expect(
    (mockPostChartData.mock.calls[1][0] as { force: boolean }).force,
  ).toBe(true);

  // The forced response overwrote the cached one.
  const third = await fetchCoreData(plan);
  expect(third).toBe(forced);
  expect(mockPostChartData).toHaveBeenCalledTimes(2);
});

test("does not cache failed requests", async () => {
  mockPostChartData.mockRejectedValueOnce(new Error("boom"));
  const plan = buildCoreQueryPlan(topic, baseFilters());

  await expect(fetchCoreData(plan)).rejects.toThrow("boom");
  expect(peekCoreData(plan)).toBeUndefined();

  mockPostChartData.mockResolvedValueOnce(coreResponse([{ cpa: 3 }]));
  const data = await fetchCoreData(plan);
  expect(data.totals.rows).toEqual([{ cpa: 3 }]);
  expect(mockPostChartData).toHaveBeenCalledTimes(2);
});

test("shares one request between concurrent identical calls", async () => {
  let resolveRequest: ((value: unknown) => void) | undefined;
  mockPostChartData.mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  );
  const plan = buildCoreQueryPlan(topic, baseFilters());

  const first = fetchCoreData(plan);
  const second = fetchCoreData(plan);
  expect(mockPostChartData).toHaveBeenCalledTimes(1);

  resolveRequest?.(coreResponse([{ cpa: 4 }]));
  const [a, b] = await Promise.all([first, second]);
  expect(a).toEqual(b);
  expect(a.totals.rows).toEqual([{ cpa: 4 }]);
});

test("aborting one consumer keeps the shared request alive for others", async () => {
  let resolvePayload: ((value: unknown) => void) | undefined;
  mockPostChartData.mockReturnValue(
    new Promise((resolve) => {
      resolvePayload = resolve;
    }),
  );
  const plan = buildCoreQueryPlan(topic, baseFilters());
  const firstConsumer = new AbortController();
  const secondConsumer = new AbortController();

  const first = fetchCoreData(plan, { signal: firstConsumer.signal });
  const second = fetchCoreData(plan, { signal: secondConsumer.signal });
  expect(mockPostChartData).toHaveBeenCalledTimes(1);

  firstConsumer.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  const requestSignal = (
    mockPostChartData.mock.calls[0][1] as { signal: AbortSignal }
  ).signal;
  expect(requestSignal.aborted).toBe(false);

  resolvePayload?.(coreResponse([{ cpa: 5 }]));
  await expect(second).resolves.toMatchObject({
    totals: { rows: [{ cpa: 5 }] },
  });
});

test("evicts the least recently used entry past the cache bound", async () => {
  mockPostChartData.mockResolvedValue(coreResponse([{ cpa: 1 }]));
  const plans = Array.from(
    { length: ANALYSIS_QUERY_CACHE_MAX_ENTRIES + 1 },
    (_, index) =>
      buildCoreQueryPlan(topic, {
        ...baseFilters(),
        games: [`游戏 ${index}`],
      }),
  );

  for (const plan of plans) {
    await fetchCoreData(plan);
  }
  expect(mockPostChartData).toHaveBeenCalledTimes(plans.length);
  expect(peekCoreData(plans[0])).toBeUndefined();
  expect(peekCoreData(plans[plans.length - 1])).toBeDefined();

  await fetchCoreData(plans[0]);
  expect(mockPostChartData).toHaveBeenCalledTimes(plans.length + 1);
});

test("core hook paints cached rows immediately and skips the skeleton", async () => {
  mockPostChartData.mockResolvedValue(coreResponse([{ cpa: 6 }]));
  const filters = baseFilters();
  await fetchCoreData(buildCoreQueryPlan(topic, filters));

  const { result } = renderHook(() =>
    useAnalysisCoreData(topic, filters as AnalysisFilters),
  );

  expect(result.current.data.totals.rows).toEqual([{ cpa: 6 }]);
  expect(result.current.initialLoading).toBe(false);
  expect(result.current.loading).toBe(false);
  expect(mockPostChartData).toHaveBeenCalledTimes(1);
});

test("breakdown hook serves cached rows without flashing loading", async () => {
  mockPostChartData.mockResolvedValue(
    breakdownResponse([{ 主游戏: "游戏 A", cpa: 9 }]),
  );
  const filters = { ...baseFilters(), dimension: "主游戏" };
  await fetchBreakdownData(buildBreakdownQuery(topic, filters));

  const { result } = renderHook(() =>
    useAnalysisBreakdownData(topic, filters as AnalysisFilters),
  );

  expect(result.current.data.rows).toEqual([{ 主游戏: "游戏 A", cpa: 9 }]);
  expect(result.current.initialLoading).toBe(false);
  expect(result.current.loading).toBe(false);
  expect(mockPostChartData).toHaveBeenCalledTimes(1);
});

test("keeps previous rows visible while a new key refetches", async () => {
  mockPostChartData.mockResolvedValueOnce(coreResponse([{ cpa: 1 }]));
  const firstFilters = baseFilters();
  const { result, rerender } = renderHook(
    ({ filters }: { filters: AnalysisFilters }) =>
      useAnalysisCoreData(topic, filters),
    { initialProps: { filters: firstFilters } },
  );
  await waitFor(
    () => expect(result.current.data.totals.rows).toEqual([{ cpa: 1 }]),
    { timeout: 3000 },
  );
  expect(result.current.initialLoading).toBe(false);

  let resolveSecond: ((value: unknown) => void) | undefined;
  mockPostChartData.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveSecond = resolve;
    }),
  );
  rerender({ filters: { ...firstFilters, games: ["游戏 B"] } });

  await waitFor(() => expect(result.current.refreshing).toBe(true), {
    timeout: 3000,
  });
  // Previous rows stay mounted while the new key is in flight.
  expect(result.current.data.totals.rows).toEqual([{ cpa: 1 }]);
  expect(result.current.loading).toBe(true);

  resolveSecond?.(coreResponse([{ cpa: 2 }]));
  await waitFor(
    () => expect(result.current.data.totals.rows).toEqual([{ cpa: 2 }]),
    { timeout: 3000 },
  );
  expect(result.current.refreshing).toBe(false);
  expect(result.current.loading).toBe(false);
  expect(mockPostChartData).toHaveBeenCalledTimes(2);
});

test("refresh forces a network refetch through the hook", async () => {
  mockPostChartData
    .mockResolvedValueOnce(coreResponse([{ cpa: 1 }]))
    .mockResolvedValueOnce(coreResponse([{ cpa: 2 }]));
  const filters = baseFilters();
  const { result } = renderHook(() =>
    useAnalysisCoreData(topic, filters as AnalysisFilters),
  );
  await waitFor(
    () => expect(result.current.data.totals.rows).toEqual([{ cpa: 1 }]),
    { timeout: 3000 },
  );
  expect(result.current.loading).toBe(false);

  act(() => {
    result.current.refresh();
  });
  await waitFor(
    () => expect(result.current.data.totals.rows).toEqual([{ cpa: 2 }]),
    { timeout: 3000 },
  );
  expect(mockPostChartData).toHaveBeenCalledTimes(2);
  expect(
    (mockPostChartData.mock.calls[1][0] as { force: boolean }).force,
  ).toBe(true);
});

test("builds no drill attribution query outside drill mode", () => {
  expect(buildDrillAnomalyQuery(topic, baseFilters())).toBeNull();
});

test("builds the rolling-baseline history for the drilled day", () => {
  const filters = {
    ...baseFilters(),
    focusDate: "2026-09-20",
    dimension: "渠道商",
  };
  const query = buildDrillAnomalyQuery(topic, filters);
  expect(query).not.toBeNull();
  // cpa is the cost topic's anomaly metric; history covers 7 baseline days + the
  // drilled day.
  expect(query?.metrics).toHaveLength(1);
  expect(query?.groupby).toEqual(["渠道商", "日期"]);
  // 30 days of lookback ending after the drilled day (range end is exclusive).
  expect(query?.time_range).toBe("2026-08-22 : 2026-09-21");
  expect(query?.row_limit).toBeGreaterThanOrEqual(1000);
});

test("drill attribution query follows the deeper drill filters", () => {
  const filters = {
    ...baseFilters(),
    focusDate: "2026-09-20",
    dimension: "媒体",
    drill: { channels: ["ios"] },
  };
  const query = buildDrillAnomalyQuery(topic, filters);
  expect(query?.groupby).toEqual(["媒体", "日期"]);
  expect(query?.filters).toContainEqual({
    col: "渠道商",
    op: "IN",
    val: ["ios"],
  });
});

test("table drill changes refetch the core so the trend follows", async () => {
  mockPostChartData.mockResolvedValue(coreResponse([{ cpa: 5 }]));
  const firstFilters = baseFilters() as AnalysisFilters;
  const { rerender } = renderHook(
    ({ filters }: { filters: AnalysisFilters }) =>
      useAnalysisCoreData(topic, filters),
    { initialProps: { filters: firstFilters } },
  );
  await waitFor(() => expect(mockPostChartData).toHaveBeenCalledTimes(1), {
    timeout: 3000,
  });

  act(() => {
    rerender({
      filters: { ...firstFilters, drill: { games: ["游戏 B"] } },
    });
  });
  await waitFor(() => expect(mockPostChartData).toHaveBeenCalledTimes(2), {
    timeout: 3000,
  });

  const payload = mockPostChartData.mock.calls[1][0] as {
    queries: { filters: unknown[] }[];
  };
  // Query order: totals, previous, trend, previousTrend.
  expect(payload.queries[2].filters).toEqual([
    { col: "主游戏", op: "IN", val: ["游戏 B"] },
  ]);
});

test("splits the page plan into independent KPI and trend slices", () => {
  const filters = {
    ...baseFilters(),
    drill: { games: ["游戏 B"] },
    includeNatural: false,
  };
  const kpi = buildKpiQueryPlan(topic, filters);
  const trend = buildTrendQueryPlan(topic, filters);

  // KPI totals ignore drill/natural switches (they stay on page filters).
  expect(kpi.totals.filters).toEqual([
    { col: "主游戏", op: "IN", val: ["游戏 A"] },
  ]);
  // The trend slice follows drills and the natural-traffic switch.
  expect(trend.trend.filters).toEqual([
    { col: "主游戏", op: "IN", val: ["游戏 B"] },
    { col: "媒体", op: "NOT IN", val: ["自然量"] },
  ]);
  expect(trend.previousTrend.filters).toEqual(trend.trend.filters);
});

test("table drill refetches only the trend slice", async () => {
  mockPostChartData.mockResolvedValue({
    data: { result: [{ data: [] }, { data: [] }] },
  });
  const firstFilters = baseFilters() as AnalysisFilters;
  const { rerender } = renderHook(
    ({ filters }: { filters: AnalysisFilters }) =>
      useAnalysisPageData(topic, filters),
    { initialProps: { filters: firstFilters } },
  );

  // Page load: one 2-query request for KPI + one for the trend.
  await waitFor(() => expect(mockPostChartData).toHaveBeenCalledTimes(2), {
    timeout: 3000,
  });
  const initialPayloads = mockPostChartData.mock.calls.map(
    (call) => call[0] as { queries: unknown[] },
  );
  expect(initialPayloads.map((payload) => payload.queries.length)).toEqual([
    2, 2,
  ]);

  mockPostChartData.mockClear();
  act(() => {
    rerender({
      filters: { ...firstFilters, drill: { games: ["游戏 B"] } },
    });
  });
  await waitFor(() => expect(mockPostChartData).toHaveBeenCalledTimes(1), {
    timeout: 3000,
  });
  const refetch = mockPostChartData.mock.calls[0][0] as {
    queries: { filters: { col: string; op: string; val: string[] }[] }[];
  };
  expect(refetch.queries).toHaveLength(2);
  expect(refetch.queries[0].filters).toContainEqual({
    col: "主游戏",
    op: "IN",
    val: ["游戏 B"],
  });
});

test("builds one combined query for the whole drill view", () => {
  const filters = {
    ...baseFilters(),
    dimension: "渠道商",
    focusDate: "2026-10-09",
  };
  const query = buildDrillQueryPlan(topic, filters);

  expect(query).not.toBeNull();
  expect(query?.groupby).toEqual(["渠道商", "日期"]);
  // The drill table needs every breakdown metric and the attribution metric.
  expect((query?.metrics ?? []).length).toBeGreaterThan(5);
  // 30-day attribution lookback, inclusive of the focus day.
  expect(query?.time_range).toBe("2026-09-10 : 2026-10-10");
  expect(buildDrillQueryPlan(topic, baseFilters())).toBeNull();
});

test("builds a chronological daily breakdown for the time dimension", () => {
  const filters = {
    ...baseFilters(),
    dimension: "日期",
    drill: { channels: ["android"] },
  };
  const query = buildBreakdownQuery(topic, filters);

  expect(query.groupby).toEqual(["日期"]);
  expect(query.orderby).toEqual([["日期", true]]);
  expect(query.order_desc).toBe(false);
  expect(query.filters).toContainEqual({
    col: "渠道商",
    op: "IN",
    val: ["android"],
  });
});

test("weekly drill scopes KPI, trend and breakdown to that week", () => {
  const filters = {
    ...baseFilters(),
    focusWeek: "2026-10-04",
    dimension: "渠道商",
  };
  expect(buildKpiQueryPlan(topic, filters).totals.time_range).toBe(
    "2026-10-04 : 2026-10-10",
  );
  expect(buildTrendQueryPlan(topic, filters).trend.time_range).toBe(
    "2026-10-04 : 2026-10-10",
  );
  // Breakdown ranges are end-exclusive in the backend, so the week ends at
  // 10-11 while still covering Sunday 10-04 through Saturday 10-10.
  expect(buildBreakdownQuery(topic, filters).time_range).toBe(
    "2026-10-04 : 2026-10-11",
  );
});
