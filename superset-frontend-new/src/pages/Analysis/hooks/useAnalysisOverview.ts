import { useCallback, useEffect, useState } from "react";
import { postChartData } from "@/api/chartData";
import type { ChartDataRow } from "@/types/api";
import type {
  ChartDataResponseResult,
  QueryObject,
} from "@/utils/query/types";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import {
  defaultFilters,
  resolveDateBounds,
  resolvePreviousPeriodBounds,
  type AnalysisFilters,
  type DateBounds,
} from "../filters";
import {
  ANALYSIS_DATASET_ID,
  ANALYSIS_TIME_COLUMN,
  getAnalysisTopic,
  topicMetric,
} from "../topics";
import type { AnalysisMetric, AnalysisTopic } from "../types";

/** Metric-catalog keys shown in the "近 30 天总览" strip. */
export const ANALYSIS_OVERVIEW_METRIC_KEYS = [
  "spend",
  "newUsers",
  "revenueRoi",
  "cpa",
] as const;

/** Length of the summary window, counted in days and inclusive of today. */
export const ANALYSIS_OVERVIEW_WINDOW_DAYS = 30;

/** How long a fetched summary stays usable before a refetch is allowed. */
export const ANALYSIS_OVERVIEW_CACHE_TTL_MS = 5 * 60_000;

export interface AnalysisOverviewRange {
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
}

export interface AnalysisOverviewData {
  current: ChartDataRow | null;
  previous: ChartDataRow | null;
  range: AnalysisOverviewRange;
}

const DATASOURCE = { id: ANALYSIS_DATASET_ID, type: "table" as const };

/** Local subset of the chart-data envelope; only the fields read here. */
interface ChartDataEnvelope {
  result?: ChartDataResponseResult[];
}

function requireCostTopic(): AnalysisTopic {
  const topic = getAnalysisTopic("cost");
  if (!topic) {
    throw new Error("Analysis topic 'cost' is not configured");
  }
  return topic;
}

/**
 * Metric definitions of the summary tiles.  The cost topic owns the shared
 * metric catalog, so the summary reuses it instead of redefining columns.
 */
export function analysisOverviewMetrics(): AnalysisMetric[] {
  const topic = requireCostTopic();
  return ANALYSIS_OVERVIEW_METRIC_KEYS.map((key) => topicMetric(topic, key));
}

/**
 * Two queries share one request: totals for the last 30 days and totals for
 * the equal-length window right before it (the basis of every delta).
 */
function buildOverviewRequest(): QueryObject[] {
  const filters: AnalysisFilters = {
    ...defaultFilters(requireCostTopic()),
    range: "30d",
  };
  const current: DateBounds = resolveDateBounds(filters);
  const previous: DateBounds = resolvePreviousPeriodBounds(filters, 0);
  const metrics = analysisOverviewMetrics().map((metric) => metric.metric);
  const query = (bounds: DateBounds): QueryObject => ({
    result_type: "full",
    metrics,
    groupby: [],
    columns: [],
    filters: [],
    granularity: ANALYSIS_TIME_COLUMN,
    time_range: `${bounds.start} : ${bounds.end}`,
    row_limit: 1,
  });
  return [query(current), query(previous)];
}

/** Window bounds derived from the same rules as the queries. */
function buildOverviewRange(): AnalysisOverviewRange {
  const filters: AnalysisFilters = {
    ...defaultFilters(requireCostTopic()),
    range: "30d",
  };
  const current = resolveDateBounds(filters);
  const previous = resolvePreviousPeriodBounds(filters, 0);
  return {
    start: current.start,
    end: current.end,
    previousStart: previous.start,
    previousEnd: previous.end,
  };
}

function responseResults(response: unknown): ChartDataResponseResult[] {
  const payload = (response as { data?: ChartDataEnvelope } | undefined)?.data;
  return payload?.result ?? [];
}

function readRow(
  result: ChartDataResponseResult | undefined,
): ChartDataRow | null {
  if (!result || result.error) return null;
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows[0] ?? null;
}

async function fetchOverview(
  queries: QueryObject[],
  signal: AbortSignal,
): Promise<Pick<AnalysisOverviewData, "current" | "previous">> {
  const response = await postChartData(
    {
      datasource: DATASOURCE,
      queries,
      result_type: "full",
      result_format: "json",
      force: false,
    },
    { signal },
  );
  const results = responseResults(response);
  if (results.length === 0) {
    throw new Error("总览查询未返回结果");
  }
  const failed = results.find((result) => result.error)?.error;
  if (failed) {
    throw new Error(failed);
  }
  return {
    current: readRow(results[0]),
    previous: readRow(results[1]),
  };
}

