import { test, expect } from "vitest";
import { resolveMenuId, resolveRoutePoint } from "@/config/menuRoutes";

test("resolves list routes to their menu entry", () => {
  expect(resolveMenuId("/dashboard/list")).toBe("dashboards");
  expect(resolveMenuId("/chart/list")).toBe("charts");
  expect(resolveMenuId("/sqllab")).toBe("sqllab");
  expect(resolveMenuId("/dataset/list")).toBe("datasets");
  expect(resolveMenuId("/database/list")).toBe("database/list");
  expect(resolveMenuId("/saved_query/list")).toBe("saved_query/list");
  expect(resolveMenuId("/alert/list")).toBe("alert/list");
  expect(resolveMenuId("/query_history")).toBe("query_history");
  expect(resolveMenuId("/project/settings")).toBe("project_config");
  expect(resolveMenuId("/briefing")).toBe("briefing");
  expect(resolveMenuId("/explore")).toBe("charts");
});

test("resolves detail and child routes to their parent menu entry", () => {
  expect(resolveMenuId("/dashboard/42")).toBe("dashboards");
  expect(resolveMenuId("/database/7")).toBe("database/list");
  expect(resolveMenuId("/dataset/create")).toBe("datasets");
  expect(resolveMenuId("/dataset/edit/9")).toBe("datasets");
  expect(resolveMenuId("/explore/abc")).toBe("charts");
  expect(resolveMenuId("/briefing/123")).toBe("briefing");
});

test("leaves fixed and legacy routes ungated", () => {
  expect(resolveMenuId("/")).toBeNull();
  expect(resolveMenuId("/system/admin")).toBeNull();
  expect(resolveMenuId("/login")).toBeNull();
  expect(resolveMenuId("/settings")).toBeNull();
  expect(resolveMenuId("/project/config")).toBeNull();
  expect(resolveMenuId("/unknown/path")).toBeNull();
});

test("resolveRoutePoint returns the canonical point for list and detail routes", () => {
  expect(resolveRoutePoint("/dashboard/list")?.path).toBe("/dashboard/list");
  expect(resolveRoutePoint("/dashboard/42")?.path).toBe("/dashboard/list");
  expect(resolveRoutePoint("/dataset/edit/9")?.label).toBe("数据集");
  expect(resolveRoutePoint("/explore/abc")?.path).toBe("/chart/list");
});

test("resolveRoutePoint covers the fixed system admin entry", () => {
  const point = resolveRoutePoint("/system/admin");
  expect(point?.id).toBe("system_admin");
  expect(point?.menuId).toBeUndefined();
  expect(point?.label).toBe("系统管理");
});

test("resolveRoutePoint returns null for uncontrolled routes", () => {
  expect(resolveRoutePoint("/")).toBeNull();
  expect(resolveRoutePoint("/login")).toBeNull();
  expect(resolveRoutePoint("/settings")).toBeNull();
  expect(resolveRoutePoint("/unknown/path")).toBeNull();
});

test("covers every controllable menu route", () => {
  for (const path of [
    "/dashboard/list",
    "/chart/list",
    "/explore",
    "/sqllab",
    "/dataset/list",
    "/database/list",
    "/saved_query/list",
    "/alert/list",
    "/query_history",
    "/project/settings",
    "/briefing",
  ]) {
    const point = resolveRoutePoint(path);
    expect(point, path).not.toBeNull();
    expect(point?.menuId, path).toBe(resolveMenuId(path));
  }
});
