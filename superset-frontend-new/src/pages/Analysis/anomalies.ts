import dayjs from "dayjs";
import type { ChartDataRow } from "@/types/api";
import { formatFullDay, toNumber } from "./format";
import { isImmature } from "./maturity";
import { ANALYSIS_TIME_COLUMN } from "./topics";
import type { AnalysisMetric } from "./types";

/** Points are compared with the preceding rolling window. */
const BASELINE_WINDOW = 7;
const MIN_BASELINE_POINTS = 4;
/** A z-score-style multiplier for the local standard deviation. */
const DEVIATION_FACTOR = 2.5;
/** Floors that keep tiny fluctuations from being labelled as anomalies. */
const NEGATIVE_PERCENT_POINT_FLOOR = 2;
const POSITIVE_PERCENT_POINT_FLOOR = 5;
const NEUTRAL_PERCENT_POINT_FLOOR = 3;
const NEGATIVE_RELATIVE_FLOOR_PCT = 20;
const POSITIVE_RELATIVE_FLOOR_PCT = 40;
const NEUTRAL_RELATIVE_FLOOR_PCT = 30;

/** How much history the drill attribution fetches per dimension value. */
export const DRILL_BASELINE_LOOKBACK_DAYS = 30;

export type AnomalySeverity = "negative" | "positive" | "neutral";

export interface AnalysisAnomaly {
  index: number;
  date: string;
  value: number;
  direction: "up" | "down";
  severity: AnomalySeverity;
  /** Absolute deviation from the rolling baseline, e.g. `36.2%` or `2.5pp`. */
  deltaText: string;
  /** Signed deviation used to rank root-cause candidates (percent or pp). */
  deltaValue: number;
  /** Full sentence used by tooltips and the expanded anomaly list. */
  text: string;
}

/** A day's score for one dimension value in the drill attribution. */
export interface DrillAnomaly extends AnalysisAnomaly {
  /** Whether the deviation also clears the statistical threshold. */
  significant: boolean;
  /** Mean of the rolling baseline window. */
  baselineMean: number;
  /** Non-empty baseline points behind the verdict. */
  baselineSamples: number;
}

function severityOf(
  metric: AnalysisMetric,
  direction: "up" | "down",
): AnomalySeverity {
  if (metric.higherIsBetter === undefined) return "neutral";
  if (metric.higherIsBetter) {
    return direction === "down" ? "negative" : "positive";
  }
  return direction === "up" ? "negative" : "positive";
}

interface DeviationEvaluation {
  mean: number;
  deviation: number;
  direction: "up" | "down";
  severity: AnomalySeverity;
  /** Absolute deviation, in percent or percentage points. */
  deltaValue: number;
  deltaText: string;
  threshold: number;
  significant: boolean;
}

/**
 * Score one point against its rolling baseline.
 *
 * Shared by the trend-chart detector and the drill attribution so both agree on
 * what counts as an anomaly (same floors, same 2.5σ multiplier).
 */
function evaluateDeviation(
  metric: AnalysisMetric,
  current: number,
  baseline: number[],
): DeviationEvaluation | null {
  if (baseline.length < MIN_BASELINE_POINTS) return null;
  const mean = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
  const variance =
    baseline.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    baseline.length;
  const deviation = Math.sqrt(variance);

  let deltaValue: number;
  let deltaText: string;
  let direction: "up" | "down";
  if (metric.format === "percent") {
    deltaValue = (current - mean) * 100;
    direction = deltaValue >= 0 ? "up" : "down";
    deltaText = `${Math.abs(deltaValue).toFixed(1)}pp`;
  } else {
    if (mean === 0) return null;
    deltaValue = ((current - mean) / Math.abs(mean)) * 100;
    direction = deltaValue >= 0 ? "up" : "down";
    deltaText = `${Math.abs(deltaValue).toFixed(1)}%`;
  }

  const severity = severityOf(metric, direction);
  const floor =
    metric.format === "percent"
      ? severity === "negative"
        ? NEGATIVE_PERCENT_POINT_FLOOR
        : severity === "positive"
          ? POSITIVE_PERCENT_POINT_FLOOR
          : NEUTRAL_PERCENT_POINT_FLOOR
      : severity === "negative"
        ? NEGATIVE_RELATIVE_FLOOR_PCT
        : severity === "positive"
          ? POSITIVE_RELATIVE_FLOOR_PCT
          : NEUTRAL_RELATIVE_FLOOR_PCT;
  const threshold = Math.max(
    floor,
    metric.format === "percent"
      ? DEVIATION_FACTOR * deviation * 100
      : (DEVIATION_FACTOR * deviation * 100) / Math.abs(mean),
  );

  return {
    mean,
    deviation,
    direction,
    severity,
    deltaValue: Math.abs(deltaValue),
    deltaText,
    threshold,
    significant: Math.abs(deltaValue) >= threshold,
  };
}

