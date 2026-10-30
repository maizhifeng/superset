import dayjs, { type Dayjs } from "dayjs";
import type { ChartDataRow } from "@/types/api";
import { toNumber } from "./format";
import { isImmature } from "./maturity";
import { ANALYSIS_TIME_COLUMN } from "./topics";
import type { AnalysisMetric } from "./types";

/** A Sunday–Saturday bucket used by the weekly trend view. */
export interface WeeklyBucket {
  /** Sunday of the bucket (YYYY-MM-DD). */
  start: string;
  /** Saturday of the bucket (YYYY-MM-DD). */
  end: string;
  /** Axis label, e.g. `10-05 ~ 10-11`. */
  label: string;
  rows: ChartDataRow[];
}

/** Calendar rules follow the local business week: 周日–周六. */
const WEEK_START_DAY = 0;
const DAYS_PER_WEEK = 7;

function rowDay(row: ChartDataRow): Dayjs | null {
  const raw = row[ANALYSIS_TIME_COLUMN] ?? row.__timestamp;
  const date = dayjs(
    typeof raw === "number" || typeof raw === "string" ? raw : undefined,
  );
  return date.isValid() ? date.startOf("day") : null;
}

/** First day (Sunday) of the business week that contains the row's date. */
export function weekStartOf(row: ChartDataRow): string | null {
  const day = rowDay(row);
  if (!day) return null;
  return day.subtract((day.day() - WEEK_START_DAY + DAYS_PER_WEEK) % DAYS_PER_WEEK, "day").format("YYYY-MM-DD");
}

/** Group daily rows into ordered Sunday–Saturday buckets. */
export function groupRowsByWeek(rows: ChartDataRow[]): WeeklyBucket[] {
  const buckets = new Map<string, WeeklyBucket>();
  for (const row of rows) {
    const start = weekStartOf(row);
    if (!start) continue;
    let bucket = buckets.get(start);
    if (!bucket) {
      const startDay = dayjs(start);
      bucket = {
        start,
        end: startDay.add(DAYS_PER_WEEK - 1, "day").format("YYYY-MM-DD"),
        label: `${startDay.format("MM-DD")} ~ ${startDay
          .add(DAYS_PER_WEEK - 1, "day")
          .format("MM-DD")}`,
        rows: [],
      };
      buckets.set(start, bucket);
    }
    bucket.rows.push(row);
  }
  return [...buckets.values()].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
}

/** Sum an additive metric inside one bucket; `null` when every point is empty. */
function sumMetric(metric: AnalysisMetric, bucketRows: ChartDataRow[]): number | null {
  let total: number | null = null;
  for (const row of bucketRows) {
    if (isImmature(metric, row)) continue;
    const value = toNumber(row[metric.key]);
    if (value === null) continue;
    total = (total ?? 0) + value;
  }
  return total;
}

/**
 * Aggregate one metric inside a bucket.
 *
 * Additive metrics are summed. Rate metrics are weighted by the series'
 * denominator volume (``weightKey``) so a week's CPA/ROI equals the ratio of
 * the weekly sums rather than the mean of daily ratios; falling back to a plain
 * mean when the weight column is unavailable.
 */
export function aggregateBucketMetric(
  metric: AnalysisMetric,
  bucketRows: ChartDataRow[],
  weightKey?: string | null,
): number | null {
  if (metric.format === "number") {
    return sumMetric(metric, bucketRows);
  }

  const points: { value: number; weight: number | null }[] = [];
  for (const row of bucketRows) {
    if (isImmature(metric, row)) continue;
    const value = toNumber(row[metric.key]);
    if (value === null) continue;
    points.push({
      value,
      weight: weightKey ? toNumber(row[weightKey]) : null,
    });
  }
  if (points.length === 0) return null;

  const weighted = points.filter(
    (point): point is { value: number; weight: number } =>
      point.weight !== null && point.weight !== 0,
  );
  if (weighted.length > 0) {
    const denominator = weighted.reduce((sum, point) => sum + point.weight, 0);
    if (denominator !== 0) {
      return (
        weighted.reduce((sum, point) => sum + point.value * point.weight, 0) /
        denominator
      );
    }
  }
  return (
    points.reduce((sum, point) => sum + point.value, 0) / points.length
  );
}
