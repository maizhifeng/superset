import { test, expect, beforeEach } from "vitest";
import { useDrawerStore } from "@/store/drawerState";

beforeEach(() => {
  useDrawerStore.setState({
    aiDrawerOpen: false,
    aiDrawerMode: "assistant",
    insightChartId: null,
    insightChartMeta: undefined,
    insightFilters: {},
  });
});

test("initial state has drawer closed", () => {
  const s = useDrawerStore.getState();
  expect(s.aiDrawerOpen).toBe(false);
  expect(s.aiDrawerMode).toBe("assistant");
  expect(s.insightChartId).toBeNull();
});

test("openAiDrawer opens with assistant mode", () => {
  useDrawerStore.getState().openAiDrawer("assistant");
  const s = useDrawerStore.getState();
  expect(s.aiDrawerOpen).toBe(true);
  expect(s.aiDrawerMode).toBe("assistant");
});

test("openAiDrawer opens with insight mode and insight opts", () => {
  useDrawerStore.getState().openAiDrawer("insight", {
    chartId: 42,
    chartMeta: { id: 42, slice_name: "test", viz_type: "bar" },
    filters: { f1: { value: "x", column: "c1", filterType: "==" } },
    dashboardId: "d1",
  });
  const s = useDrawerStore.getState();
  expect(s.aiDrawerOpen).toBe(true);
  expect(s.aiDrawerMode).toBe("insight");
  expect(s.insightChartId).toBe(42);
  expect(s.insightChartMeta?.id).toBe(42);
  expect(s.insightFilters).toEqual({
    f1: { value: "x", column: "c1", filterType: "==" },
  });
});

test("closeAiDrawer resets insight state", () => {
  useDrawerStore.setState({
    aiDrawerOpen: true,
    insightChartId: 10,
    insightChartMeta: { id: 10, slice_name: "x", viz_type: "line" },
    insightFilters: { f: { value: 1, column: "c", filterType: ">" } },
  });
  useDrawerStore.getState().closeAiDrawer();
  const s = useDrawerStore.getState();
  expect(s.aiDrawerOpen).toBe(false);
  expect(s.insightChartId).toBeNull();
  expect(s.insightChartMeta).toBeUndefined();
  expect(s.insightFilters).toEqual({});
});

test("setDrawerWidth updates drawer width", () => {
  useDrawerStore.getState().setDrawerWidth(500);
  expect(useDrawerStore.getState().drawerWidth).toBe(500);
});
