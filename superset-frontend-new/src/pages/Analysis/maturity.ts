import dayjs from "dayjs";
import type { ChartDataRow } from "@/types/api";
import { ANALYSIS_TIME_COLUMN } from "./topics";
import type { AnalysisMetric } from "./types";

/** Values inside the metric's observation window are not comparable yet. */
export function isImmature(metric: AnalysisMetric, row: ChartDataRow): boolean {
  if (!metric.maturityDays) return false;
  const date = dayjs(row[ANALYSIS_TIME_COLUMN] ?? row.__timestamp);
  if (!date.isValid()) return false;
  return date.isAfter(
    dayjs().startOf("day").subtract(metric.maturityDays, "day"),
  );
}
