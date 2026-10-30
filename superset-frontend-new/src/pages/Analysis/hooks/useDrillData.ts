import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import type { ChartDataRow } from "@/types/api";
import { detectDrillAnomalies, type DrillAnomaly } from "../anomalies";
import type { AnalysisFilters } from "../filters";
import {
  buildDrillQueryPlan,
  fetchBreakdownData,
  peekBreakdownData,
} from "../query";
import { ANALYSIS_TIME_COLUMN } from "../topics";
import type { AnalysisMetric, AnalysisTopic } from "../types";
import { drillAnomalyMetric } from "./useDrillAnomalies";

export interface DrillData {
  /** Focus-day rows used by the drill chart and table. */
  rows: ChartDataRow[];
  /** Rolling-baseline attribution keyed by dimension value. */
  anomalies: Map<string, DrillAnomaly>;
  metric: AnalysisMetric | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const EMPTY: DrillData = {
  rows: [],
  anomalies: new Map(),
  metric: null,
  loading: false,
  error: null,
  refresh: () => {},
};

function isFocusDate(row: ChartDataRow, focusDate: string): boolean {
  const date = dayjs(row[ANALYSIS_TIME_COLUMN] ?? row.__timestamp);
  return date.isValid() && date.format("YYYY-MM-DD") === focusDate;
}

/**
 * Single-query drill data.
 *
 * The combined query fetches every breakdown metric at (dimension × date) over
 * the attribution lookback. The focus day's rows feed the chart/table and the
 * same rows' history feeds the rolling-baseline attribution, so a date drill
 * costs one remote query instead of the previous two.
 */
export function useDrillData(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): DrillData {
  const metric = useMemo(() => drillAnomalyMetric(topic), [topic]);
  const query = useMemo(() => buildDrillQueryPlan(topic, filters), [
    filters,
    topic,
  ]);
  const queryKey = useMemo(
    () => (query ? JSON.stringify(query) : null),
    [query],
  );
  const [state, setState] = useState<{
    rows: ChartDataRow[];
    loading: boolean;
    error: string | null;
    ready: boolean;
  }>({ rows: [], loading: false, error: null, ready: false });
  const [refreshToken, setRefreshToken] = useState(0);
  const forceRef = useRef(false);
  const refresh = useCallback(() => {
    forceRef.current = true;
    setRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!query || !queryKey) {
      setState({ rows: [], loading: false, error: null, ready: false });
      return undefined;
    }
    const force = forceRef.current;
    forceRef.current = false;
    const cached = force
      ? undefined
      : peekBreakdownData(query, { allowStale: false });
    if (cached) {
      setState({
        rows: cached.rows,
        loading: false,
        error: cached.error,
        ready: true,
      });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));
    fetchBreakdownData(query, { signal: controller.signal, force })
      .then((data) => {
        if (!active) return;
        setState({
          rows: data.rows,
          loading: false,
          error: data.error,
          ready: true,
        });
      })
      .catch((requestError: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState({
          rows: [],
          loading: false,
          error:
            requestError instanceof Error
              ? requestError.message
              : String(requestError),
          ready: true,
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
    // `queryKey` captures every query input; the query object is derived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, refreshToken]);

  const rows = useMemo(() => {
    if (!filters.focusDate) return [];
    return state.rows.filter((row) => isFocusDate(row, filters.focusDate!));
  }, [filters.focusDate, state.rows]);

  const anomalies = useMemo(() => {
    if (!filters.focusDate || !metric || !state.ready) return new Map();
    return detectDrillAnomalies(
      metric,
      state.rows,
      filters.dimension,
      filters.focusDate,
    );
  }, [filters.dimension, filters.focusDate, metric, state.ready, state.rows]);

  if (!filters.focusDate) return EMPTY;

  return {
    rows,
    anomalies,
    metric,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
