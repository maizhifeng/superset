function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  const abs = Math.abs(value);

  if (abs >= 1e12) return trimZeros((value / 1e12).toFixed(2)) + "T";
  if (abs >= 1e9) return trimZeros((value / 1e9).toFixed(2)) + "B";
  if (abs >= 1e6) return trimZeros((value / 1e6).toFixed(2)) + "M";
  if (abs >= 1e3) return trimZeros((value / 1e3).toFixed(2)) + "K";

  if (value === 0) return "0";

  return trimZeros(value.toFixed(2));
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
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString();
}
