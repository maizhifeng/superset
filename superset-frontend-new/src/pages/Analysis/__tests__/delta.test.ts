import { test, expect } from "vitest";
import { deltaColor, metricDelta } from "@/pages/Analysis/delta";
import { getAnalysisTopic, topicMetric } from "@/pages/Analysis/topics";

const topic = getAnalysisTopic("cost")!;

test("rates compare in percentage points", () => {
  const metric = topicMetric(topic, "revenueRoi");
  const delta = metricDelta(metric, 1.5, 1.0);
  expect(delta).toEqual({ direction: "up", text: "+50.0pp" });
  expect(deltaColor(metric, "up")).toBe("success.main");
});

test("lower-is-better metrics turn red when they increase", () => {
  const metric = topicMetric(topic, "cpa");
  const delta = metricDelta(metric, 10, 8);
  expect(delta).toEqual({ direction: "up", text: "+25.0%" });
  expect(deltaColor(metric, "up")).toBe("error.main");
});

test("counts compare as relative change", () => {
  const metric = topicMetric(topic, "newUsers");
  const delta = metricDelta(metric, 120, 100);
  expect(delta).toEqual({ direction: "up", text: "+20.0%" });
  expect(deltaColor(metric, "up")).toBe("text.secondary");
});

test("zero or missing previous values cannot be compared", () => {
  const metric = topicMetric(topic, "cpa");
  expect(metricDelta(metric, 10, 0)).toBeNull();
  expect(metricDelta(metric, null, 8)).toBeNull();
});
