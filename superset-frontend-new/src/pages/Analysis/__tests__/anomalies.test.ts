import dayjs from "dayjs";
import { test, expect } from "vitest";
import { detectAnomalies } from "@/pages/Analysis/anomalies";
import { getAnalysisTopic, topicMetric } from "@/pages/Analysis/topics";

const cost = getAnalysisTopic("cost")!;
const retention = getAnalysisTopic("retention")!;

function dates(count: number, start = dayjs("2026-10-01")) {
  return Array.from({ length: count }, (_, index) =>
    start.add(index, "day").format("YYYY-MM-DD"),
  );
}

test("flags count spikes relative to the trailing baseline", () => {
  const values = [100, 100, 100, 100, 100, 100, 100, 200, 100];
  const anomalies = detectAnomalies(
    topicMetric(cost, "netSpend"),
    dates(values.length).map((date, index) => ({
      日期: date,
      返点后消耗: values[index],
    })),
  );
  expect(anomalies).toHaveLength(1);
  expect(anomalies[0].text).toContain("10-08");
  expect(anomalies[0].text).toContain("上升 100.0%");
  expect(anomalies[0].deltaText).toBe("100.0%");
});

test("flags rate spikes in percentage points", () => {
  const values = [1, 1, 1, 1, 1, 1, 1, 1.1, 1];
  const anomalies = detectAnomalies(
    topicMetric(cost, "revenueRoi"),
    dates(values.length).map((date, index) => ({
      日期: date,
      流水ROI: values[index],
    })),
  );
  expect(anomalies).toHaveLength(1);
  expect(anomalies[0].text).toContain("上升 10.0pp");
  expect(anomalies[0].deltaText).toBe("10.0pp");
});

test("negative movements use a lower threshold than positive ones", () => {
  const metric = topicMetric(cost, "revenueRoi");
  const makeRows = (last: number) =>
    dates(8).map((date, index) => ({
      日期: date,
      流水ROI: index === 7 ? last : 1,
    }));

  const negative = detectAnomalies(metric, makeRows(0.97));
  expect(negative).toHaveLength(1);
  expect(negative[0].severity).toBe("negative");
  expect(negative[0].direction).toBe("down");

  const positive = detectAnomalies(metric, makeRows(1.03));
  expect(positive).toHaveLength(0);
});

test("does not flag a sustained level shift on every day", () => {
  const values = [100, 100, 100, 100, 100, 100, 100, 200, 200, 200];
  const anomalies = detectAnomalies(
    topicMetric(cost, "netSpend"),
    dates(values.length).map((date, index) => ({
      日期: date,
      返点后消耗: values[index],
    })),
  );
  expect(anomalies).toHaveLength(1);
  expect(anomalies[0].text).toContain("10-08");
});

test("ignores immature points and short series", () => {
  const today = dayjs();
  const rows = Array.from({ length: 8 }, (_, index) => ({
    日期: today.subtract(7 - index, "day").format("YYYY-MM-DD"),
    "2日留存率": 0.2,
  }));
  expect(detectAnomalies(topicMetric(retention, "retention2"), rows)).toEqual(
    [],
  );
  expect(
    detectAnomalies(topicMetric(cost, "netSpend"), [
      { 日期: "2026-10-01", 返点后消耗: 100 },
    ]),
  ).toEqual([]);
});

/* ------------------------------------------------------------------------ */
/* Drill attribution                                                         */
/* ------------------------------------------------------------------------ */

import {
  detectDrillAnomalies,
  DRILL_BASELINE_LOOKBACK_DAYS,
} from "@/pages/Analysis/anomalies";

function drillRows(category: string, values: number[], start = dayjs("2026-10-01")) {
  return values.map((value, index) => ({
    渠道商: category,
    日期: start.add(index, "day").format("YYYY-MM-DD"),
    cpa: value,
  }));
}

test("attributes a whole-day anomaly to the categories that broke their baseline", () => {
  const metric = topicMetric(cost, "cpa"); // lower is better
  const rows = [
    ...drillRows("ios", [10, 10, 10, 10, 10, 10, 10, 20]),
    ...drillRows("android", [10, 10, 10, 10, 10, 10, 10, 10]),
  ];
  const hits = detectDrillAnomalies(metric, rows, "渠道商", "2026-10-08");
  const hit = hits.get("ios")!;
  expect(hit.significant).toBe(true);
  expect(hit.severity).toBe("negative");
  expect(hit.direction).toBe("up");
  expect(hit.deltaText).toBe("100.0%");
  expect(hit.baselineMean).toBe(10);
  expect(hit.baselineSamples).toBe(7);
  // The stable category is still scored so the page can rank contributions,
  // but it is not flagged as significant.
  expect(hits.get("android")?.significant).toBe(false);
});

test("marks a favourable drop for a lower-is-better metric", () => {
  const metric = topicMetric(cost, "cpa");
  const rows = drillRows("ios", [10, 10, 10, 10, 10, 10, 10, 0.1]);
  const hits = detectDrillAnomalies(metric, rows, "渠道商", "2026-10-08");
  expect(hits.get("ios")?.severity).toBe("positive");
  expect(hits.get("ios")?.direction).toBe("down");
});

test("scores the drilled day against the days before it", () => {
  const metric = topicMetric(cost, "cpa");
  const rows = drillRows("ios", [10, 10, 10, 10, 10, 10, 10, 20, 20]);
  // 10-09 is compared with 10-02…10-08 (which already contains the 10-08 spike),
  // so the move is smaller than the original departure and not significant.
  const hit = detectDrillAnomalies(metric, rows, "渠道商", "2026-10-09").get(
    "ios",
  );
  expect(hit?.deltaText).toBe("75.0%");
  expect(hit?.significant).toBe(false);
});

test("needs a full rolling window before it reports anything", () => {
  const metric = topicMetric(cost, "cpa");
  const rows = drillRows("ios", [10, 10, 20]);
  expect(detectDrillAnomalies(metric, rows, "渠道商", "2026-10-03").size).toBe(
    0,
  );
  expect(DRILL_BASELINE_LOOKBACK_DAYS).toBe(30);
});
