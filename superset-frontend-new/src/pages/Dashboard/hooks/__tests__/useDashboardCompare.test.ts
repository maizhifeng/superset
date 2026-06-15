import { test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardCompare } from "@/pages/Dashboard/hooks/useDashboardCompare";

vi.mock("@/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), defaults: { headers: { common: {} } } },
  getDataset: vi.fn(() => Promise.resolve({ columns: [] })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeChartMeta() {
  return {
    1: {
      id: 1,
      slice_name: "Test Chart",
      viz_type: "table",
      datasource_id: 10,
      datasource_type: "table",
    },
  } as Record<number, any>;
}

test("initial compare state is empty", () => {
  const chartDataRef = { current: {} };
  const buildRef = { current: vi.fn(() => []) };
  const { result } = renderHook(() =>
    useDashboardCompare({
      chartMeta: makeChartMeta(),
      chartData: {},
      chartDataRef,
      buildAdhocFiltersRef: buildRef,
    }),
  );
  expect(result.current.compareConfig).toBeNull();
  expect(result.current.compareModalOpen).toBe(false);
  expect(result.current.compareChartId).toBeNull();
  expect(result.current.periodModalOpen).toBe(false);
  expect(result.current.mirrorData).toEqual({});
});

test("handleToggleCompare opens modal with chart id", () => {
  const chartDataRef = { current: {} };
  const buildRef = { current: vi.fn(() => []) };
  const { result } = renderHook(() =>
    useDashboardCompare({
      chartMeta: makeChartMeta(),
      chartData: {},
      chartDataRef,
      buildAdhocFiltersRef: buildRef,
    }),
  );
  act(() => result.current.handleToggleCompare(1));
  expect(result.current.compareModalOpen).toBe(true);
  expect(result.current.compareChartId).toBe(1);
});

test("handleToggleCompare toggles off when same chart", () => {
  const chartDataRef = { current: {} };
  const buildRef = { current: vi.fn(() => []) };
  const { result } = renderHook(() =>
    useDashboardCompare({
      chartMeta: makeChartMeta(),
      chartData: {},
      chartDataRef,
      buildAdhocFiltersRef: buildRef,
    }),
  );
  act(() => result.current.handleToggleCompare(5));
  // Apply compare to set compareConfig
  act(() =>
    result.current.handleApplyCompare([
      { dimension: "platform", values: ["mini_game"] },
    ]),
  );
  // Toggle again to disable
  act(() => result.current.handleToggleCompare(5));
  expect(result.current.compareConfig).toBeNull();
  expect(result.current.mirrorData).toEqual({});
});

test("handleApplyCompare sets compareConfig and closes modal", () => {
  const chartDataRef = { current: { 1: { data: [] } } };
  const buildRef = { current: vi.fn(() => []) };
  const { result } = renderHook(() =>
    useDashboardCompare({
      chartMeta: makeChartMeta(),
      chartData: { 1: { data: [] } },
      chartDataRef,
      buildAdhocFiltersRef: buildRef,
    }),
  );
  act(() => {
    result.current.handleToggleCompare(1);
  });
  act(() => {
    result.current.handleApplyCompare([
      { dimension: "game", values: ["A", "B"] },
    ]);
  });
  expect(result.current.compareConfig).toEqual({
    enabled: true,
    chartId: 1,
    dimensions: [{ dimension: "game", values: ["A", "B"] }],
  });
  expect(result.current.compareModalOpen).toBe(false);
});

test("closeCompareModal resets modal state", () => {
  const chartDataRef = { current: {} };
  const buildRef = { current: vi.fn(() => []) };
  const { result } = renderHook(() =>
    useDashboardCompare({
      chartMeta: makeChartMeta(),
      chartData: {},
      chartDataRef,
      buildAdhocFiltersRef: buildRef,
    }),
  );
  act(() => {
    result.current.handleToggleCompare(3);
  });
  act(() => {
    result.current.closeCompareModal();
  });
  expect(result.current.compareModalOpen).toBe(false);
  expect(result.current.compareChartId).toBeNull();
});

test("openPeriodModal and closePeriodModal manage period state", () => {
  const chartDataRef = { current: {} };
  const buildRef = { current: vi.fn(() => []) };
  const { result } = renderHook(() =>
    useDashboardCompare({
      chartMeta: makeChartMeta(),
      chartData: {},
      chartDataRef,
      buildAdhocFiltersRef: buildRef,
    }),
  );
  act(() => {
    result.current.openPeriodModal(7, { data: [{ a: 1 }] });
  });
  expect(result.current.periodModalOpen).toBe(true);
  expect(result.current.periodModalChartId).toBe(7);
  expect(result.current.periodModalChartData).toEqual({ data: [{ a: 1 }] });

  act(() => {
    result.current.closePeriodModal();
  });
  expect(result.current.periodModalOpen).toBe(false);
  expect(result.current.periodModalChartId).toBeNull();
  expect(result.current.periodModalChartData).toBeUndefined();
});
