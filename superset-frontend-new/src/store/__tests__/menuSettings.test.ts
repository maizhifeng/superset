import { useMenuSettings } from "@/store/menuSettings";
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

test("addItem creates a custom nav item", () => {
  useMenuSettings.getState().addItem("/custom", "Custom Page");

  const state = useMenuSettings.getState();
  const added = state.items.find((item) => item.label === "Custom Page");
  expect(added).toBeDefined();
  expect(added!.builtIn).toBe(false);
  expect(added!.path).toBe("/custom");
  expect(state.enabled[added!.id]).toBe(true);
});

test("removeItem deletes item and its enabled state", () => {
  useMenuSettings.getState().addItem("/custom", "Custom");
  const added = useMenuSettings
    .getState()
    .items.find((item) => item.label === "Custom");
  useMenuSettings.getState().removeItem(added!.id);

  expect(
    useMenuSettings.getState().items.find((i) => i.id === added!.id),
  ).toBeUndefined();
  expect(useMenuSettings.getState().enabled[added!.id]).toBeUndefined();
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

test("removeItem with unknown id does nothing", () => {
  const before = useMenuSettings.getState().items.length;
  useMenuSettings.getState().removeItem("nonexistent");
  expect(useMenuSettings.getState().items).toHaveLength(before);
});
