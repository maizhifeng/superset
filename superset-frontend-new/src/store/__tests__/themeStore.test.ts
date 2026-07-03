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
  useThemeStore.getState().setTheme("notion");
  expect(useThemeStore.getState().theme).toBe("notion");

  useThemeStore.getState().setTheme("paper");
  expect(useThemeStore.getState().theme).toBe("paper");
});

test("toggleTheme switches between paper and notion", () => {
  expect(useThemeStore.getState().theme).toBe("paper");
  useThemeStore.getState().toggleTheme();
  expect(useThemeStore.getState().theme).toBe("notion");
  useThemeStore.getState().toggleTheme();
  expect(useThemeStore.getState().theme).toBe("paper");
});
