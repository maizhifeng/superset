import { postChartData } from "@/api/chartData";
import dayjs from "dayjs";
import type { ChartDataRow } from "@/types/api";
import type {
  ChartDataResponse,
  ChartDataResponseResult,
  QueryObject,
} from "@/utils/query/types";
import {
  resolveMatureTimeRange,
  resolvePreviousPeriodTimeRange,
  resolveTimeRange,
  toBreakdownFilters,
  toQueryFilters,
  toTrendFilters,
  type AnalysisFilters,
} from "./filters";
import { DRILL_BASELINE_LOOKBACK_DAYS } from "./anomalies";
import {
  ANALYSIS_DATASET_ID,
  ANALYSIS_TIME_COLUMN,
  breakdownMetrics,
  totalsMetrics,
  topicMetric,
  trendMetrics,
} from "./topics";
import type { AnalysisTopic } from "./types";

export interface AnalysisCorePlan {
  totals: QueryObject;
  previous: QueryObject;
  trend: QueryObject;
  previousTrend: QueryObject;
}

/** KPI-only slice of the page data (independent of table drills / toggles). */
export interface AnalysisKpiPlan {
  totals: QueryObject;
  previous: QueryObject;
}

/** Trend-only slice, which follows table drills and the natural-traffic switch. */
export interface AnalysisTrendPlan {
  trend: QueryObject;
  previousTrend: QueryObject;
}

export interface AnalysisQueryPlan extends AnalysisCorePlan {
  breakdown: QueryObject;
}

export interface AnalysisSectionData {
  rows: ChartDataRow[];
  error: string | null;
}

export interface AnalysisCoreData {
  totals: AnalysisSectionData;
  previous: AnalysisSectionData;
  trend: AnalysisSectionData;
  previousTrend: AnalysisSectionData;
}

export interface AnalysisKpiData {
  totals: AnalysisSectionData;
  previous: AnalysisSectionData;
}

export interface AnalysisTrendData {
  trend: AnalysisSectionData;
  previousTrend: AnalysisSectionData;
}

export interface AnalysisData extends AnalysisCoreData {
  breakdown: AnalysisSectionData;
}

const DATASOURCE = { id: ANALYSIS_DATASET_ID, type: "table" as const };
const BREAKDOWN_ROW_LIMIT = 500;
const TREND_ROW_LIMIT = 400;
/** One drill attribution needs (categories × lookback days); keep a margin. */
const DRILL_ANOMALY_ROW_LIMIT = 8000;

/**
 * Cached chart-data responses stay valid for this long.
 *
 * These topics analyse historical data and the backend keeps its own Redis
 * copy, so a longer browser-side TTL removes the round trip for revisits and
 * repeated drill paths. The refresh button sends `force` and still bypasses it.
 */
export const ANALYSIS_QUERY_CACHE_TTL_MS = 10 * 60_000;
/** Bound the module-level cache so topic hopping cannot leak memory. */
export const ANALYSIS_QUERY_CACHE_MAX_ENTRIES = 20;

interface AnalysisQueryCacheEntry {
  value: unknown;
  expiresAt: number;
}

interface InFlightAnalysisQuery {
  promise: Promise<unknown>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
}

const analysisQueryCache = new Map<string, AnalysisQueryCacheEntry>();
const analysisQueriesInFlight = new Map<string, InFlightAnalysisQuery>();

/**
 * Recursively sort object keys so two equivalent query payloads always map to
 * the same cache key. Array order is meaningful (queries, metrics, filters).
 */
function canonicalCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalCacheValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        const child = record[key];
        if (child !== undefined) {
          sorted[key] = canonicalCacheValue(child);
        }
        return sorted;
      }, {});
  }
  return value;
}

/** Stable key built from the datasource and the exact query payload. */
function analysisCacheKey(
  kind:
    | "core"
    | "kpi"
    | "trend"
    | "breakdown"
    | "analysis"
    | "drill",
  queries: readonly QueryObject[],
): string {
  return `${kind}:${ANALYSIS_DATASET_ID}:${JSON.stringify(
    canonicalCacheValue(queries),
  )}`;
}

function readAnalysisCache<T>(key: string, allowStale: boolean): T | undefined {
  const entry = analysisQueryCache.get(key);
  if (!entry) return undefined;
  if (!allowStale && entry.expiresAt <= Date.now()) {
    analysisQueryCache.delete(key);
    return undefined;
  }
  // Reinsert on read so Map iteration order doubles as LRU order.
  analysisQueryCache.delete(key);
  analysisQueryCache.set(key, entry);
  return entry.value as T;
}

