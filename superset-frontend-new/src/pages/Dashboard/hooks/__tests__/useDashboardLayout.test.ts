import { test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardLayout } from "@/pages/Dashboard/hooks/useDashboardLayout";

vi.mock("@/api", () => ({
  default: { put: vi.fn(), defaults: { headers: { common: {} } } },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test("initial state defaults", () => {
  const onNodeMapChange = vi.fn();
  const { result } = renderHook(() =>
    useDashboardLayout({
      dashboardId: "d1",
      nodeMap: {},
      chartMeta: {},
      onNodeMapChange,
    }),
  );
  expect(result.current.saving).toBe(false);
  expect(result.current.containerWidth).toBe(1200);
});

test("handleSizeChange updates width in nodeMap", () => {
  const onNodeMapChange = vi.fn();
  const chartNode = {
    type: "CHART" as const,
    children: [],
    id: "CHART-1",
    meta: { chartId: 1, width: 6 },
  };
  const nodeMap = { "CHART-1": chartNode };

  const { result } = renderHook(() =>
    useDashboardLayout({
      dashboardId: "d1",
      nodeMap,
      chartMeta: {
        1: { slice_name: "Test", datasource_id: 26, viz_type: "table" } as any,
      },
      onNodeMapChange,
    }),
  );
  act(() => result.current.handleSizeChange(1, 12, 18));
  expect(onNodeMapChange).toHaveBeenCalled();
  const updatedMap = onNodeMapChange.mock.calls[0][0];
  expect(updatedMap["CHART-1"].meta?.width).toBe(12);
  expect(updatedMap["CHART-1"].meta?.height).toBe(18);
});

test("returned refs are stable references", () => {
  const onNodeMapChange = vi.fn();
  const { result } = renderHook(() =>
    useDashboardLayout({
      dashboardId: "d1",
      nodeMap: {},
      chartMeta: {},
      onNodeMapChange,
    }),
  );
  expect(result.current.nodeMapRef).toBeDefined();
  expect(result.current.nodeMapRef.current).toEqual({});
  expect(result.current.fullPositionRef).toBeDefined();
  expect(result.current.saveLayoutRef).toBeDefined();
  expect(result.current.containerRef).toBeDefined();
});

test("setFullPosition stores data on the ref", () => {
  const onNodeMapChange = vi.fn();
  const { result } = renderHook(() =>
    useDashboardLayout({
      dashboardId: "d1",
      nodeMap: {},
      chartMeta: {},
      onNodeMapChange,
    }),
  );
  const pos = {
    ROOT_ID: { id: "ROOT_ID", type: "ROOT", children: ["GRID_ID"] },
  };
  act(() => result.current.setFullPosition(pos));
  expect(result.current.fullPositionRef.current).toEqual(pos);
});
