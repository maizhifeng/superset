import { test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardData, parseChartConfig } from "@/pages/Dashboard/hooks/useDashboardData";

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
  const result = parseChartConfig(chart as any);
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
  const result = parseChartConfig(chart as any);
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
    result.current.setChartMeta({ 1: { id: 1, slice_name: "c1", viz_type: "bar" } as any });
  });
  expect(result.current.chartMeta[1].slice_name).toBe("c1");

  act(() => {
    result.current.setChartData({ 1: { data: [{ a: 1 }] } as any });
  });
  expect(result.current.chartData[1]).toEqual({ data: [{ a: 1 }] });

  act(() => {
    const row: any = { total_count: 15000 };
    result.current.setTotalRows({ 1: row });
  });
  expect(result.current.totalRows[1]).toEqual({ total_count: 15000 });
});
