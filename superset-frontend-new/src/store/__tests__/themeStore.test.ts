import { test, expect, beforeEach } from "vitest";
import { useThemeStore } from "@/store/themeStore";

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ theme: "paper" });
});

test("initial theme is paper", () => {
  expect(useThemeStore.getState().theme).toBe("paper");
});

test("setTheme changes theme", () => {
  useThemeStore.getState().setTheme("vibrant");
  expect(useThemeStore.getState().theme).toBe("vibrant");

  useThemeStore.getState().setTheme("paper");
  expect(useThemeStore.getState().theme).toBe("paper");
});

test("toggleTheme switches between paper and vibrant", () => {
  expect(useThemeStore.getState().theme).toBe("paper");
  useThemeStore.getState().toggleTheme();
  expect(useThemeStore.getState().theme).toBe("vibrant");
  useThemeStore.getState().toggleTheme();
  expect(useThemeStore.getState().theme).toBe("paper");
});
