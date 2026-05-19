import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { test, expect, beforeEach } from "vitest";

beforeEach(() => {
  useBreadcrumbStore.setState({ custom: null });
});

test("starts with null custom", () => {
  expect(useBreadcrumbStore.getState().custom).toBeNull();
});

test("setCustom stores a breadcrumb config", () => {
  useBreadcrumbStore.getState().setCustom({
    label: "My Dashboard",
    status: "published",
  });

  expect(useBreadcrumbStore.getState().custom).toEqual({
    label: "My Dashboard",
    status: "published",
  });
});

test("setCustom with null clears breadcrumb", () => {
  useBreadcrumbStore.getState().setCustom({ label: "Temp" });
  useBreadcrumbStore.getState().setCustom(null);

  expect(useBreadcrumbStore.getState().custom).toBeNull();
});

test("setCustom with actions stores actions", () => {
  const actions = "Edit Button" as unknown as React.ReactNode;
  useBreadcrumbStore.getState().setCustom({
    label: "Dashboard",
    actions,
  });

  expect(useBreadcrumbStore.getState().custom?.actions).toBe(actions);
});
