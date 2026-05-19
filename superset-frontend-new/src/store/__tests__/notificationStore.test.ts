import { useNotificationStore } from "@/store/notificationStore";
import { test, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  useNotificationStore.setState({ notifications: [] });
  vi.useFakeTimers();
});

test("starts with empty notifications", () => {
  expect(useNotificationStore.getState().notifications).toEqual([]);
});

test("notify adds a notification", () => {
  useNotificationStore.getState().notify({
    severity: "success",
    message: "Operation completed",
  });

  const notifs = useNotificationStore.getState().notifications;
  expect(notifs).toHaveLength(1);
  expect(notifs[0].severity).toBe("success");
  expect(notifs[0].message).toBe("Operation completed");
  expect(notifs[0].id).toMatch(/^notif_\d+$/);
});

test("notify with action stores action", () => {
  const onClick = vi.fn();
  useNotificationStore.getState().notify({
    severity: "info",
    message: "Action needed",
    action: { label: "Undo", onClick },
  });

  const notif = useNotificationStore.getState().notifications[0];
  expect(notif.action).toBeDefined();
  expect(notif.action!.label).toBe("Undo");
});

test("dismiss removes notification by id", () => {
  useNotificationStore.getState().notify({ severity: "info", message: "Test" });
  const id = useNotificationStore.getState().notifications[0].id;

  useNotificationStore.getState().dismiss(id);

  expect(useNotificationStore.getState().notifications).toHaveLength(0);
});

test("notification auto-dismisses after 4 seconds", () => {
  useNotificationStore.getState().notify({
    severity: "warning",
    message: "Auto dismiss",
  });

  expect(useNotificationStore.getState().notifications).toHaveLength(1);

  vi.advanceTimersByTime(4000);

  expect(useNotificationStore.getState().notifications).toHaveLength(0);
});

test("multiple notifications are queued", () => {
  useNotificationStore
    .getState()
    .notify({ severity: "info", message: "First" });
  useNotificationStore
    .getState()
    .notify({ severity: "error", message: "Second" });

  expect(useNotificationStore.getState().notifications).toHaveLength(2);
});
