import { test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useDashboardData,
  parseChartConfig,
  upsertRows,
} from "@/pages/Dashboard/hooks/useDashboardData";
import { queryClient } from "@/api/queryClient";
import type { ChartDataRow } from "@/types/api";

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { headers: { common: {} } },
  },
  getDataset: vi.fn(() => Promise.resolve({ columns: [], metrics: [] })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // The module-level queryClient persists across tests; stale entries would
  // satisfy fetchQuery without touching the network.
  queryClient.clear();
});

test("parseChartConfig parses form_data string", () => {
  const chart = {
    id: 1,
    slice_name: "test",
    viz_type: "bar",
    datasource_id: 42,
    datasource_type: "table",
    form_data: JSON.stringify({ metrics: ["count"], groupby: ["platform"] }),
  };
  const result = parseChartConfig(chart);
  expect(result.metrics).toEqual(["count"]);
  expect(result.groupby).toEqual(["platform"]);
  expect(result.datasource).toBe("42__table");
});

test("parseChartConfig handles missing form_data gracefully", () => {
  const chart = {
    id: 2,
    slice_name: "test2",
    viz_type: "line",
    datasource_id: 99,
    datasource_type: "table",
    form_data: undefined,
  };
  const result = parseChartConfig(chart);
  expect(result.datasource).toBe("99__table");
});

test("initial state has empty chart data", () => {
  const { result } = renderHook(() => useDashboardData());
  expect(result.current.chartMeta).toEqual({});
  expect(result.current.chartData).toEqual({});
  expect(result.current.totalRows).toEqual({});
});

test("chart data can be set externally", () => {
  const { result } = renderHook(() => useDashboardData());
  act(() => {
    result.current.setChartMeta({
      1: { id: 1, slice_name: "c1", viz_type: "bar" },
    });
  });
  expect(result.current.chartMeta[1].slice_name).toBe("c1");

  act(() => {
    result.current.setChartData({ 1: { data: [{ a: 1 }] } });
  });
  expect(result.current.chartData[1]).toEqual({ data: [{ a: 1 }] });

  act(() => {
    const row: any = { total_count: 15000 };
    result.current.setTotalRows({ 1: row });
  });
  expect(result.current.totalRows[1]).toEqual({ total_count: 15000 });
});

vi.mock("@/config/federatedDatasets", () => ({
  isFederatedDataset: (id: number | undefined) => id === 7,
  FEDERATED_DATASETS: new Set<number>([7]),
  refreshFederatedDatasets: () => Promise.resolve(),
}));

const buildChart = (id: number, dsId: number) => ({
  id,
  slice_name: `chart-${id}`,
  viz_type: "table",
  datasource_id: dsId,
  datasource_type: "table",
  params: JSON.stringify({ metrics: ["sum__x"], groupby: ["dim"] }),
  form_data: JSON.stringify({ metrics: ["sum__x"], groupby: ["dim"] }),
});

const mockPost = (api: any, detail: any[], total: any) => {
  api.post.mockResolvedValue({
    data: { result: [{ data: detail }, { data: [total] }] },
  });
};

test("federated dataset uses backend total row without client override", async () => {
  const api = await import("@/api");
  mockPost(
    api.default,
    [
      { dim: "a", sum__x: 10, 分成后流水: 5 },
      { dim: "b", sum__x: 20, 分成后流水: 6 },
    ],
    { 分成后流水: 999 }, // backend cross-DB grand total
  );

  const { result } = renderHook(() => useDashboardData());
  const meta = { 7: buildChart(7, 7) as any };
  let fetched: any;
  await act(async () => {
    fetched = await result.current.fetchChartWithTotal(7, meta);
  });
  // Client override must be skipped for federated datasets, so the backend
  // grand-total value (999) is preserved, not summed from detail rows (11).
  expect(fetched.totalRow["分成后流水"]).toBe(999);
});

test("non-federated dataset sums computed column from detail rows", async () => {
  const api = await import("@/api");
  mockPost(
    api.default,
    [
      { dim: "a", sum__x: 10, 分成后流水: 5 },
      { dim: "b", sum__x: 20, 分成后流水: 6 },
    ],
    { 分成后流水: 0 },
  );

  const { result } = renderHook(() => useDashboardData());
  const meta = { 8: buildChart(8, 8) as any };
  let fetched: any;
  await act(async () => {
    fetched = await result.current.fetchChartWithTotal(8, meta);
  });
  expect(fetched.totalRow["分成后流水"]).toBe(11);
});

