/**
 * LTV multiplier conversion helpers for the period comparison modal.
 *
 * LTV metrics (ltv_1, ltv_2, ... ltv_n) can be displayed as ratios:
 * - "first" mode: every LTV value divided by ltv_1
 * - "prev" mode: every LTV value divided by the previous day's value (ltv_{n-1})
 *
 * The conversion happens at render time so the underlying query rows keep
 * their raw values and switching modes never triggers a new query.
 */

export type LtvMode = "raw" | "first" | "prev";

const AGG_PREFIX_RE = /^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/;
const LTV_NAME_RE = /^ltv_(\d+)$/i;

/** Strip an aggregate prefix (e.g. "SUM(ltv_1)" → "ltv_1"). */
export function normalizedMetricName(name: string): string {
  const match = name.match(AGG_PREFIX_RE);
  return match ? match[2] : name;
}

/** Return the day index of an LTV metric (ltv_3 → 3), or null if not an LTV. */
export function parseLtvIndex(name: string): number | null {
  const match = normalizedMetricName(name).match(LTV_NAME_RE);
  return match ? Number(match[1]) : null;
}

/** Find the raw column key that holds the base LTV for the given mode. */
export function findLtvBaseColumn(
  columns: string[],
  name: string,
  mode: LtvMode,
): string | null {
  const idx = parseLtvIndex(name);
  if (idx == null || mode === "raw") return null;
  const targetIdx = mode === "first" ? 1 : idx - 1;
  if (targetIdx < 1) return null;
  const target = `ltv_${targetIdx}`;
  return columns.find((k) => normalizedMetricName(k) === target) ?? null;
}

/**
 * Format an LTV cell as a multiplier.
 *
 * Returns null when the cell should keep its raw formatting (non-LTV column
 * or "raw" mode), otherwise a formatted ratio string ("2.35"), "1.00" for
 * ltv_1 (its own base in "first" mode, no previous day in "prev" mode), or
 * "—" when the value/base is missing or the base is zero.
 */
export function formatLtvMultiplier(
  name: string,
  row: Record<string, unknown>,
  columns: string[],
  mode: LtvMode,
): string | null {
  if (mode === "raw") return null;
  const idx = parseLtvIndex(name);
  if (idx == null) return null;
  const value = row[name];
  const valueIsNum = typeof value === "number" && Number.isFinite(value);
  if (idx === 1) return valueIsNum ? "1.00" : "—";
  const baseKey = findLtvBaseColumn(columns, name, mode);
  if (baseKey == null) return "—";
  const base = row[baseKey];
  if (
    !valueIsNum ||
    typeof base !== "number" ||
    !Number.isFinite(base) ||
    base === 0
  ) {
    return "—";
  }
  return (value / base).toFixed(2);
}
