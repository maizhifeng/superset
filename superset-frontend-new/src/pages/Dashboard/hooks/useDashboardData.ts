import { useState, useCallback, useRef } from "react";
import type {
  ChartData,
  ChartDataPayload,
  ChartDataRow,
  FormData,
} from "@/types/api";
import { queryClient } from "@/api/queryClient";
import {
  fetchChartData,
  type ChartDataResult,
} from "@/utils/query/buildChartDataRequest";

export function parseChartConfig(chart: ChartData): FormData {
  const raw = chart.params || chart.form_data || "{}";
  const fd = typeof raw === "string" ? JSON.parse(raw) : raw;
  return {
    ...(fd as FormData),
    datasource:
      fd.datasource ||
      `${chart.datasource_id}__${chart.datasource_type || "table"}`,
  };
}

/** Filter spec returned by dashboard/editor filter builders. */
export type DashboardAdhocFilter = {
  subject: string;
  operator: string;
  comparator: unknown;
};

/** Filter-builder shape shared by the dashboard and editor. */
export type BuildAdhocFilters = (dsId: number) => DashboardAdhocFilter[];

interface FetchResult extends ChartDataResult {
  id: number;
}

/**
 * React-query cache key for one chart fetch.  The filter fingerprint makes a
 * filter change a distinct key, so react-query cancels the in-flight request
 * for the previous filters (race protection) and caches by filters + page.
 */
function chartDataKey(
  cid: number,
  sig: string | undefined,
  page: number,
): string[] {
  return ["chart-data", String(cid), sig ?? "force", String(page)];
}

export function useDashboardData() {
  const [chartMeta, setChartMeta] = useState<Record<number, ChartData>>({});
  const [chartData, setChartData] = useState<Record<number, ChartDataPayload>>(
    {},
  );
  const [totalRows, setTotalRows] = useState<
    Record<number, ChartDataRow | null>
  >({});
  const [pivotTotalRows, setPivotTotalRows] = useState<
    Record<number, ChartDataRow[]>
  >({});
  const [pivotSubtotalRows, setPivotSubtotalRows] = useState<
    Record<number, ChartDataRow[][]>
  >({});

  const buildAdhocFiltersRef = useRef<BuildAdhocFilters>(() => []);

  /**
   * Monotonic epoch guarding against out-of-order responses.  Each call to
   * getChartDataWithFilters bumps the epoch; a response captured against an
   * older epoch is stale and dropped, so a slow request that resolves after a
   * faster, newer one can never clobber the newer data.
   */
  const epochRef = useRef(0);

  const fetchChartWithTotal = useCallback(
    async (
      cid: number,
      metaMap: Record<number, ChartData>,
      buildAdhocFilters?: BuildAdhocFilters,
      force?: boolean,
      page?: number,
    ): Promise<FetchResult> => {
      const chart = metaMap[cid];
      if (!chart) return { id: cid, data: {}, totalRow: null };
      const buildFn = buildAdhocFilters ?? buildAdhocFiltersRef.current;
      const result = await fetchChartData(chart, metaMap, buildFn, {
        force,
        page,
      });
      return { id: cid, ...result };
    },
    [],
  );

  const getChartDataWithFilters = useCallback(
    async (
      chartIds: number[],
      metaMap: Record<number, ChartData>,
      buildAdhocFilters?: BuildAdhocFilters,
      force?: boolean,
      page?: number,
    ) => {
      const buildFn = buildAdhocFilters ?? buildAdhocFiltersRef.current;
      const epoch = ++epochRef.current;

      const dataMap: Record<number, ChartDataPayload> = {};
      const totalRowMap: Record<number, ChartDataRow | null> = {};
      const pivotTotalRowsMap: Record<number, ChartDataRow[]> = {};
      const pivotSubtotalRowsMap: Record<number, ChartDataRow[][]> = {};
      const hasMoreMap: Record<number, boolean> = {};
      const CONCURRENCY = 3;
      for (let i = 0; i < chartIds.length; i += CONCURRENCY) {
        const batch = chartIds.slice(i, i + CONCURRENCY);

        // Fingerprint the active filters over the batch's datasources so a
        // filter change produces a new cache key (caching + cancellation).
        const dsIds = batch
          .map((cid) => {
            const chart = metaMap[cid];
            if (!chart) return 0;
            const fd = parseChartConfig(chart);
            return (
              chart.datasource_id ||
              (fd.datasource
                ? Number(String(fd.datasource).split("__")[0])
                : 0)
            );
          })
          .filter(Boolean);
        const sig =
          force || page != null
            ? undefined
            : JSON.stringify(dsIds.map((id) => buildFn(id)));

        const results = await Promise.all(
          batch.map(async (cid) => {
            const result = await queryClient.fetchQuery<FetchResult>({
              queryKey: chartDataKey(cid, sig, page ?? 0),
              staleTime: force ? 0 : 30_000,
              queryFn: () => fetchChartWithTotal(cid, metaMap, buildAdhocFilters, force, page),
            });
            return result;
          }),
        );
        results.forEach((r) => {
          if (epoch !== epochRef.current) return;
          dataMap[r.id] = r.data;
          totalRowMap[r.id] = r.totalRow;
          if (r.pivotTotalRows) pivotTotalRowsMap[r.id] = r.pivotTotalRows;
          if (r.pivotSubtotalRows)
            pivotSubtotalRowsMap[r.id] = r.pivotSubtotalRows;
          if (r.hasMore !== undefined) hasMoreMap[r.id] = r.hasMore;
        });
      }
      return {
        dataMap,
        totalRowMap,
        pivotTotalRowsMap,
        pivotSubtotalRowsMap,
        hasMoreMap,
      };
    },
    [fetchChartWithTotal, buildAdhocFiltersRef],
  );

  const refreshChart = useCallback(
    async (
      chartId: number,
      metaMap: Record<number, ChartData>,
      buildAdhocFilters?: BuildAdhocFilters,
      page?: number,
    ): Promise<(ChartDataResult & { hasMore?: boolean }) | null> => {
      const chart = metaMap[chartId];
      if (!chart) return null;
      const buildFn = buildAdhocFilters ?? buildAdhocFiltersRef.current;
      const result = await fetchChartData(chart, metaMap, buildFn, {
        force: true,
        page,
        includeFormData: true,
      });
      return result;
    },
    [],
  );

  return {
    chartMeta,
    chartData,
    totalRows,
    pivotTotalRows,
    pivotSubtotalRows,
    setChartMeta,
    setChartData,
    setTotalRows,
    setPivotTotalRows,
    setPivotSubtotalRows,
    buildAdhocFiltersRef,
    getChartDataWithFilters,
    fetchChartWithTotal,
    refreshChart,
  };
}
