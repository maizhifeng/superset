/**
 * Metric values are shown at their original magnitude: no K/M/B/T scaling.
 * Whole numbers keep their integer form, fractional values round to one
 * decimal, and thousands separators keep long values readable.
 */
const DISPLAY_NUMBER_FORMAT = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  // `Intl` renders negative zero as "-0"; normalise it so the UI never shows a
  // signed zero.
  return DISPLAY_NUMBER_FORMAT.format(Object.is(value, -0) ? 0 : value);
}

export function formatPercentage(value: number, decimals = 1): string {
  return value.toFixed(decimals) + "%";
}

/** Format a percentage value that's in decimal form (0.853 → "85.3%") */
export function formatPctValue(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals) + "%";
}

/** Map of metric_name → d3format from dataset metadata */
export type MetricFormatMap = Record<string, string>;

/** Detect if a column name refers to a ratio/percentage metric */
export function isRatioMetric(
  key: string,
  formatMap?: MetricFormatMap,
): boolean {
  if (formatMap && formatMap[key]?.endsWith("%")) return true;
  return (
    /^(?:roi_|pay_rate_|retention_)/i.test(key) || /付费率|留存率/.test(key)
  );
}

/** Format a metric value by column name: ratios get ×100 + %, others use formatNumber */
export function formatMetricValue(
  key: string,
  value: unknown,
  formatMap?: MetricFormatMap,
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (isRatioMetric(key, formatMap)) return formatPctValue(value);
    return formatNumber(value);
  }
  return String(value);
}

export function formatBigInt(value: number): string {
  return formatNumber(value);
}