function writeAnalysisCache(key: string, value: unknown): void {
  analysisQueryCache.delete(key);
  analysisQueryCache.set(key, {
    value,
    expiresAt: Date.now() + ANALYSIS_QUERY_CACHE_TTL_MS,
  });
  while (analysisQueryCache.size > ANALYSIS_QUERY_CACHE_MAX_ENTRIES) {
    const oldestKey = analysisQueryCache.keys().next().value;
    if (oldestKey === undefined) break;
    analysisQueryCache.delete(oldestKey);
  }
}

function deleteInFlight(key: string, entry: InFlightAnalysisQuery): void {
  if (analysisQueriesInFlight.get(key) === entry) {
    analysisQueriesInFlight.delete(key);
  }
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * Mirror one consumer onto a shared in-flight request. Aborting this consumer
 * only cancels the underlying request once every other consumer is gone.
 */
function attachCacheConsumer<T>(
  entry: InFlightAnalysisQuery,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  entry.consumers += 1;
  return new Promise<T>((resolve, reject) => {
    let finished = false;

    function finish(): void {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", handleAbort);
      entry.consumers = Math.max(0, entry.consumers - 1);
    }

    function handleAbort(): void {
      if (finished) return;
      finish();
      if (entry.consumers === 0 && !entry.settled) {
        entry.controller.abort();
      }
      reject(createAbortError());
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
    entry.promise.then(
      (value) => {
        if (finished) return;
        finish();
        resolve(value as T);
      },
      (error: unknown) => {
        if (finished) return;
        finish();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Shared cache/dedupe pipeline for one chart-data request:
 * fresh hit -> resolve immediately; identical in-flight request -> share it;
 * otherwise issue one request and only remember successful responses.
 */
function loadAnalysisQuery<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: { signal?: AbortSignal; force?: boolean },
): Promise<T> {
  if (options?.force !== true) {
    const cached = readAnalysisCache<T>(key, false);
    if (cached !== undefined) return Promise.resolve(cached);
  }

  const running = analysisQueriesInFlight.get(key);
  if (running) return attachCacheConsumer<T>(running, options?.signal);

  const controller = new AbortController();
  const entry: InFlightAnalysisQuery = {
    promise: Promise.resolve(),
    controller,
    consumers: 0,
    settled: false,
  };
  const request = fetcher(controller.signal).then(
    (value) => {
      entry.settled = true;
      deleteInFlight(key, entry);
      writeAnalysisCache(key, value);
      return value;
    },
    (error: unknown) => {
      entry.settled = true;
      deleteInFlight(key, entry);
      throw error;
    },
  );
  entry.promise = request;
  // Keep the shared promise observed even when every consumer aborts.
  request.catch(() => undefined);
  analysisQueriesInFlight.set(key, entry);
  return attachCacheConsumer<T>(entry, options?.signal);
}

/** Drop every cached response. In-flight requests finish and refill the cache. */
export function clearAnalysisQueryCache(): void {
  analysisQueryCache.clear();
}

function coreCacheKey(plan: AnalysisCorePlan): string {
  return analysisCacheKey("core", [
    plan.totals,
    plan.previous,
    plan.trend,
    plan.previousTrend,
  ]);
}

function breakdownCacheKey(query: QueryObject): string {
  return analysisCacheKey("breakdown", [query]);
}

function analysisCacheKeyForPlan(plan: AnalysisQueryPlan): string {
  return analysisCacheKey("analysis", [
    plan.totals,
    plan.previous,
    plan.trend,
    plan.previousTrend,
    plan.breakdown,
  ]);
}

/** Synchronous cache peek for hooks; stale entries are allowed by default. */
export function peekCoreData(
  plan: AnalysisCorePlan,
  options?: { allowStale?: boolean },
): AnalysisCoreData | undefined {
  return readAnalysisCache<AnalysisCoreData>(
    coreCacheKey(plan),
    options?.allowStale ?? true,
  );
}

/** Synchronous cache peek for hooks; stale entries are allowed by default. */
export function peekBreakdownData(
  query: QueryObject,
  options?: { allowStale?: boolean },
): AnalysisSectionData | undefined {
  return readAnalysisCache<AnalysisSectionData>(
    breakdownCacheKey(query),
    options?.allowStale ?? true,
  );
}

/** Synchronous cache peek for the single-request variant. */
export function peekAnalysisData(
  plan: AnalysisQueryPlan,
  options?: { allowStale?: boolean },
): AnalysisData | undefined {
  return readAnalysisCache<AnalysisData>(
    analysisCacheKeyForPlan(plan),
    options?.allowStale ?? true,
  );
}

/** KPI, period comparison and trend queries (trend follows table drills). */
export function buildCoreQueryPlan(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): AnalysisCorePlan {
  const common: QueryObject = {
    result_type: "full",
    metrics: [],
    groupby: [],
    columns: [],
    filters: toQueryFilters(filters),
    granularity: ANALYSIS_TIME_COLUMN,
  };
  // KPI totals keep the page-level filters, while the trend series follows the
  // breakdown table's drill path and the "include natural traffic" switch.
  const trendFilters = toTrendFilters(filters);
  const totalRange = resolveMatureTimeRange(filters, topic.maturityDays ?? 0);
  const previousRange = resolvePreviousPeriodTimeRange(
    filters,
    topic.maturityDays ?? 0,
  );
  const totalMetrics = totalsMetrics(topic).map((item) => item.metric);
  const trendMetricValues = trendMetrics(topic).map((item) => item.metric);

  const totals: QueryObject = {
    ...common,
    metrics: totalMetrics,
    groupby: [],
    time_range: totalRange,
    row_limit: 1,
  };

  const previous: QueryObject = {
    ...common,
    metrics: totalMetrics,
    groupby: [],
    time_range: previousRange,
    row_limit: 1,
  };

  const trend: QueryObject = {
    ...common,
    filters: trendFilters,
    metrics: trendMetricValues,
    groupby: [ANALYSIS_TIME_COLUMN],
    orderby: [[ANALYSIS_TIME_COLUMN, true]],
    time_range: resolveTimeRange(filters),
    row_limit: TREND_ROW_LIMIT,
  };

  // Trend comparison always uses the selected period, not the mature window:
  // the chart itself already hides immature points at its tail.
  const previousTrend: QueryObject = {
    ...common,
    filters: trendFilters,
    metrics: trendMetricValues,
    groupby: [ANALYSIS_TIME_COLUMN],
    orderby: [[ANALYSIS_TIME_COLUMN, true]],
    time_range: resolvePreviousPeriodTimeRange(filters, 0),
    row_limit: TREND_ROW_LIMIT,
  };

  return { totals, previous, trend, previousTrend };
}

/**
 * KPI slice of the page plan. Kept separate from the trend slice so table
 * drills only re-query the trend (2 queries) and never re-scan the KPI totals.
 */
export function buildKpiQueryPlan(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): AnalysisKpiPlan {
  const common: QueryObject = {
    result_type: "full",
    metrics: [],
    groupby: [],
    columns: [],
    filters: toQueryFilters(filters),
    granularity: ANALYSIS_TIME_COLUMN,
  };
  const totalMetrics = totalsMetrics(topic).map((item) => item.metric);
  return {
    totals: {
      ...common,
      metrics: totalMetrics,
      groupby: [],
      time_range: resolveMatureTimeRange(filters, topic.maturityDays ?? 0),
      row_limit: 1,
    },
    previous: {
      ...common,
      metrics: totalMetrics,
      groupby: [],
      time_range: resolvePreviousPeriodTimeRange(
        filters,
        topic.maturityDays ?? 0,
      ),
      row_limit: 1,
    },
  };
}

/** Trend slice of the page plan (drill filters + natural-traffic switch). */
export function buildTrendQueryPlan(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): AnalysisTrendPlan {
  const common: QueryObject = {
    result_type: "full",
    metrics: [],
    groupby: [],
    columns: [],
    filters: toTrendFilters(filters),
    granularity: ANALYSIS_TIME_COLUMN,
  };
  const trendMetricValues = trendMetrics(topic).map((item) => item.metric);
  return {
    trend: {
      ...common,
      metrics: trendMetricValues,
      groupby: [ANALYSIS_TIME_COLUMN],
      orderby: [[ANALYSIS_TIME_COLUMN, true]],
      time_range: resolveTimeRange(filters),
      row_limit: TREND_ROW_LIMIT,
    },
    // Trend comparison always uses the selected period, not the mature window:
    // the chart itself already hides immature points at its tail.
    previousTrend: {
      ...common,
      metrics: trendMetricValues,
      groupby: [ANALYSIS_TIME_COLUMN],
      orderby: [[ANALYSIS_TIME_COLUMN, true]],
      time_range: resolvePreviousPeriodTimeRange(filters, 0),
      row_limit: TREND_ROW_LIMIT,
    },
  };
}

/** One breakdown query, including hierarchy drill context. */
export function buildBreakdownQuery(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): QueryObject {
  const isTimeDimension = filters.dimension === ANALYSIS_TIME_COLUMN;
  const selectedDimension = isTimeDimension
    ? ANALYSIS_TIME_COLUMN
    : topic.dimensions.some((item) => item.key === filters.dimension)
      ? filters.dimension
      : topic.defaultDimension;
  const totalRange = resolveMatureTimeRange(filters, topic.maturityDays ?? 0);
  const orderBy = isTimeDimension
    ? ANALYSIS_TIME_COLUMN
    : topicMetric(topic, topic.breakdown.orderBy).key;
  const breakdownTimeRange = filters.focusDate
    ? `${filters.focusDate} : ${dayjs(filters.focusDate)
        .add(1, "day")
        .format("YYYY-MM-DD")}`
    : filters.focusWeek
      ? `${filters.focusWeek} : ${dayjs(filters.focusWeek)
          .add(7, "day")
          .format("YYYY-MM-DD")}`
      : totalRange;

  return {
    result_type: "full",
    metrics: breakdownMetrics(topic).map((item) => item.metric),
    groupby: [selectedDimension],
    columns: [],
    filters: toBreakdownFilters(filters),
    granularity: ANALYSIS_TIME_COLUMN,
    orderby: [[orderBy, isTimeDimension]],
    order_desc: !isTimeDimension,
    time_range: breakdownTimeRange,
    row_limit: BREAKDOWN_ROW_LIMIT,
  };
}

/**
 * History query behind the drill view's root-cause attribution: the anomaly
 * metric for every dimension value over the rolling baseline window plus the
 * drilled day.  Returns ``null`` outside drill mode (no focus date).
 */
export function buildDrillAnomalyQuery(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): QueryObject | null {
  if (!filters.focusDate) return null;
  const focus = dayjs(filters.focusDate);
  if (!focus.isValid()) return null;
  const start = focus.subtract(DRILL_BASELINE_LOOKBACK_DAYS - 1, "day");
  // The backend treats the range end as exclusive for day granularity, so the
  // drilled day itself is included by moving the end one day forward.
  const end = focus.add(1, "day");
  const metricKey =
    topic.comparisonMetric ?? topic.trend.series[0]?.metric ?? "cpa";
  const metric = topicMetric(topic, metricKey);
  return {
    result_type: "full",
    metrics: [metric.metric],
    groupby: [filters.dimension, ANALYSIS_TIME_COLUMN],
    columns: [],
    filters: toBreakdownFilters(filters),
    granularity: ANALYSIS_TIME_COLUMN,
    orderby: [[ANALYSIS_TIME_COLUMN, true]],
    time_range: `${start.format("YYYY-MM-DD")} : ${end.format("YYYY-MM-DD")}`,
    row_limit: DRILL_ANOMALY_ROW_LIMIT,
  };
}

/**
 * One query for the whole drill view: every breakdown metric at (dimension ×
 * date) over the anomaly lookback. The drill table/chart use the focus day's
 * rows, while anomaly attribution reads the same rows' history — replacing the
 * previous two-query flow (day rows + attribution history).
 */
export function buildDrillQueryPlan(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): QueryObject | null {
  if (!filters.focusDate) return null;
  const focus = dayjs(filters.focusDate);
  if (!focus.isValid()) return null;
  const metricDefs = breakdownMetrics(topic);
  const metrics = metricDefs.map((metric) => metric.metric);
  const anomalyMetricKey =
    topic.comparisonMetric ?? topic.trend.series[0]?.metric ?? "cpa";
  const anomalyMetric = topicMetric(topic, anomalyMetricKey);
  if (!metricDefs.some((metric) => metric.key === anomalyMetric.key)) {
    metrics.push(anomalyMetric.metric);
  }
  const start = focus.subtract(DRILL_BASELINE_LOOKBACK_DAYS - 1, "day");
  const end = focus.add(1, "day");
  return {
    result_type: "full",
    metrics,
    groupby: [filters.dimension, ANALYSIS_TIME_COLUMN],
    columns: [],
    filters: toBreakdownFilters(filters),
    granularity: ANALYSIS_TIME_COLUMN,
    orderby: [[ANALYSIS_TIME_COLUMN, true]],
    time_range: `${start.format("YYYY-MM-DD")} : ${end.format("YYYY-MM-DD")}`,
    row_limit: DRILL_ANOMALY_ROW_LIMIT,
  };
}

/** Full plan retained for callers that need all queries at once. */
export function buildQueryPlan(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  dimension: string,
): AnalysisQueryPlan {
  return {
    ...buildCoreQueryPlan(topic, filters),
    breakdown: buildBreakdownQuery(topic, { ...filters, dimension }),
  };
}

function readResult(
  result: ChartDataResponseResult | undefined,
): AnalysisSectionData {
  if (!result) {
    return { rows: [], error: "查询未返回结果" };
  }
  if (result.error) {
    return { rows: [], error: result.error };
  }
  return {
    rows: Array.isArray(result.data) ? result.data : [],
    error: null,
  };
}

function responseResults(response: unknown): ChartDataResponseResult[] {
  const payload = (response as { data?: ChartDataResponse } | undefined)?.data;
  return payload?.result ?? [];
}

async function requestCoreData(
  plan: AnalysisCorePlan,
  force: boolean,
  signal: AbortSignal,
): Promise<AnalysisCoreData> {
  const response = await postChartData(
    {
      datasource: DATASOURCE,
      queries: [plan.totals, plan.previous, plan.trend, plan.previousTrend],
      result_type: "full",
      result_format: "json",
      force,
    },
    { signal },
  );
  const results = responseResults(response);
  return {
    totals: readResult(results[0]),
    previous: readResult(results[1]),
    trend: readResult(results[2]),
    previousTrend: readResult(results[3]),
  };
}

/** Execute the four core queries (cached, with in-flight dedupe). */
export function fetchCoreData(
  plan: AnalysisCorePlan,
  options?: { signal?: AbortSignal; force?: boolean },
): Promise<AnalysisCoreData> {
  const force = options?.force === true;
  return loadAnalysisQuery(
    coreCacheKey(plan),
    (signal) => requestCoreData(plan, force, signal),
    options,
  );
}

function kpiCacheKey(plan: AnalysisKpiPlan): string {
  return analysisCacheKey("kpi", [plan.totals, plan.previous]);
}

function trendCacheKey(plan: AnalysisTrendPlan): string {
  return analysisCacheKey("trend", [plan.trend, plan.previousTrend]);
}

/** Synchronous cache peek for the KPI slice. */
export function peekKpiData(
  plan: AnalysisKpiPlan,
  options?: { allowStale?: boolean },
): AnalysisKpiData | undefined {
  return readAnalysisCache<AnalysisKpiData>(
    kpiCacheKey(plan),
    options?.allowStale ?? true,
  );
}

/** Synchronous cache peek for the trend slice. */
export function peekTrendData(
  plan: AnalysisTrendPlan,
  options?: { allowStale?: boolean },
): AnalysisTrendData | undefined {
  return readAnalysisCache<AnalysisTrendData>(
    trendCacheKey(plan),
    options?.allowStale ?? true,
  );
}

async function requestKpiData(
  plan: AnalysisKpiPlan,
  force: boolean,
  signal: AbortSignal,
): Promise<AnalysisKpiData> {
  const response = await postChartData(
    {
      datasource: DATASOURCE,
      queries: [plan.totals, plan.previous],
      result_type: "full",
      result_format: "json",
      force,
    },
    { signal },
  );
  const results = responseResults(response);
  return {
    totals: readResult(results[0]),
    previous: readResult(results[1]),
  };
}

async function requestTrendData(
  plan: AnalysisTrendPlan,
  force: boolean,
  signal: AbortSignal,
): Promise<AnalysisTrendData> {
  const response = await postChartData(
    {
      datasource: DATASOURCE,
      queries: [plan.trend, plan.previousTrend],
      result_type: "full",
      result_format: "json",
      force,
    },
    { signal },
  );
  const results = responseResults(response);
  return {
    trend: readResult(results[0]),
    previousTrend: readResult(results[1]),
  };
}

/** Execute the KPI slice (2 queries, cached, in-flight deduped). */
export function fetchKpiData(
  plan: AnalysisKpiPlan,
  options?: { signal?: AbortSignal; force?: boolean },
): Promise<AnalysisKpiData> {
  const force = options?.force === true;
  return loadAnalysisQuery(
    kpiCacheKey(plan),
    (signal) => requestKpiData(plan, force, signal),
    options,
  );
}

/** Execute the trend slice (2 queries, cached, in-flight deduped). */
export function fetchTrendData(
  plan: AnalysisTrendPlan,
  options?: { signal?: AbortSignal; force?: boolean },
): Promise<AnalysisTrendData> {
  const force = options?.force === true;
  return loadAnalysisQuery(
    trendCacheKey(plan),
    (signal) => requestTrendData(plan, force, signal),
    options,
  );
}

async function requestBreakdownData(
  query: QueryObject,
  force: boolean,
  signal: AbortSignal,
): Promise<AnalysisSectionData> {
  const response = await postChartData(
    {
      datasource: DATASOURCE,
      queries: [query],
      result_type: "full",
      result_format: "json",
      force,
    },
    { signal },
  );
  return readResult(responseResults(response)[0]);
}

/** Execute the single breakdown query (cached, with in-flight dedupe). */
export function fetchBreakdownData(
  query: QueryObject,
  options?: { signal?: AbortSignal; force?: boolean },
): Promise<AnalysisSectionData> {
  const force = options?.force === true;
  return loadAnalysisQuery(
    breakdownCacheKey(query),
    (signal) => requestBreakdownData(query, force, signal),
    options,
  );
}

async function requestAnalysisData(
  plan: AnalysisQueryPlan,
  force: boolean,
  signal: AbortSignal,
): Promise<AnalysisData> {
  const response = await postChartData(
    {
      datasource: DATASOURCE,
      queries: [
        plan.totals,
        plan.previous,
        plan.trend,
        plan.previousTrend,
        plan.breakdown,
      ],
      result_type: "full",
      result_format: "json",
      force,
    },
    { signal },
  );
  const results = responseResults(response);
  return {
    totals: readResult(results[0]),
    previous: readResult(results[1]),
    trend: readResult(results[2]),
    previousTrend: readResult(results[3]),
    breakdown: readResult(results[4]),
  };
}

/**
 * Single-request variant retained for callers/tests that want the full page
 * payload in one round trip (cached, with in-flight dedupe).
 */
export function fetchAnalysisData(
  plan: AnalysisQueryPlan,
  options?: { signal?: AbortSignal; force?: boolean },
): Promise<AnalysisData> {
  const force = options?.force === true;
  return loadAnalysisQuery(
    analysisCacheKeyForPlan(plan),
    (signal) => requestAnalysisData(plan, force, signal),
    options,
  );
}

/**
 * Seed the page caches with a previously generated snapshot so the split hooks
 * paint their first commit from memory instead of issuing federated queries.
 */
export function seedAnalysisData(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  data: AnalysisData,
): void {
  writeAnalysisCache(kpiCacheKey(buildKpiQueryPlan(topic, filters)), {
    totals: data.totals,
    previous: data.previous,
  });
  writeAnalysisCache(trendCacheKey(buildTrendQueryPlan(topic, filters)), {
    trend: data.trend,
    previousTrend: data.previousTrend,
  });
  writeAnalysisCache(
    breakdownCacheKey(buildBreakdownQuery(topic, filters)),
    data.breakdown,
  );
}

export function emptyKpiData(): AnalysisKpiData {
  return {
    totals: { rows: [], error: null },
    previous: { rows: [], error: null },
  };
}

export function emptyTrendData(): AnalysisTrendData {
  return {
    trend: { rows: [], error: null },
    previousTrend: { rows: [], error: null },
  };
}

export function emptyCoreData(): AnalysisCoreData {
  return {
    totals: { rows: [], error: null },
    previous: { rows: [], error: null },
    trend: { rows: [], error: null },
    previousTrend: { rows: [], error: null },
  };
}

export function emptyBreakdownData(): AnalysisSectionData {
  return { rows: [], error: null };
}

export function emptyAnalysisData(): AnalysisData {
  return {
    ...emptyCoreData(),
    breakdown: emptyBreakdownData(),
  };
}
