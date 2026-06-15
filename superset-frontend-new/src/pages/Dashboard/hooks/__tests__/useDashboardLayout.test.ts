import { test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardLayout } from "@/pages/Dashboard/hooks/useDashboardLayout";

vi.mock("@/api", () => ({
  default: { put: vi.fn(), defaults: { headers: { common: {} } } },
}));

vi.mock("@/store/navStore", () => ({
  useNavStore: vi.fn((selector) =>
    selector({ sidePanelPinned: false }),
  ),
}));

vi.mock("@/store/drawerState", () => ({
  useDrawerStore: vi.fn((selector) =>
    selector({ aiDrawerOpen: false }),
  ),
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
  expect(result.current.isDragging).toBe(false);
  expect(result.current.saving).toBe(false);
  expect(result.current.containerWidth).toBe(1200);
});

test("setIsDragging works", () => {
  const onNodeMapChange = vi.fn();
  const { result } = renderHook(() =>
    useDashboardLayout({
      dashboardId: "d1",
      nodeMap: {},
      chartMeta: {},
      onNodeMapChange,
    }),
  );
  act(() => result.current.setIsDragging(true));
  expect(result.current.isDragging).toBe(true);
  act(() => result.current.setIsDragging(false));
  expect(result.current.isDragging).toBe(false);
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
  const pos = { ROOT_ID: { id: "ROOT_ID", type: "ROOT", children: ["GRID_ID"] } };
  act(() => result.current.setFullPosition(pos));
  expect(result.current.fullPositionRef.current).toEqual(pos);
});
