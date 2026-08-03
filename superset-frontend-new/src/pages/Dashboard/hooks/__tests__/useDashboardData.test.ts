import { test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useDashboardData,
  parseChartConfig,
} from "@/pages/Dashboard/hooks/useDashboardData";

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
