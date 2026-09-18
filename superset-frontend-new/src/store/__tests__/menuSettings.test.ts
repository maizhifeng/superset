import { useMenuSettings, mergeDefaults } from "@/store/menuSettings";
import { test, expect, beforeEach, vi } from "vitest";

const { mockApi } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), put: vi.fn() },
}));

vi.mock("@/api", () => ({ default: mockApi }));

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.put.mockReset();
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

test("fetchSettings replaces local state with the server payload", async () => {
  mockApi.get.mockResolvedValue({
    data: {
      result: {
        items: [
          {
            id: "dashboards",
            path: "/dashboard/list",
            label: "仪表板",
            builtIn: true,
          },
        ],
        enabled: { dashboards: false },
      },
    },
  });

  await useMenuSettings.getState().fetchSettings();

  expect(useMenuSettings.getState().enabled.dashboards).toBe(false);
  // Missing default entries are re-added with their default visibility.
  expect(useMenuSettings.getState().enabled.charts).toBe(true);
});

test("fetchSettings falls back to defaults when the server has none", async () => {
  mockApi.get.mockResolvedValue({ data: { result: null } });
  useMenuSettings.setState({ items: [], enabled: {} });

  await useMenuSettings.getState().fetchSettings();

  expect(useMenuSettings.getState().enabled.sqllab).toBe(false);
  expect(useMenuSettings.getState().enabled.dashboards).toBe(true);
  expect(useMenuSettings.getState().items.length).toBeGreaterThan(0);
});

test("fetchSettings keeps cached state when the request fails", async () => {
  mockApi.get.mockRejectedValue(new Error("offline"));
  useMenuSettings.setState({ items: [], enabled: { dashboards: false } });

  await useMenuSettings.getState().fetchSettings();

  expect(useMenuSettings.getState().enabled.dashboards).toBe(false);
});

test("saveSettings PUTs the current configuration", async () => {
  mockApi.put.mockResolvedValue({ data: { result: {} } });
  const items = [
    {
      id: "dashboards",
      path: "/dashboard/list",
      label: "仪表板",
      builtIn: true,
    },
  ];
  useMenuSettings.setState({ items, enabled: { dashboards: true } });

  await useMenuSettings.getState().saveSettings();

  expect(mockApi.put).toHaveBeenCalledWith("/menu/settings", {
    items,
    enabled: { dashboards: true },
  });
});
