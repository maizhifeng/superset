import { toNumber } from "./format";
import type { AnalysisMetric } from "./types";

export type DeltaDirection = "up" | "down" | "flat";

export interface MetricDelta {
  direction: DeltaDirection;
  text: string;
}

/**
 * Compare the current KPI with the previous equivalent period.
 *
 * Rates use percentage-point differences so "12.0% → 13.5%" reads as +1.5pp
 * rather than an ambiguous +12.5%.  Counts and unit values use relative change.
 */
export function metricDelta(
  metric: AnalysisMetric,
  currentValue: unknown,
  previousValue: unknown,
): MetricDelta | null {
  const current = toNumber(currentValue);
  const previous = toNumber(previousValue);
  if (current === null || previous === null) return null;

  if (metric.format === "percent") {
    const diff = (current - previous) * 100;
    if (Math.abs(diff) < 0.05) {
      return { direction: "flat", text: "0.0pp" };
    }
    return {
      direction: diff > 0 ? "up" : "down",
      text: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp`,
    };
  }

  if (previous === 0) return null;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(change)) return null;
  if (Math.abs(change) < 0.05) {
    return { direction: "flat", text: "0.0%" };
  }
  return {
    direction: change > 0 ? "up" : "down",
    text: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
  };
}

/** Semantic colour for a KPI delta, honouring whether higher is better. */
export function deltaColor(
  metric: AnalysisMetric,
  direction: DeltaDirection,
): string {
  if (direction === "flat" || metric.higherIsBetter === undefined) {
    return "text.secondary";
  }
  const isPositive = metric.higherIsBetter
    ? direction === "up"
    : direction === "down";
  return isPositive ? "success.main" : "error.main";
}
