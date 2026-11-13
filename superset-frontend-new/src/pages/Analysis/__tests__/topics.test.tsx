import { test, expect } from "vitest";
import {
  ANALYSIS_DATASET_ID,
  ANALYSIS_TOPICS,
  breakdownMetrics,
  getAnalysisTopic,
  PAID_RETENTION_DAYS,
  PROJECT_COMPARE_METRIC_KEYS,
  topicMetric,
  totalsMetrics,
  trendMetrics,
} from "@/pages/Analysis/topics";

test("exposes the six agreed analysis topics with unique ids", () => {
  expect(ANALYSIS_TOPICS.map((topic) => topic.id)).toEqual([
    "cost",
    "project-compare",
    "retention",
    "ltv-roi",
    "payment",
    "channel",
  ]);
  expect(new Set(ANALYSIS_TOPICS.map((topic) => topic.id)).size).toBe(6);
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
      topic.defaultDimension === "日期" ||
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

test("backend-SQL topics while the rest stay on the legacy dataset", () => {
  const migrated = new Set(["cost", "project-compare"]);
  for (const id of migrated) {
    const topic = getAnalysisTopic(id)!;
    expect(topic.backendSql, id).toBe(true);
    expect(topic.status, id).toBeUndefined();
  }
  for (const topic of ANALYSIS_TOPICS.filter(
    (item) => !migrated.has(item.id),
  )) {
    expect(topic.backendSql, topic.id).toBeUndefined();
    expect(topic.status, topic.id).toBe("wip");
  }
});

test("project comparison owns the page: no KPI/trend/breakdown sections", () => {
  const topic = getAnalysisTopic("project-compare")!;
  expect(topic.hiddenFilters).toEqual(["games", "regions", "platforms"]);
  expect(topic.hiddenSections).toEqual(["kpis", "trend", "breakdown"]);
  expect(topic.extra?.type).toBe("project-compare");
  // A hidden-section topic must not silently request the shared section
  // queries, so its catalogs are empty and the extra view owns the metrics.
  expect(topic.kpis).toEqual([]);
  expect(topic.trend.series).toEqual([]);
  expect(topic.breakdown.metrics).toEqual([]);
  expect(topic.extra?.metrics).toEqual([...PROJECT_COMPARE_METRIC_KEYS]);
  for (const key of PROJECT_COMPARE_METRIC_KEYS) {
    expect(topic.metrics[key], key).toBeDefined();
  }
});

test("rate metrics declare the denominator used to re-aggregate buckets", () => {
  const topic = getAnalysisTopic("project-compare")!;
  for (const key of PROJECT_COMPARE_METRIC_KEYS) {
    const metric = topicMetric(topic, key);
    if (metric.format === "number") {
      expect(metric.bucketWeight, key).toBeUndefined();
      continue;
    }
    expect(metric.bucketWeight, key).toBeTruthy();
    // The weight must resolve to an additive volume metric in the same topic.
    const weight = topicMetric(topic, metric.bucketWeight!);
    expect(weight.format, `${key} weight`).toBe("number");
  }
});

test("only view-owning topics hide the standard sections", () => {
  for (const topic of ANALYSIS_TOPICS) {
    if (topic.id === "project-compare") continue;
    expect(topic.hiddenSections, topic.id).toBeUndefined();
    expect(topic.kpis.length, topic.id).toBeGreaterThan(0);
  }
});

test("legacy dataset id is still exported for the shared fallback", () => {
  expect(ANALYSIS_DATASET_ID).toBe(26);
});

test("unknown topic ids and metric keys are rejected", () => {
  expect(getAnalysisTopic("missing")).toBeNull();
  const cost = getAnalysisTopic("cost")!;
  expect(() => topicMetric(cost, "missing")).toThrow(
    "Unknown analysis metric: missing",
  );
});
