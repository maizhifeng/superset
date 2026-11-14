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
  return formatNumber(parsed);
}

/** Axis tick text; percentages keep the metric's decimals, magnitudes stay raw. */
export function formatAxisValue(metric: AnalysisMetric, value: number): string {
  if (metric.format === "percent") {
    return formatPctValue(value, metric.decimals ?? 0);
  }
  return formatNumber(value);
}

export function formatFullDay(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Older payloads/caches serialized DATE columns as epoch milliseconds
  // (``1791676800000``).  A numeric string would otherwise fail to parse and
  // leak the raw number into the date column.
  const numericEpoch =
    typeof value === "number" ||
    (typeof value === "string" && /^\d{10,13}$/.test(value));
  const parsed = dayjs(
    numericEpoch
      ? Number(value)
      : typeof value === "string"
        ? value
        : undefined,
  );
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : String(value);
}