/**
 * Detect spikes/drops relative to the trailing rolling mean instead of the
 * whole previous period.  A sustained level shift should not mark every day
 * as abnormal; only the first departure from the local baseline should.
 */
export function detectAnomalies(
  metric: AnalysisMetric,
  rows: ChartDataRow[],
): AnalysisAnomaly[] {
  const values = rows.map((row) => {
    if (isImmature(metric, row)) return null;
    return toNumber(row[metric.key]);
  });
  const anomalies: AnalysisAnomaly[] = [];

  for (let index = BASELINE_WINDOW; index < rows.length; index += 1) {
    const current = values[index];
    if (current === null) continue;

    const baseline = values
      .slice(index - BASELINE_WINDOW, index)
      .filter((value): value is number => value !== null);
    const evaluation = evaluateDeviation(metric, current, baseline);
    if (!evaluation?.significant) continue;

    const date = dayjs(
      rows[index][ANALYSIS_TIME_COLUMN] ?? rows[index].__timestamp,
    );
    const dateLabel = date.isValid()
      ? date.format("MM-DD")
      : formatFullDay(
          rows[index][ANALYSIS_TIME_COLUMN] ?? rows[index].__timestamp,
        ).slice(5);

    anomalies.push({
      index,
      date: dateLabel,
      value: current,
      direction: evaluation.direction,
      severity: evaluation.severity,
      deltaText: evaluation.deltaText,
      deltaValue: evaluation.deltaValue,
      text: `${dateLabel} ${metric.label}较7日移动平均${
        evaluation.direction === "up" ? "上升" : "下降"
      } ${evaluation.deltaText}`,
    });
  }

  return anomalies;
}

function rowDate(row: ChartDataRow): dayjs.Dayjs | null {
  const raw = row[ANALYSIS_TIME_COLUMN] ?? row.__timestamp;
  const date = dayjs(
    typeof raw === "number" || typeof raw === "string" ? raw : undefined,
  );
  return date.isValid() ? date : null;
}

/**
 * Attribute a day's anomaly to individual dimension values.
 *
 * The drill chart shows one day across a dimension, so the root cause has to be
 * recovered from history: every category is compared with its own trailing
 * rolling baseline (the same scorer the trend chart uses).  All categories with
 * enough history are returned — ``significant`` marks the ones that clear the
 * statistical threshold, while the rest still carry their deviation so the page
 * can rank likely contributors when nothing is statistically extreme.
 */
export function detectDrillAnomalies(
  metric: AnalysisMetric,
  rows: ChartDataRow[],
  dimension: string,
  focusDate: string,
): Map<string, DrillAnomaly> {
  const target = dayjs(focusDate);
  const results = new Map<string, DrillAnomaly>();
  if (!target.isValid() || rows.length === 0) return results;
  const targetKey = target.format("YYYY-MM-DD");
  const targetLabel = target.format("MM-DD");

  const byCategory = new Map<string, Map<string, ChartDataRow>>();
  for (const row of rows) {
    const date = rowDate(row);
    if (!date) continue;
    const key = date.format("YYYY-MM-DD");
    if (key > targetKey) continue;
    const category = String(row[dimension] ?? "").trim();
    if (!category || category === "–") continue;
    let byDate = byCategory.get(category);
    if (!byDate) {
      byDate = new Map<string, ChartDataRow>();
      byCategory.set(category, byDate);
    }
    byDate.set(key, row);
  }

  for (const [category, byDate] of byCategory) {
    const currentRow = byDate.get(targetKey);
    if (!currentRow || isImmature(metric, currentRow)) continue;
    const current = toNumber(currentRow[metric.key]);
    if (current === null) continue;

    const baseline = [...byDate.entries()]
      .filter(([key, row]) => key < targetKey && !isImmature(metric, row))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-BASELINE_WINDOW)
      .map(([, row]) => toNumber(row[metric.key]))
      .filter((value): value is number => value !== null);
    const evaluation = evaluateDeviation(metric, current, baseline);
    if (!evaluation) continue;

    results.set(category, {
      index: 0,
      date: targetLabel,
      value: current,
      direction: evaluation.direction,
      severity: evaluation.severity,
      deltaText: evaluation.deltaText,
      deltaValue: evaluation.deltaValue,
      text: `${targetLabel} ${metric.label}较7日移动平均${
        evaluation.direction === "up" ? "上升" : "下降"
      } ${evaluation.deltaText}`,
      significant: evaluation.significant,
      baselineMean: evaluation.mean,
      baselineSamples: baseline.length,
    });
  }

  return results;
}
