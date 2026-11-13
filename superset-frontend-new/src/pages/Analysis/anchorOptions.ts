import {
  ANCHORS,
  ANCHOR_LABELS,
  type AnchorKey,
} from "@/pages/Dashboard/compareStartDate";

/**
 * Anchor rounds and observation-window lengths for the project comparison.
 *
 * These are part of the analysis filter state: they are chosen in the page's
 * filter bar and persisted in the URL, then read by the comparison view.  The
 * module is neutral (it imports only the shared anchor definition) so both
 * `filters.ts` and `projectCompare.ts` can depend on it without a cycle.
 */
export { ANCHORS, ANCHOR_LABELS };
export type { AnchorKey };

/** Every anchor round in display order. */
export const PROJECT_COMPARE_ANCHORS: AnchorKey[] = ANCHORS.map(
  (anchor) => anchor.key,
);

/**
 * Default anchor selection: empty.  The comparison does not decide on its own
 * which round to measure — the user picks 基准 explicitly in the filter bar.
 */
export const DEFAULT_PROJECT_COMPARE_ANCHORS: AnchorKey[] = [];

/** Window lengths offered by the filter bar, in days. */
export const PROJECT_COMPARE_PERIOD_DAYS = [
  7, 14, 30, 60, 90, 180, 360,
] as const;

/** Default window length in days. */
export const DEFAULT_PROJECT_COMPARE_PERIOD_DAYS = 30;

export function isAnchorKey(value: unknown): value is AnchorKey {
  return (
    typeof value === "string" &&
    PROJECT_COMPARE_ANCHORS.includes(value as AnchorKey)
  );
}

/** A window length is valid when it is one of the offered options. */
export function isPeriodDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    (PROJECT_COMPARE_PERIOD_DAYS as readonly number[]).includes(value)
  );
}

/**
 * Normalize URL-provided anchor rounds: unknown values are dropped, duplicates
 * collapse and the result keeps the display order.  An empty list stays empty:
 * no round is compared until the user selects one.
 */
export function normalizeAnchors(values: readonly string[]): AnchorKey[] {
  const selected = new Set(values.filter(isAnchorKey));
  return PROJECT_COMPARE_ANCHORS.filter((key) => selected.has(key));
}

/** Same anchors in the same order (used to decide "is default"). */
export function sameAnchors(
  left: readonly AnchorKey[],
  right: readonly AnchorKey[],
): boolean {
  return (
    left.length === right.length &&
    left.every((key, index) => key === right[index])
  );
}
