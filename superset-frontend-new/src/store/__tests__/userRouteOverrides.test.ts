import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { test, expect, beforeEach } from "vitest";

beforeEach(() => {
  useUserRouteOverrides.setState({ overrides: {} });
});

test("setOverride stores grant and deny values", () => {
  const { setOverride } = useUserRouteOverrides.getState();
  setOverride("alice", "/briefing", true);
  setOverride("alice", "/dashboard/list", false);

  expect(useUserRouteOverrides.getState().getOverrides("alice")).toEqual({
    "/briefing": true,
    "/dashboard/list": false,
  });
});

test("clearOverride removes a single route override", () => {
  const { setOverride, clearOverride } = useUserRouteOverrides.getState();
  setOverride("alice", "/briefing", false);
  setOverride("alice", "/dashboard/list", true);

  clearOverride("alice", "/briefing");

  expect(useUserRouteOverrides.getState().getOverrides("alice")).toEqual({
    "/dashboard/list": true,
  });
});

test("clearOverride keeps other users untouched", () => {
  const { setOverride, clearOverride } = useUserRouteOverrides.getState();
  setOverride("alice", "/briefing", false);
  setOverride("bob", "/briefing", true);

  clearOverride("alice", "/briefing");

  expect(useUserRouteOverrides.getState().getOverrides("alice")).toEqual({});
  expect(useUserRouteOverrides.getState().getOverrides("bob")).toEqual({
    "/briefing": true,
  });
});

test("clearOverride is a no-op for unknown users or paths", () => {
  const { setOverride, clearOverride } = useUserRouteOverrides.getState();
  setOverride("alice", "/briefing", false);

  clearOverride("nobody", "/briefing");
  clearOverride("alice", "/unknown");

  expect(useUserRouteOverrides.getState().getOverrides("alice")).toEqual({
    "/briefing": false,
  });
});

test("clearOverrides removes every route for a user", () => {
  const { setOverride, clearOverrides } = useUserRouteOverrides.getState();
  setOverride("alice", "/briefing", false);
  setOverride("alice", "/dashboard/list", true);

  clearOverrides("alice");

  expect(useUserRouteOverrides.getState().getOverrides("alice")).toEqual({});
});