test("a superseded getChartDataWithFilters result is dropped (race protection)", async () => {
  const api = await import("@/api");
  const { result } = renderHook(() => useDashboardData());
  const meta = { 8: buildChart(8, 8) as any };

  // Different filter signatures produce different react-query keys, so two
  // calls race with distinct requests.  The slower (older filter) response
  // resolves last; its results must be dropped so the caller merges only the
  // latest epoch's data.
  const buildSlow = () => [{ subject: "dim", operator: "!=", comparator: "slow" }];
  const buildFast = () => [{ subject: "dim", operator: "!=", comparator: "fast" }];

  let resolveFirst: (() => void) | null = null;
  (api.default.post as any).mockImplementationOnce(() => {
    return new Promise((resolve) => {
      resolveFirst = () =>
        resolve({
          data: { result: [{ data: [{ dim: "slow" }] }, { data: [] }] },
        });
    });
  });
  (api.default.post as any).mockImplementationOnce(() =>
    Promise.resolve({
      data: { result: [{ data: [{ dim: "fast" }] }, { data: [] }] },
    }),
  );

  const first = result.current.getChartDataWithFilters([8], meta, buildSlow);
  type BatchResult = Awaited<
    ReturnType<ReturnType<typeof useDashboardData>["getChartDataWithFilters"]>
  >;
  let second: BatchResult | undefined;
  let firstResolved: BatchResult | undefined;
  await act(async () => {
    // Second call bumps the epoch and resolves immediately with the fast row.
    second = await result.current.getChartDataWithFilters(
      [8],
      meta,
      buildFast,
    );
  });
  expect(second?.dataMap[8]).toEqual({ data: [{ dim: "fast" }] });

  // Flush the slow response after the second call has settled.
  await act(async () => {
    resolveFirst?.();
    firstResolved = await first;
  });

  // The superseded call must report nothing at all — a partial result would
  // mix old- and new-condition charts when the caller merges it.
  expect(firstResolved).toBeNull();
});

test("overlapping forced fetches with different filters never share a response", async () => {
  const api = await import("@/api");
  const { result } = renderHook(() => useDashboardData());
  const meta = { 8: buildChart(8, 8) as any };

  const buildSlow = () => [
    { subject: "dim", operator: "==", comparator: "slow" },
  ];
  const buildFast = () => [
    { subject: "dim", operator: "==", comparator: "fast" },
  ];

  // First (older filter) request hangs until the newer one has fully
  // settled, reproducing the in-flight overlap of rapid filter changes.
  let resolveSlow: (v: unknown) => void = () => {};
  const slowPromise = new Promise((resolve) => {
    resolveSlow = resolve;
  });
  (api.default.post as any)
    .mockImplementationOnce(() => slowPromise)
    .mockImplementationOnce(() =>
      Promise.resolve({
        data: { result: [{ data: [{ dim: "fast" }] }, { data: [] }] },
      }),
    );

  type BatchResult = Awaited<
    ReturnType<ReturnType<typeof useDashboardData>["getChartDataWithFilters"]>
  >;
  const first = result.current.getChartDataWithFilters(
    [8],
    meta,
    buildSlow,
    true,
  );
  let second: BatchResult | undefined;
  let firstResult: BatchResult | undefined;
  await act(async () => {
    // Distinct filter signatures must produce distinct react-query keys, so
    // the newer forced fetch starts its own request instead of joining the
    // older one and resolving with its (previous-condition) response.
    second = await result.current.getChartDataWithFilters(
      [8],
      meta,
      buildFast,
      true,
    );
  });
  expect(second?.dataMap[8]).toEqual({ data: [{ dim: "fast" }] });

  await act(async () => {
    resolveSlow({
      data: { result: [{ data: [{ dim: "slow" }] }, { data: [] }] },
    });
    firstResult = await first;
  });
  expect(firstResult).toBeNull();
});

test("forced fetch refetches even when a fresh cache entry exists", async () => {
  const api = await import("@/api");
  (api.default.post as any).mockResolvedValue({
    data: { result: [{ data: [{ dim: "v1" }] }, { data: [] }] },
  });
  const { result } = renderHook(() => useDashboardData());
  const meta = { 8: buildChart(8, 8) as any };
  const buildFn = () => [{ subject: "dim", operator: "==", comparator: "x" }];

  await act(async () => {
    await result.current.getChartDataWithFilters([8], meta, buildFn);
  });
  expect(api.default.post).toHaveBeenCalledTimes(1);

  // Same filters, forced: the cached payload must be dropped and the network
  // hit again (this is what keeps saved/refreshed charts from showing stale
  // data under an unchanged filter signature).
  await act(async () => {
    await result.current.getChartDataWithFilters([8], meta, buildFn, true);
  });
  expect(api.default.post).toHaveBeenCalledTimes(2);
});

