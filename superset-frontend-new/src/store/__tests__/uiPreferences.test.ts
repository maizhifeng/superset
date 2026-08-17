import { test, expect, beforeEach } from "vitest";
import { useUiPreferences } from "@/store/uiPreferences";

beforeEach(() => {
  localStorage.clear();
  useUiPreferences.setState({ gridDensity: "compact" });
});

test("default grid density is compact", () => {
  expect(useUiPreferences.getState().gridDensity).toBe("compact");
});

test("setGridDensity changes the density", () => {
  useUiPreferences.getState().setGridDensity("comfortable");
  expect(useUiPreferences.getState().gridDensity).toBe("comfortable");
  useUiPreferences.getState().setGridDensity("standard");
  expect(useUiPreferences.getState().gridDensity).toBe("standard");
});

test("density persists to localStorage", () => {
  useUiPreferences.getState().setGridDensity("comfortable");
  const raw = localStorage.getItem("superset-ui-preferences");
  expect(raw).toContain("comfortable");
});
