import { test, expect, beforeEach } from "vitest";
import { useFullscreenStore } from "@/store/fullscreenStore";

beforeEach(() => {
  useFullscreenStore.setState({
    activeChartId: null,
    forceLandscape: false,
  });
});

test("initial state has no active chart", () => {
  const s = useFullscreenStore.getState();
  expect(s.activeChartId).toBeNull();
  expect(s.forceLandscape).toBe(false);
});

test("setFullscreen sets active chart id", () => {
  useFullscreenStore.getState().setFullscreen(10);
  expect(useFullscreenStore.getState().activeChartId).toBe(10);

  useFullscreenStore.getState().setFullscreen(null);
  expect(useFullscreenStore.getState().activeChartId).toBeNull();
});

test("setForceLandscape toggles landscape mode", () => {
  useFullscreenStore.getState().setForceLandscape(true);
  expect(useFullscreenStore.getState().forceLandscape).toBe(true);

  useFullscreenStore.getState().setForceLandscape(false);
  expect(useFullscreenStore.getState().forceLandscape).toBe(false);
});

test("exit clears fullscreen and landscape", () => {
  useFullscreenStore.setState({
    activeChartId: 99,
    forceLandscape: true,
  });
  useFullscreenStore.getState().exit();
  const s = useFullscreenStore.getState();
  expect(s.activeChartId).toBeNull();
  expect(s.forceLandscape).toBe(false);
});