test("repeated non-forced fetch with unchanged filters is served from cache", async () => {
  const api = await import("@/api");
  (api.default.post as any).mockResolvedValue({
    data: { result: [{ data: [{ dim: "v1" }] }, { data: [] }] },
  });
  const { result } = renderHook(() => useDashboardData());
  const meta = { 8: buildChart(8, 8) as any };
  const buildFn = () => [{ subject: "dim", operator: "==", comparator: "x" }];

  await act(async () => {
    await result.current.getChartDataWithFilters([8], meta, buildFn);
  });
  await act(async () => {
    await result.current.getChartDataWithFilters([8], meta, buildFn);
  });
  expect(api.default.post).toHaveBeenCalledTimes(1);
});

test("changing the end time while the start-time fetch is in flight lands both filters", async () => {
  const api = await import("@/api");
  const { result } = renderHook(() => useDashboardData());
  const meta = { 8: buildChart(8, 8) as any };

  // Mimics useDashboardFilters.buildAdhocFilters bound to a mutable time
  // range: the end date changes while the start-date request is in flight.
  const timeRange = { start: "2024/01/01", end: null as string | null };
  const buildFn = () => {
    const filters = [
      { subject: "day", operator: ">=", comparator: timeRange.start },
    ];
    if (timeRange.end)
      filters.push({
        subject: "day",
        operator: "<=",
        comparator: timeRange.end,
      });
    return filters;
  };

  const capturedFilters: unknown[][] = [];
  let resolveStartFetch: (v: unknown) => void = () => {};
  (api.default.post as any)
    .mockImplementationOnce((_url: string, body: any) => {
      capturedFilters.push(body.queries[0].filters);
      return new Promise((resolve) => {
        resolveStartFetch = resolve;
      });
    })
    .mockImplementationOnce((_url: string, body: any) => {
      capturedFilters.push(body.queries[0].filters);
      return Promise.resolve({
        data: { result: [{ data: [{ dim: "both" }] }, { data: [] }] },
      });
    });

  type BatchResult = Awaited<
    ReturnType<ReturnType<typeof useDashboardData>["getChartDataWithFilters"]>
  >;
  // Change the start time -> forced fetch fires with only the lower bound.
  const startRound = result.current.getChartDataWithFilters(
    [8],
    meta,
    buildFn,
    true,
  );
  await act(async () => {});
  expect(capturedFilters[0]).toEqual([{ col: "day", op: ">=", val: "2024/01/01" }]);

  // Change the end time mid-flight -> the second forced fetch must carry BOTH
  // bounds under its own cache key instead of joining the first request.
  timeRange.end = "2024/01/31";
  let endRound: BatchResult | undefined;
  await act(async () => {
    endRound = await result.current.getChartDataWithFilters(
      [8],
      meta,
      buildFn,
      true,
    );
  });
  expect(capturedFilters[1]).toEqual([
    { col: "day", op: ">=", val: "2024/01/01" },
    { col: "day", op: "<=", val: "2024/01/31" },
  ]);
  expect(endRound?.dataMap[8]).toEqual({ data: [{ dim: "both" }] });

  // The stale start-only response lands last and must be discarded entirely.
  let startResult: BatchResult | undefined;
  await act(async () => {
    resolveStartFetch({
      data: { result: [{ data: [{ dim: "start-only" }] }, { data: [] }] },
    });
    startResult = await startRound;
  });
  expect(startResult).toBeNull();
});

test("upsertRows sets rows when produced and deletes stale entries", () => {
  const prev: Record<number, ChartDataRow[][]> = {
    1: [[{ dim: "old" }]],
  };
  const withRows = upsertRows(prev, 2, [[{ dim: "new" }]]);
  expect(withRows[2]).toEqual([[{ dim: "new" }]]);
  expect(withRows[1]).toEqual(prev[1]);

  const withoutRows = upsertRows(withRows, 2, undefined);
  expect(withoutRows[2]).toBeUndefined();
  // Input is never mutated.
  expect(prev[2]).toBeUndefined();
});
