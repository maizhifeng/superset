import { useCallback, useEffect, useRef, useState } from "react";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { AnalysisFilters } from "../filters";
import {
  buildBreakdownQuery,
  buildCoreQueryPlan,
  buildKpiQueryPlan,
  buildTrendQueryPlan,
  emptyBreakdownData,
  emptyCoreData,
  emptyKpiData,
  emptyTrendData,
  fetchBreakdownData,
  fetchCoreData,
  fetchKpiData,
  fetchTrendData,
  peekBreakdownData,
  peekCoreData,
  peekKpiData,
  peekTrendData,
  type AnalysisCoreData,
  type AnalysisKpiData,
  type AnalysisSectionData,
  type AnalysisTrendData,
} from "../query";
import type { AnalysisTopic } from "../types";

const DEBOUNCE_MS = 120;

function coreFilterKey(filters: AnalysisFilters): string {
  return JSON.stringify({
    range: filters.range,
    start: filters.start,
    end: filters.end,
    focusWeek: filters.focusWeek,
    games: filters.games,
    regions: filters.regions,
    media: filters.media,
    channels: filters.channels,
    platforms: filters.platforms,
    // Table drills narrow the trend series, so they must refetch the core too.
    drill: filters.drill,
    includeNatural: filters.includeNatural,
  });
}

function breakdownFilterKey(filters: AnalysisFilters): string {
  return JSON.stringify({
    range: filters.range,
    start: filters.start,
    end: filters.end,
    focusDate: filters.focusDate,
    focusWeek: filters.focusWeek,
    dimension: filters.dimension,
    games: filters.games,
    regions: filters.regions,
    media: filters.media,
    channels: filters.channels,
    platforms: filters.platforms,
    drill: filters.drill,
  });
}

interface AnalysisQueryHookOptions<T> {
  key: string;
  topic: AnalysisTopic;
  filtersRef: { current: AnalysisFilters };
  request: (
    filters: AnalysisFilters,
    force: boolean,
    signal: AbortSignal,
  ) => Promise<T>;
  /** Synchronous cache read; `allowStale` opts into stale-while-revalidate. */
  peek: (filters: AnalysisFilters, allowStale: boolean) => T | undefined;
  empty: () => T;
  fallbackError: string;
  /** Skip network/cache work entirely (e.g. breakdown hidden in drill mode). */
  enabled?: boolean;
}

/**
 * Shared data-loading behaviour for the Analysis page:
 * - paints cached rows immediately (stale entries included) so remounts and
 *   topic switches never flash a skeleton;
 * - keeps the previous rows on screen while a new key revalidates;
 * - distinguishes `initialLoading` (nothing to render yet) from `refreshing`
 *   (rows are visible, a background request is running);
 * - keeps the 250ms debounce, force-refresh and abort semantics.
 */
