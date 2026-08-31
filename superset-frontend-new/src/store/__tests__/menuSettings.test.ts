import { useMenuSettings, mergeDefaults } from "@/store/menuSettings";
import { test, expect, beforeEach } from "vitest";

beforeEach(() => {
  useMenuSettings.setState({
    items: [
      {
        id: "dashboards",
        path: "/dashboard/list",
        label: "Dashboards",
        builtIn: true,
      },
      { id: "charts", path: "/chart/list", label: "Charts", builtIn: true },
      { id: "sqllab", path: "/sqllab", label: "SQL Lab", builtIn: true },
    ],
    enabled: { dashboards: true, charts: true, sqllab: true },
  });
});

test("starts with default items enabled", () => {
  const state = useMenuSettings.getState();
  expect(state.items.length).toBeGreaterThanOrEqual(3);
  expect(state.enabled.dashboards).toBe(true);
});

test("toggle flips enabled state", () => {
  useMenuSettings.getState().toggle("dashboards");
  expect(useMenuSettings.getState().enabled.dashboards).toBe(false);

  useMenuSettings.getState().toggle("dashboards");
  expect(useMenuSettings.getState().enabled.dashboards).toBe(true);
});

test("moveItem moves item up", () => {
  useMenuSettings.getState().moveItem("charts", "up");
  const items = useMenuSettings.getState().items;
  expect(items[0].id).toBe("charts");
  expect(items[1].id).toBe("dashboards");
});

test("moveItem moves item down", () => {
  useMenuSettings.getState().moveItem("dashboards", "down");
  const items = useMenuSettings.getState().items;
  expect(items[0].id).toBe("charts");
  expect(items[1].id).toBe("dashboards");
});

test("moveItem does nothing at boundary", () => {
  useMenuSettings.getState().moveItem("dashboards", "up");
  const items = useMenuSettings.getState().items;
  expect(items[0].id).toBe("dashboards");
});

test("mergeDefaults purges deprecated report menu items by id", () => {
  const result = mergeDefaults({
    items: [
      { id: "report", path: "/report", label: "报告", builtIn: false },
      { id: "briefing", path: "/briefing", label: "简报", builtIn: true },
    ],
    enabled: { report: true, briefing: true },
  });
  const ids = result.items.map((i) => i.id);
  expect(ids).not.toContain("report");
  expect(ids).toContain("briefing");
  expect(result.enabled.report).toBeUndefined();
  expect(result.enabled.briefing).toBe(true);
});

test("mergeDefaults purges deprecated report menu items by path", () => {
  const result = mergeDefaults({
    items: [
      {
        id: "custom_123",
        path: "/report",
        label: "报告",
        builtIn: false,
      },
      { id: "briefing", path: "/briefing", label: "简报", builtIn: true },
    ],
    enabled: { custom_123: true, briefing: true },
  });
  const ids = result.items.map((i) => i.id);
  expect(ids).not.toContain("custom_123");
  expect(ids).toContain("briefing");
  expect(result.enabled.custom_123).toBeUndefined();
});

test("mergeDefaults keeps the briefing entry", () => {
  const result = mergeDefaults({
    items: [
      { id: "briefing", path: "/briefing", label: "简报", builtIn: true },
    ],
    enabled: { briefing: true },
  });
  expect(result.items.some((i) => i.id === "briefing")).toBe(true);
  expect(result.enabled.briefing).toBe(true);
});
