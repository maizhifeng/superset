import { test, expect, beforeEach } from "vitest";
import { useRecentCharts } from "@/store/recentCharts";

beforeEach(() => {
  localStorage.clear();
  useRecentCharts.setState({ items: [] });
});

test("record adds an id to the front", () => {
  useRecentCharts.getState().record(1);
  useRecentCharts.getState().record(2);
  expect(useRecentCharts.getState().recentIds()).toEqual([2, 1]);
});

test("record moves an existing id to the front without duplication", () => {
  useRecentCharts.getState().record(1);
  useRecentCharts.getState().record(2);
  useRecentCharts.getState().record(1);
  expect(useRecentCharts.getState().recentIds()).toEqual([1, 2]);
});

test("clear removes all records", () => {
  useRecentCharts.getState().record(1);
  useRecentCharts.getState().clear();
  expect(useRecentCharts.getState().recentIds()).toEqual([]);
});
