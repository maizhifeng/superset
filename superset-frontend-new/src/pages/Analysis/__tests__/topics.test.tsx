import { test, expect } from "vitest";
import {
  ANALYSIS_TOPICS,
  breakdownMetrics,
  getAnalysisTopic,
  PAID_RETENTION_DAYS,
  topicMetric,
  totalsMetrics,
  trendMetrics,
} from "@/pages/Analysis/topics";

test("exposes the five agreed analysis topics with unique ids", () => {
  expect(ANALYSIS_TOPICS.map((topic) => topic.id)).toEqual([
    "cost",
    "retention",
    "ltv-roi",
    "payment",
    "channel",
  ]);
  expect(new Set(ANALYSIS_TOPICS.map((topic) => topic.id)).size).toBe(5);
});

test("every configured metric key resolves in its topic catalog", () => {
  for (const topic of ANALYSIS_TOPICS) {
    for (const key of topic.kpis) {
      expect(topic.metrics[key], `${topic.id} kpi ${key}`).toBeDefined();
    }
    for (const series of topic.trend.series) {
      expect(
        topic.metrics[series.metric],
        `${topic.id} trend ${series.metric}`,
      ).toBeDefined();
    }
    for (const key of topic.breakdown.metrics) {
      expect(topic.metrics[key], `${topic.id} breakdown ${key}`).toBeDefined();
    }
    expect(
      topic.dimensions.some((item) => item.key === topic.defaultDimension),
    ).toBe(true);
    expect(topic.metrics[topic.breakdown.orderBy]).toBeDefined();
  }
});

test("query metric lists are deduped by response field", () => {
  for (const topic of ANALYSIS_TOPICS) {
    for (const metrics of [
      totalsMetrics(topic),
      trendMetrics(topic),
      breakdownMetrics(topic),
    ]) {
      const keys = metrics.map((metric) => metric.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  }
});

test("trend metric list includes denominators used by weekly weighting", () => {
  const cost = getAnalysisTopic("cost")!;
  const keys = trendMetrics(cost).map((metric) => metric.key);
  // CPA is weighted by new users so a weekly rate equals the weekly ratio.
  expect(keys).toContain("新增进入");
  const retention = getAnalysisTopic("retention")!;
  expect(trendMetrics(retention).map((metric) => metric.key)).toContain(
    "1日付费数",
  );
});

test("retention topic covers every paid-retention milestone", () => {
  const retention = getAnalysisTopic("retention")!;
  for (const day of PAID_RETENTION_DAYS) {
    expect(() => topicMetric(retention, `${day}日付费留存率`)).not.toThrow();
  }
});

test("unknown topic ids and metric keys are rejected", () => {
  expect(getAnalysisTopic("missing")).toBeNull();
  const cost = getAnalysisTopic("cost")!;
  expect(() => topicMetric(cost, "missing")).toThrow(
    "Unknown analysis metric: missing",
  );
});
