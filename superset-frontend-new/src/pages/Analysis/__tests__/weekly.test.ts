import dayjs from "dayjs";
import { test, expect } from "vitest";
import {
  aggregateBucketMetric,
  groupRowsByWeek,
  weekStartOf,
} from "@/pages/Analysis/weekly";
import type { AnalysisMetric } from "@/pages/Analysis/types";

const rateMetric: AnalysisMetric = {
  key: "rate",
  label: "RATE",
  metric: "rate",
  format: "percent",
  higherIsBetter: true,
};

const countMetric: AnalysisMetric = {
  key: "count",
  label: "COUNT",
  metric: "count",
  format: "number",
};

function row(date: string, values: Record<string, number>) {
  return { 日期: date, ...values };
}

test("weeks run Sunday through Saturday", () => {
  // 2026-10-04 is a Sunday, 2026-10-10 the following Saturday.
  expect(weekStartOf(row("2026-10-04", {}))).toBe("2026-10-04");
  expect(weekStartOf(row("2026-10-07", {}))).toBe("2026-10-04");
  expect(weekStartOf(row("2026-10-10", {}))).toBe("2026-10-04");
  expect(weekStartOf(row("2026-10-11", {}))).toBe("2026-10-11");
  expect(weekStartOf({ 日期: "not-a-date" })).toBeNull();
});

test("groups daily rows into ordered Sunday–Saturday buckets", () => {
  const rows = [
    row("2026-10-11", { count: 3 }),
    row("2026-10-04", { count: 1 }),
    row("2026-10-10", { count: 2 }),
    row("2026-10-07", { count: 5 }),
  ];
  const buckets = groupRowsByWeek(rows);
  expect(buckets).toHaveLength(2);
  expect(buckets[0].start).toBe("2026-10-04");
  expect(buckets[0].end).toBe("2026-10-10");
  expect(buckets[0].label).toBe("10-04 ~ 10-10");
  expect(buckets[0].rows).toHaveLength(3);
  expect(buckets[1].start).toBe("2026-10-11");
});

test("sums additive metrics inside a bucket", () => {
  const rows = [
    row("2026-10-04", { count: 10 }),
    row("2026-10-05", { count: 5 }),
    row("2026-10-06", { count: null as unknown as number }),
  ];
  expect(aggregateBucketMetric(countMetric, rows)).toBe(15);
});

test("weights rate metrics by their denominator volume", () => {
  // 10% of 10 users and 30% of 30 users → 25% for the week, not 20%.
  const rows = [
    row("2026-10-04", { rate: 0.1, users: 10 }),
    row("2026-10-05", { rate: 0.3, users: 30 }),
  ];
  expect(aggregateBucketMetric(rateMetric, rows, "users")).toBeCloseTo(0.25);
});

test("falls back to a plain mean without a weight column", () => {
  const rows = [
    row("2026-10-04", { rate: 0.1 }),
    row("2026-10-05", { rate: 0.3 }),
  ];
  expect(aggregateBucketMetric(rateMetric, rows)).toBeCloseTo(0.2);
});

test("skips immature points when aggregating", () => {
  const matureMetric: AnalysisMetric = {
    ...rateMetric,
    maturityDays: 30,
  };
  const today = dayjs();
  const rows = [
    row(today.subtract(40, "day").format("YYYY-MM-DD"), { rate: 0.2 }),
    row(today.subtract(1, "day").format("YYYY-MM-DD"), { rate: 0.9 }),
  ];
  expect(aggregateBucketMetric(matureMetric, rows)).toBeCloseTo(0.2);
});
