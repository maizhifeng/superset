import { useEffect, useMemo, useState } from "react";
import type { ChartDataRow } from "@/types/api";
import { detectDrillAnomalies, type DrillAnomaly } from "../anomalies";
import type { AnalysisFilters } from "../filters";
import {
  buildDrillAnomalyQuery,
  fetchBreakdownData,
  peekBreakdownData,
} from "../query";
import { topicMetric } from "../topics";
import type { AnalysisMetric, AnalysisTopic } from "../types";

/** Small debounce so several rapid drill clicks only issue the last query. */
const DEBOUNCE_MS = 120;

export interface DrillAnomalyResult {
  /** Rolling-baseline scores for the drilled day, keyed by dimension value. */
  anomalies: Map<string, DrillAnomaly>;
  /** Metric the rolling-baseline comparison is based on (null outside drill). */
  metric: AnalysisMetric | null;
  loading: boolean;
  error: string | null;
}

interface AnomalyState {
  rows: ChartDataRow[];
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE: AnomalyState = { rows: [], loading: false, error: null };

/** Metric the trend chart flags; the drill view attributes its anomaly. */
export function drillAnomalyMetric(
  topic: AnalysisTopic,
): AnalysisMetric | null {
  const key = topic.comparisonMetric ?? topic.trend.series[0]?.metric;
  return key ? topicMetric(topic, key) : null;
}

/**
 * Root-cause attribution for the drill view.
 *
 * The drill chart only has one day of rows, so a category's own rolling
 * baseline has to come from history: this fetches the anomaly metric per
 * dimension value for the last ``DRILL_ANOMALY_ROWS`` days and runs the same
 * detector as the trend chart.  Results are cached by the shared chart-data
 * cache, so re-visiting a drilled day needs no request.
 */
export function useDrillAnomalies(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): DrillAnomalyResult {
  const metric = useMemo(() => drillAnomalyMetric(topic), [topic]);
  const query = useMemo(
    () => buildDrillAnomalyQuery(topic, filters),
    [topic, filters],
  );
  const queryKey = useMemo(
    () => (query ? JSON.stringify(query) : null),
    [query],
  );
  const [state, setState] = useState<AnomalyState>(EMPTY_STATE);

  useEffect(() => {
    if (!query || !queryKey) {
      setState(EMPTY_STATE);
      return undefined;
    }
    const cached = peekBreakdownData(query, { allowStale: false });
    if (cached) {
      setState({ rows: cached.rows, loading: false, error: cached.error });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setState((previous) => ({
      rows: previous.rows,
      loading: true,
      error: null,
    }));

    const timer = setTimeout(() => {
      fetchBreakdownData(query, { signal: controller.signal })
        .then((data) => {
          if (!active) return;
          setState({ rows: data.rows, loading: false, error: data.error });
        })
        .catch((error: unknown) => {
          if (!active || controller.signal.aborted) return;
          setState({
            rows: [],
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
    // `queryKey` captures every query input; `query` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const anomalies = useMemo(() => {
    if (!metric || !filters.focusDate || state.rows.length === 0) {
      return new Map<string, DrillAnomaly>();
    }
    return detectDrillAnomalies(
      metric,
      state.rows,
      filters.dimension,
      filters.focusDate,
    );
  }, [metric, filters.dimension, filters.focusDate, state.rows]);

  return {
    anomalies,
    metric,
    loading: state.loading,
    error: state.error,
  };
}
