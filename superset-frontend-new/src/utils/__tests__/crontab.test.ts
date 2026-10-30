import { formatCrontabZh } from "@/utils/crontab";
import { test, expect } from "vitest";

test("formats daily schedules", () => {
  expect(formatCrontabZh("0 9 * * *")).toBe("每天 09:00");
  expect(formatCrontabZh("30 8 * * *")).toBe("每天 08:30");
});

test("formats weekly schedules", () => {
  expect(formatCrontabZh("0 8 * * 1")).toBe("每周一 08:00");
  expect(formatCrontabZh("0 8 * * 0")).toBe("每周日 08:00");
  expect(formatCrontabZh("0 8 * * 7")).toBe("每周日 08:00");
});

test("formats monthly schedules", () => {
  expect(formatCrontabZh("15 7 1 * *")).toBe("每月 1 日 07:15");
});
test("formats every-minute schedules", () => {
  expect(formatCrontabZh("* * * * *")).toBe("每分钟");
});

test("returns null for expressions needing a full descriptor", () => {
  expect(formatCrontabZh("0 8 * * 1-5")).toBeNull();
  expect(formatCrontabZh("*/5 * * * *")).toBeNull();
  expect(formatCrontabZh("0 25 * * *")).toBeNull();
  expect(formatCrontabZh("not a cron")).toBeNull();
  expect(formatCrontabZh(null)).toBeNull();
});
