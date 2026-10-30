import dayjs from "dayjs";
import { formatNumber, formatPctValue } from "@/utils/formatNumber";
import type { AnalysisMetric } from "./types";

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Format a value according to the metric definition; missing values read `–`. */
export function formatMetricValue(
  metric: AnalysisMetric,
  value: unknown,
): string {
  const parsed = toNumber(value);
  if (parsed === null) return "–";
  if (metric.format === "percent") {
    return formatPctValue(parsed, metric.decimals ?? 1);
  }
  if (metric.format === "decimal") {
    return parsed.toLocaleString("zh-CN", {
      maximumFractionDigits: metric.decimals ?? 2,
      minimumFractionDigits: 0,
    });
  }
  return formatNumber(parsed);
}

/**
 * Gridline labels need far less precision than KPI values: `528.26K` reads as
 * noise on an axis, so counts keep at most one decimal and drop trailing
 * zeros (`528K`, `1.03M`).
 */
function formatAxisCount(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1e3) {
    return formatNumber(value);
  }
  const scaled =
    abs >= 1e12
      ? value / 1e12
      : abs >= 1e9
        ? value / 1e9
        : abs >= 1e6
          ? value / 1e6
          : value / 1e3;
  const suffix =
    abs >= 1e12 ? "T" : abs >= 1e9 ? "B" : abs >= 1e6 ? "M" : "K";
  const scaledAbs = Math.abs(scaled);
  const decimals = scaledAbs >= 100 ? 0 : scaledAbs >= 10 ? 1 : 2;
  return `${Number(scaled.toFixed(decimals))}${suffix}`;
}

/** Compact axis tick text; percent axes keep the metric's decimals. */
export function formatAxisValue(metric: AnalysisMetric, value: number): string {
  if (metric.format === "percent") {
    return formatPctValue(value, metric.decimals ?? 0);
  }
  if (metric.format === "decimal") {
    return formatNumber(value);
  }
  return formatAxisCount(value);
}

export function formatFullDay(value: unknown): string {
  if (value === null || value === undefined) return "";
  const parsed = dayjs(
    typeof value === "number" || typeof value === "string" ? value : undefined,
  );
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : String(value);
}
