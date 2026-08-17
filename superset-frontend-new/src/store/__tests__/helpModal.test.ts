import { test, expect, beforeEach } from "vitest";
import { useHelpModalStore } from "@/store/helpModal";

beforeEach(() => {
  useHelpModalStore.setState({ open: false });
});

test("initial state is closed", () => {
  expect(useHelpModalStore.getState().open).toBe(false);
});

test("openHelp and closeHelp toggle the flag", () => {
  useHelpModalStore.getState().openHelp();
  expect(useHelpModalStore.getState().open).toBe(true);
  useHelpModalStore.getState().closeHelp();
  expect(useHelpModalStore.getState().open).toBe(false);
});

test("toggleHelp flips the flag", () => {
  useHelpModalStore.getState().toggleHelp();
  expect(useHelpModalStore.getState().open).toBe(true);
  useHelpModalStore.getState().toggleHelp();
  expect(useHelpModalStore.getState().open).toBe(false);
});