interface CacheEntry {
  key: string;
  fetchedAt: number;
  data: AnalysisOverviewData;
}

interface InFlightRequest {
  key: string;
  controller: AbortController;
  /** Number of mounted subscribers still interested in the response. */
  subscribers: number;
  promise: Promise<AnalysisOverviewData>;
}

let cacheEntry: CacheEntry | null = null;
let inFlight: InFlightRequest | null = null;

function requestKey(range: AnalysisOverviewRange): string {
  return `${range.start}~${range.end}`;
}

function readCachedOverview(): AnalysisOverviewData | null {
  if (!cacheEntry) return null;
  if (Date.now() - cacheEntry.fetchedAt > ANALYSIS_OVERVIEW_CACHE_TTL_MS) {
    return null;
  }
  if (cacheEntry.key !== requestKey(buildOverviewRange())) return null;
  return cacheEntry.data;
}

function abortError(): DOMException {
  return new DOMException("The overview request was aborted", "AbortError");
}

function startRequest(key: string, range: AnalysisOverviewRange): InFlightRequest {
  const controller = new AbortController();
  const request: InFlightRequest = {
    key,
    controller,
    subscribers: 0,
    promise: fetchOverview(buildOverviewRequest(), controller.signal)
      .then(({ current, previous }) => {
        const data: AnalysisOverviewData = { current, previous, range };
        cacheEntry = { key, fetchedAt: Date.now(), data };
        return data;
      })
      .finally(() => {
        if (inFlight === request) inFlight = null;
      }),
  };
  inFlight = request;
  return request;
}

function releaseRequest(request: InFlightRequest): void {
  request.subscribers -= 1;
  if (request.subscribers > 0) return;
  // Nobody is listening anymore: drop the response and free the connection.
  if (inFlight === request) inFlight = null;
  request.controller.abort();
}

function subscribeRequest(
  request: InFlightRequest,
  signal?: AbortSignal,
): Promise<AnalysisOverviewData> {
  request.subscribers += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    signal?.removeEventListener("abort", release);
    releaseRequest(request);
  };
  if (signal) {
    if (signal.aborted) {
      release();
      return Promise.reject(abortError());
    }
    signal.addEventListener("abort", release, { once: true });
  }
  return request.promise.finally(release);
}

/**
 * Fetch (or reuse) the 30-day summary.  A module-level cache with a short TTL
 * keeps returning to the hall from refetching, and concurrent mounts share one
 * in-flight POST instead of issuing duplicates.
 */
export function loadAnalysisOverview(options?: {
  signal?: AbortSignal;
}): Promise<AnalysisOverviewData> {
  const signal = options?.signal;
  if (signal?.aborted) return Promise.reject(abortError());

  const range = buildOverviewRange();
  const key = requestKey(range);
  const cached = cacheEntry;
  if (
    cached &&
    cached.key === key &&
    Date.now() - cached.fetchedAt <= ANALYSIS_OVERVIEW_CACHE_TTL_MS
  ) {
    return Promise.resolve(cached.data);
  }
  if (inFlight && inFlight.key === key) {
    return subscribeRequest(inFlight, signal);
  }
  return subscribeRequest(startRequest(key, range), signal);
}

/** Drop the cached summary, for tests and for callers that must force a reload. */
export function clearAnalysisOverviewCache(): void {
  cacheEntry = null;
  if (inFlight) {
    const pending = inFlight;
    inFlight = null;
    pending.controller.abort();
  }
}

/**
 * "近 30 天总览" data with loading/error state and a manual retry.  The error
 * stays local to the strip so the rest of the hall page keeps working.
 */
export function useAnalysisOverview() {
  const [data, setData] = useState<AnalysisOverviewData | null>(() =>
    readCachedOverview(),
  );
  const [loading, setLoading] = useState(() => data === null);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    clearAnalysisOverviewCache();
    setRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cached = refreshToken === 0 ? readCachedOverview() : null;
    if (cached) setData(cached);
    if (!cached) {
      setLoading(true);
      setError(null);
    }

    loadAnalysisOverview({ signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(parseErrorMessage(err, "近 30 天总览加载失败"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshToken]);

  return { data, loading, error, refresh };
}
