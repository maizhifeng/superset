import {
  applyDimensionDrill,
  enterDateDrill,
  nextDrillDimension,
  pivotDrillToTime,
} from "./drilldown";
import type { AnalysisFilters } from "./filters";
import {
  buildBreakdownQuery,
  buildDrillQueryPlan,
  buildTrendQueryPlan,
  fetchBreakdownData,
  fetchTrendData,
} from "./query";
import type { AnalysisTopic } from "./types";

/** Do not re-issue the same speculative request more than once per window. */
const PREFETCH_TTL_MS = 5 * 60_000;

const prefetched = new Map<string, number>();

/**
 * Warm the requests a date click will issue: the day's breakdown rows and the
 * rolling-baseline history used for root-cause attribution.
 *
 * Topic pages analyse historical data whose freshness requirements are low, so
 * a speculative request is safe: the response lands in the module-level cache
 * (and the backend Redis cache) and the click then paints without waiting for
 * the federated databases. The next click recomputes the query identity, so a
 * hovered-then-clicked date works even if the prefetch did not finish in time.
 */
export function prefetchDateDrill(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  date: string,
): void {
  if (!date) return;
  const target = enterDateDrill(topic, filters, date);
  const drillQuery = buildDrillQueryPlan(topic, target);
  if (!drillQuery) return;
  const queries = [drillQuery];

  const key = `${topic.id}:${JSON.stringify(queries)}`;
  const now = Date.now();
  const last = prefetched.get(key);
  if (last !== undefined && now - last < PREFETCH_TTL_MS) return;
  prefetched.set(key, now);

  for (const query of queries) {
    void fetchBreakdownData(query, { force: false }).catch(() => {
      // A failed prefetch must not affect the page; the click path retries.
      prefetched.delete(key);
    });
  }
}

/**
 * Warm the requests a table-row drill will issue: the next dimension's rows
 * plus the core query whose trend now follows the drilled scope.
 */
export function prefetchDimensionDrill(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  dimension: string,
  value: string,
): void {
  if (!value) return;
  const target = applyDimensionDrill(filters, topic, dimension, value);
  if (!target) return;
  const breakdownQuery = buildBreakdownQuery(topic, target);
  // A date drill keeps the core/trend chart out of view, so only the table
  // query is worth warming there.
  const trendPlan = target.focusDate ? null : buildTrendQueryPlan(topic, target);
  const key = `${topic.id}:${JSON.stringify([
    breakdownQuery,
    trendPlan?.trend ?? null,
    trendPlan?.previousTrend ?? null,
  ])}`;
  const now = Date.now();
  const last = prefetched.get(key);
  if (last !== undefined && now - last < PREFETCH_TTL_MS) return;
  prefetched.set(key, now);

  void fetchBreakdownData(breakdownQuery, { force: false }).catch(() => {
    prefetched.delete(key);
  });
  if (trendPlan) {
    void fetchTrendData(trendPlan, { force: false }).catch(() => {
      prefetched.delete(key);
    });
  }
}

/**
 * Warm only the next dimension's table rows. Starting this right after a
 * level renders makes the first drill click paint from cache; the trend slice
 * is left to the row-hover path so the table query is not competing with a
 * second speculative scan.
 */
export function prefetchDimensionBreakdown(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  dimension: string,
  value: string,
  depth = 2,
): void {
  if (!value || depth <= 0) return;
  const target = applyDimensionDrill(filters, topic, dimension, value);
  if (!target || target.focusDate) return;
  const query = buildBreakdownQuery(topic, target);
  const key = `${topic.id}:bd:${JSON.stringify(query)}`;
  const now = Date.now();
  const last = prefetched.get(key);
  if (last !== undefined && now - last < PREFETCH_TTL_MS) return;
  prefetched.set(key, now);

  void fetchBreakdownData(query, { force: false })
    .then((data) => {
      if (depth <= 1) return;
      // Speculatively warm one more level for the top row of the freshly
      // warmed table (the game → channel → media path users usually take).
      const nextDimension = nextDrillDimension(topic, target.dimension);
      const first = data.rows[0];
      const nextValue = first
        ? String(first[target.dimension] ?? "").trim()
        : "";
      if (nextDimension && nextValue && nextValue !== "–") {
        prefetchDimensionBreakdown(
          topic,
          target,
          target.dimension,
          nextValue,
          depth - 1,
        );
      }
    })
    .catch(() => {
      prefetched.delete(key);
    });
}

/**
 * Warm the view a single-day drill's row click opens: that category's
 * day-by-day table plus the trend slice filtered to it.
 */
export function prefetchTimeDrill(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  dimension: string,
  value: string,
): void {
  const target = pivotDrillToTime(filters, topic, dimension, value);
  if (!target) return;
  const breakdownQuery = buildBreakdownQuery(topic, target);
  const trendPlan = buildTrendQueryPlan(topic, target);
  const key = `${topic.id}:time:${JSON.stringify([
    breakdownQuery,
    trendPlan?.trend ?? null,
    trendPlan?.previousTrend ?? null,
  ])}`;
  const now = Date.now();
  const last = prefetched.get(key);
  if (last !== undefined && now - last < PREFETCH_TTL_MS) return;
  prefetched.set(key, now);

  void fetchBreakdownData(breakdownQuery, { force: false }).catch(() => {
    prefetched.delete(key);
  });
  if (trendPlan) {
    void fetchTrendData(trendPlan, { force: false }).catch(() => {
      prefetched.delete(key);
    });
  }
}

/** Test helper: forget prefetch bookkeeping. */
export function clearDrillPrefetchCache(): void {
  prefetched.clear();
}
