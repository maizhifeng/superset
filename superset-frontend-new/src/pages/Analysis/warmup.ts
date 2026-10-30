import { defaultFilters, type RangeValue } from "./filters";
import {
  buildBreakdownQuery,
  buildKpiQueryPlan,
  buildTrendQueryPlan,
  fetchBreakdownData,
  fetchKpiData,
  fetchTrendData,
  peekBreakdownData,
  peekKpiData,
  peekTrendData,
} from "./query";
import { saveAnalysisSnapshot } from "./snapshot";
import { ANALYSIS_TOPICS } from "./topics";
import type { AnalysisTopic } from "./types";

/** Ranges warmed on the hub; other ranges are warmed on the topic page. */
const DEFAULT_WARM_RANGES: RangeValue[] = ["30d"];
const WARM_SESSION_KEY = "analysis-cache-warm-at";
/** Skip a repeated warmup within this window (cache TTL is 30 minutes). */
const WARM_COOLDOWN_MS = 30 * 60_000;

export interface AnalysisWarmupFetchers {
  kpi: typeof fetchKpiData;
  trend: typeof fetchTrendData;
  breakdown: typeof fetchBreakdownData;
}

const defaultFetchers: AnalysisWarmupFetchers = {
  kpi: fetchKpiData,
  trend: fetchTrendData,
  breakdown: fetchBreakdownData,
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Warm the shared response caches for common topic/range combinations.
 *
 * These topic views are historical and slowly changing, so pre-computing the
 * default 30-day plans after a visit makes the first screen fast for everyone
 * (the browser cache is local, the real win is the backend Redis cache).
 */
export async function warmAnalysisCaches(options?: {
  topics?: AnalysisTopic[];
  ranges?: RangeValue[];
  /** Gap between topics to avoid a burst of remote queries. */
  gapMs?: number;
  signal?: AbortSignal;
  fetchers?: AnalysisWarmupFetchers;
}): Promise<{ warmed: number; skipped: number }> {
  const topics = options?.topics ?? ANALYSIS_TOPICS;
  const ranges = options?.ranges ?? DEFAULT_WARM_RANGES;
  const gapMs = options?.gapMs ?? 800;
  const signal = options?.signal;
  const fetchers = options?.fetchers ?? defaultFetchers;
  let warmed = 0;
  let skipped = 0;

  for (const topic of topics) {
    for (const range of ranges) {
      if (signal?.aborted) return { warmed, skipped };
      const filters = { ...defaultFilters(topic), range };
      const kpiPlan = buildKpiQueryPlan(topic, filters);
      const trendPlan = buildTrendQueryPlan(topic, filters);
      const breakdownQuery = buildBreakdownQuery(topic, filters);
      const tasks: Promise<unknown>[] = [];
      if (peekKpiData(kpiPlan, { allowStale: false }) === undefined) {
        tasks.push(fetchers.kpi(kpiPlan, { force: false }));
      }
      if (peekTrendData(trendPlan, { allowStale: false }) === undefined) {
        tasks.push(fetchers.trend(trendPlan, { force: false }));
      }
      if (
        peekBreakdownData(breakdownQuery, { allowStale: false }) === undefined
      ) {
        tasks.push(fetchers.breakdown(breakdownQuery, { force: false }));
      }

      if (tasks.length === 0) {
        skipped += 1;
      } else {
        await Promise.allSettled(tasks);
        warmed += 1;
        await sleep(gapMs, signal);
      }

      // The default 30-day view is also the persisted snapshot scope: after
      // warming the query caches, store the same payload so later visitors
      // can render without any federated queries.
      if (range === "30d") {
        const kpi = peekKpiData(kpiPlan, { allowStale: false });
        const trend = peekTrendData(trendPlan, { allowStale: false });
        const breakdown = peekBreakdownData(breakdownQuery, {
          allowStale: false,
        });
        if (kpi && trend && breakdown) {
          await saveAnalysisSnapshot(topic, filters, {
            totals: kpi.totals,
            previous: kpi.previous,
            trend: trend.trend,
            previousTrend: trend.previousTrend,
            breakdown,
          });
        }
      }
    }
  }
  return { warmed, skipped };
}

/**
 * Schedule a background warmup once per browser session (30-minute cooldown).
 * The hub calls this after it renders, so opening 专题分析 quietly prepares the
 * default views for later visitors without blocking the current page.
 */
export function scheduleAnalysisCacheWarmup(options?: {
  force?: boolean;
  ranges?: RangeValue[];
  gapMs?: number;
}): void {
  if (typeof window === "undefined") return;
  if (!options?.force) {
    try {
      const last = Number(window.sessionStorage.getItem(WARM_SESSION_KEY));
      if (Number.isFinite(last) && Date.now() - last < WARM_COOLDOWN_MS) {
        return;
      }
      window.sessionStorage.setItem(WARM_SESSION_KEY, String(Date.now()));
    } catch {
      // Private mode / storage disabled: warm anyway.
    }
  }
  const run = () => {
    void warmAnalysisCaches({
      ranges: options?.ranges,
      gapMs: options?.gapMs,
    });
  };
  const win = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      opts?: { timeout: number },
    ) => number;
  };
  if (typeof win.requestIdleCallback === "function") {
    win.requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 3000);
  }
}
