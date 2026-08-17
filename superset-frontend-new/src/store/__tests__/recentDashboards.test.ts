import { test, expect, beforeEach } from "vitest";
import { useRecentDashboards } from "@/store/recentDashboards";

beforeEach(() => {
  localStorage.clear();
  useRecentDashboards.setState({ items: [] });
});

test("record adds an id to the front", () => {
  useRecentDashboards.getState().record(1);
  useRecentDashboards.getState().record(2);
  expect(useRecentDashboards.getState().recentIds()).toEqual([2, 1]);
});

test("record moves an existing id to the front without duplication", () => {
  useRecentDashboards.getState().record(1);
  useRecentDashboards.getState().record(2);
  useRecentDashboards.getState().record(1);
  expect(useRecentDashboards.getState().recentIds()).toEqual([1, 2]);
});

test("record caps the list to the max recent count", () => {
  for (let i = 1; i <= 20; i += 1) {
    useRecentDashboards.getState().record(i);
  }
  const ids = useRecentDashboards.getState().recentIds();
  expect(ids).toHaveLength(8);
  expect(ids[0]).toBe(20);
  expect(ids).not.toContain(1);
});

test("clear removes all records", () => {
  useRecentDashboards.getState().record(1);
  useRecentDashboards.getState().record(2);
  useRecentDashboards.getState().clear();
  expect(useRecentDashboards.getState().recentIds()).toEqual([]);
});