function useAnalysisQuery<T>(options: AnalysisQueryHookOptions<T>) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Seed state from the module cache during the very first render: a warm
  // topic is painted with real rows before any request is issued.
  const seedRef = useRef<{ value: T | undefined } | null>(null);
  if (seedRef.current === null) {
    seedRef.current = {
      value: options.peek(options.filtersRef.current, true),
    };
  }
  const seed = seedRef.current?.value;
  const hasDataRef = useRef(seed !== undefined);
  const [data, setData] = useState<T>(() => seed ?? options.empty());
  const [initialLoading, setInitialLoading] = useState(!hasDataRef.current);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const forceRef = useRef(false);

  const refresh = useCallback(() => {
    forceRef.current = true;
    setRefreshToken((value) => value + 1);
  }, []);

  const { key, topic } = options;
  const enabled = options.enabled !== false;

  useEffect(() => {
    const controller = new AbortController();
    const force = forceRef.current;
    forceRef.current = false;
    if (!enabled) {
      setInitialLoading(false);
      setRefreshing(false);
      setError(null);
      return undefined;
    }
    const current = optionsRef.current;
    const filters = current.filtersRef.current;
    const hasData = hasDataRef.current;
    // A fresh cache entry (typically warmed by hover prefetch) paints in the
    // same commit and skips the debounce entirely, so a prefetched drill feels
    // instantaneous instead of waiting for a timer plus a promise.
    const cached = force ? undefined : current.peek(filters, false);
    if (cached !== undefined) {
      hasDataRef.current = true;
      setData(cached);
      setError(null);
      setInitialLoading(false);
      setRefreshing(false);
      return undefined;
    }

    setError(null);
    if (hasData) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }

    const timer = setTimeout(() => {
      const latest = optionsRef.current;
      latest
        .request(filters, force, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          hasDataRef.current = true;
          setData(next);
          setError(null);
        })
        .catch((requestError: unknown) => {
          if (controller.signal.aborted) return;
          setError(parseErrorMessage(requestError, latest.fallbackError));
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          setInitialLoading(false);
          setRefreshing(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Filters are tracked through `key`; the topic object is stable per page.
  }, [enabled, key, refreshToken, topic]);

  return {
    data,
    loading: initialLoading || refreshing,
    error,
    refresh,
    initialLoading,
    refreshing,
  };
}

/** KPI / comparison / trend data; never refetches for table drill changes. */
export function useAnalysisCoreData(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
) {
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  return useAnalysisQuery<AnalysisCoreData>({
    key: coreFilterKey(filters),
    topic,
    filtersRef,
    request: (currentFilters, force, signal) =>
      fetchCoreData(buildCoreQueryPlan(topic, currentFilters), {
        signal,
        force,
      }),
    peek: (currentFilters, allowStale) =>
      peekCoreData(buildCoreQueryPlan(topic, currentFilters), {
        allowStale,
      }),
    empty: emptyCoreData,
    fallbackError: "专题数据加载失败",
  });
}

function kpiFilterKey(filters: AnalysisFilters): string {
  // KPI totals keep the page-level filters only: drills, natural-traffic and
  // focus-date changes must not re-scan them.
  return JSON.stringify({
    range: filters.range,
    start: filters.start,
    end: filters.end,
    focusWeek: filters.focusWeek,
    games: filters.games,
    regions: filters.regions,
    media: filters.media,
    channels: filters.channels,
    platforms: filters.platforms,
  });
}

function trendFilterKey(filters: AnalysisFilters): string {
  return JSON.stringify({
    range: filters.range,
    start: filters.start,
    end: filters.end,
    focusWeek: filters.focusWeek,
    games: filters.games,
    regions: filters.regions,
    media: filters.media,
    channels: filters.channels,
    platforms: filters.platforms,
    drill: filters.drill,
    includeNatural: filters.includeNatural,
  });
}

/**
 * Split page data: KPI totals and trend series live in separate cache entries,
 * so table drills / natural-traffic toggles only re-issue the 2 trend queries
 * instead of the full 4-query bundle.
 */
export function useAnalysisPageData(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
) {
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const kpi = useAnalysisQuery<AnalysisKpiData>({
    key: kpiFilterKey(filters),
    topic,
    filtersRef,
    request: (current, force, signal) =>
      fetchKpiData(buildKpiQueryPlan(topic, current), { force, signal }),
    peek: (current, allowStale) =>
      peekKpiData(buildKpiQueryPlan(topic, current), { allowStale }),
    empty: emptyKpiData,
    fallbackError: "核心指标加载失败",
  });

  const trend = useAnalysisQuery<AnalysisTrendData>({
    key: trendFilterKey(filters),
    topic,
    filtersRef,
    // Drill mode shows the drill chart instead of the trend chart, so skip the
    // trend scan entirely for direct drill links.
    enabled: !filters.focusDate,
    request: (current, force, signal) =>
      fetchTrendData(buildTrendQueryPlan(topic, current), { force, signal }),
    peek: (current, allowStale) =>
      peekTrendData(buildTrendQueryPlan(topic, current), { allowStale }),
    empty: emptyTrendData,
    fallbackError: "趋势数据加载失败",
  });

  const refreshKpi = kpi.refresh;
  const refreshTrend = trend.refresh;
  const refresh = useCallback(() => {
    refreshKpi();
    refreshTrend();
  }, [refreshKpi, refreshTrend]);

  return {
    data: {
      totals: kpi.data.totals,
      previous: kpi.data.previous,
      trend: trend.data.trend,
      previousTrend: trend.data.previousTrend,
    },
    loading: kpi.loading || trend.loading,
    initialLoading: kpi.initialLoading || trend.initialLoading,
    error: trend.error ?? kpi.error,
    refresh,
  };
}

/** Detail table data; this is the only query issued for drill interactions. */
export function useAnalysisBreakdownData(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  options?: { enabled?: boolean },
) {
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  return useAnalysisQuery<AnalysisSectionData>({
    key: breakdownFilterKey(filters),
    topic,
    filtersRef,
    request: (currentFilters, force, signal) =>
      fetchBreakdownData(buildBreakdownQuery(topic, currentFilters), {
        signal,
        force,
      }),
    peek: (currentFilters, allowStale) =>
      peekBreakdownData(buildBreakdownQuery(topic, currentFilters), {
        allowStale,
      }),
    empty: emptyBreakdownData,
    fallbackError: "明细数据加载失败",
    enabled: options?.enabled,
  });
}
