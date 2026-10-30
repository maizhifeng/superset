import { useEffect, useState } from "react";
import api from "@/api";
import {
  defaultFilters,
  resolveTimeRange,
  type AnalysisFilters,
} from "./filters";
import {
  buildBreakdownQuery,
  buildKpiQueryPlan,
  buildTrendQueryPlan,
  type AnalysisData,
  type AnalysisSectionData,
} from "./query";
import { getAnalysisTopic } from "./topics";
import type { AnalysisTopic } from "./types";

/** Ignore snapshots older than this so a stale default view never sticks. */
export const ANALYSIS_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * Payload/query contract version.  Bump this whenever the snapshot shape or
 * the default-view query plan changes, so old rows are never rendered with a
 * newer UI (the query signature below also catches metric changes).
 */
export const ANALYSIS_SNAPSHOT_VERSION = 2;

export interface AnalysisSnapshotScope {
  range: string;
  dimension: string;
  includeNatural: boolean;
  /** Selected date window; a new day invalidates yesterday's snapshot. */
  time_range: string;
}

export interface AnalysisSnapshot {
  topic: string;
  version: number;
  query_signature: string;
  scope: AnalysisSnapshotScope;
  generated_at: string;
  saved_at?: string;
  data: {
    totals: AnalysisSectionData;
    previous: AnalysisSectionData;
    trend: AnalysisSectionData;
    previousTrend: AnalysisSectionData;
    breakdown: AnalysisSectionData;
  };
}

/** Default-view scope: the only scope served from a persisted snapshot. */
export function isDefaultSnapshotScope(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): boolean {
  const defaults = defaultFilters(topic);
  return (
    filters.range === defaults.range &&
    !filters.start &&
    !filters.end &&
    !filters.focusDate &&
    !filters.focusWeek &&
    filters.games.length === 0 &&
    filters.regions.length === 0 &&
    filters.media.length === 0 &&
    filters.channels.length === 0 &&
    filters.platforms.length === 0 &&
    Object.keys(filters.drill).length === 0 &&
    filters.dimension === defaults.dimension &&
    filters.includeNatural !== false
  );
}

export function snapshotScope(filters: AnalysisFilters): AnalysisSnapshotScope {
  return {
    range: filters.range,
    dimension: filters.dimension,
    includeNatural: filters.includeNatural !== false,
    time_range: resolveTimeRange(filters),
  };
}

/**
 * Signature of the default-view query plans (metrics/groupby/filters/order).
 * Time ranges and row limits are excluded because they are covered by the
 * scope window and the snapshot age, not by the query contract.
 */
export function snapshotQuerySignature(topic: AnalysisTopic): string {
  const filters = defaultFilters(topic);
  const kpi = buildKpiQueryPlan(topic, filters);
  const trend = buildTrendQueryPlan(topic, filters);
  const breakdown = buildBreakdownQuery(topic, filters);
  const normalize = (query: object) => {
    const copy = { ...query } as Record<string, unknown>;
    delete copy.time_range;
    delete copy.row_limit;
    return copy;
  };
  return JSON.stringify([
    normalize(kpi.totals),
    normalize(kpi.previous),
    normalize(trend.trend),
    normalize(trend.previousTrend),
    normalize(breakdown),
  ]);
}

/** Snapshot data converted to the shape already used by the page caches. */
export function snapshotToAnalysisData(
  snapshot: AnalysisSnapshot,
): AnalysisData {
  return {
    totals: snapshot.data.totals,
    previous: snapshot.data.previous,
    trend: snapshot.data.trend,
    previousTrend: snapshot.data.previousTrend,
    breakdown: snapshot.data.breakdown,
  };
}

function hasRows(section: AnalysisSectionData | undefined): boolean {
  return Boolean(section && Array.isArray(section.rows));
}

function isValidSnapshot(
  value: unknown,
  topic: AnalysisTopic,
): value is AnalysisSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as AnalysisSnapshot;
  if (snapshot.topic !== topic.id) return false;
  if (snapshot.version !== ANALYSIS_SNAPSHOT_VERSION) return false;
  if (snapshot.query_signature !== snapshotQuerySignature(topic)) return false;
  if (snapshot.scope?.time_range !== resolveTimeRange(defaultFilters(topic))) {
    return false;
  }
  if (!snapshot.data || typeof snapshot.data !== "object") return false;
  if (
    !hasRows(snapshot.data.totals) ||
    !hasRows(snapshot.data.previous) ||
    !hasRows(snapshot.data.trend) ||
    !hasRows(snapshot.data.previousTrend) ||
    !hasRows(snapshot.data.breakdown)
  ) {
    return false;
  }
  // A snapshot saved while a drill response was still on screen could carry
  // rows for a different dimension (e.g. daily rows under a 主游戏 scope).
  // Reject it so the page falls back to live data instead of an empty table.
  const dimension =
    snapshot.scope?.dimension ?? defaultFilters(topic).dimension;
  return (
    snapshot.data.breakdown.rows.length > 0 &&
    snapshot.data.breakdown.rows.every(
      (row) => row[dimension] !== undefined && row[dimension] !== null,
    )
  );
}

/** Load the persisted default-view snapshot, if any. */
export async function loadAnalysisSnapshot(
  topic: AnalysisTopic,
  signal?: AbortSignal,
): Promise<AnalysisSnapshot | null> {
  try {
    const response = await api.get<{ result: AnalysisSnapshot | null }>(
      `/bi/analysis-snapshots/${topic.id}`,
      { signal },
    );
    const snapshot = response.data?.result;
    if (!isValidSnapshot(snapshot, topic)) return null;
    const generatedAt = Date.parse(snapshot.generated_at);
    if (
      Number.isNaN(generatedAt) ||
      Date.now() - generatedAt > ANALYSIS_SNAPSHOT_MAX_AGE_MS
    ) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

/** Persist a snapshot generated from a freshly loaded default view. */
export async function saveAnalysisSnapshot(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  data: AnalysisData,
): Promise<void> {
  try {
    const body = {
      version: ANALYSIS_SNAPSHOT_VERSION,
      query_signature: snapshotQuerySignature(topic),
      scope: snapshotScope(filters),
      generated_at: new Date().toISOString(),
      data: {
        totals: data.totals,
        previous: data.previous,
        trend: data.trend,
        previousTrend: data.previousTrend,
        breakdown: data.breakdown,
      },
    };
    await api.put(`/bi/analysis-snapshots/${topic.id}`, body);
  } catch {
    // Snapshot persistence is best-effort; the live data is already rendered.
  }
}

/**
 * Load the snapshot before mounting the topic page.  The request is skipped
 * entirely for non-default scopes, so arbitrary filters/drills never wait on
 * an extra request.
 */
export function useAnalysisSnapshot(
  topicId: string | undefined,
  enabled: boolean,
): {
  loading: boolean;
  snapshot: AnalysisSnapshot | null;
} {
  const [state, setState] = useState<{
    loading: boolean;
    snapshot: AnalysisSnapshot | null;
  }>({ loading: enabled, snapshot: null });

  useEffect(() => {
    if (!enabled || !topicId) {
      setState({ loading: false, snapshot: null });
      return undefined;
    }
    const topic = getAnalysisTopic(topicId);
    if (!topic) {
      setState({ loading: false, snapshot: null });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ ...previous, loading: true }));
    void loadAnalysisSnapshot(topic, controller.signal).then((snapshot) => {
      if (!active) return;
      setState({ loading: false, snapshot });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, topicId]);

  return state;
}
