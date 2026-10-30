import dayjs from "dayjs";
import { test, expect } from "vitest";
import { isImmature } from "@/pages/Analysis/maturity";
import { getAnalysisTopic, topicMetric } from "@/pages/Analysis/topics";

test("marks retention values inside the observation window as immature", () => {
  const topic = getAnalysisTopic("retention")!;
  const metric = topicMetric(topic, "paidRetention7");
  expect(
    isImmature(metric, {
      日期: dayjs().format("YYYY-MM-DD"),
    }),
  ).toBe(true);
  expect(
    isImmature(metric, {
      日期: dayjs().subtract(8, "day").format("YYYY-MM-DD"),
    }),
  ).toBe(false);
});

test("additive metrics are never treated as immature", () => {
  const topic = getAnalysisTopic("retention")!;
  expect(
    isImmature(topicMetric(topic, "newUsers"), {
      日期: dayjs().format("YYYY-MM-DD"),
    }),
  ).toBe(false);
});
