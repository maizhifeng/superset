import { expect, test } from "vitest";
import { formatFullDay } from "@/pages/Analysis/format";

test("formats ISO datetime strings", () => {
  expect(formatFullDay("2026-10-11T00:00:00")).toBe("2026-10-11");
  expect(formatFullDay("2026-10-11")).toBe("2026-10-11");
});

test("formats epoch milliseconds from older payloads", () => {
  const epoch = +new Date(2026, 9, 11); // local midnight 2026-10-11
  expect(formatFullDay(epoch)).toBe("2026-10-11");
  expect(formatFullDay(String(epoch))).toBe("2026-10-11");
});

test("falls back to the raw value for unrecognised input", () => {
  expect(formatFullDay("not-a-date")).toBe("not-a-date");
  expect(formatFullDay(null)).toBe("");
});
