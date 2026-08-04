import { useState, useCallback, useRef } from "react";
import type {
  ChartData,
  ChartDataPayload,
  ChartDataRow,
  FormData,
} from "@/types/api";
import api from "@/api";

import { buildQueryObject } from "@/utils/query/extractQueryFields";
import type { ChartDataResponseResult } from "@/utils/query/types";
import { isFederatedDataset } from "@/config/federatedDatasets";

function getChartDataUrl(dsId: number): string {
  return isFederatedDataset(dsId) ? "/bi/chart/data" : "/chart/data";
}

export { buildQueryObject };

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

interface FetchResult {
  id: number;
  data: ChartDataPayload;
  totalRow: ChartDataRow | null;
  pivotTotalRows?: ChartDataRow[];
  pivotSubtotalRows?: ChartDataRow[][];
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

  const buildAdhocFiltersRef = useRef<
    (
      dsId: number,
    ) => { subject: string; operator: string; comparator: unknown }[]
  >(() => []);

  const fetchChartWithTotal = useCallback(
    async (
      cid: number,
      metaMap: Record<number, ChartData>,
      buildAdhocFilters?: (
        dsId: number,
      ) => { subject: string; operator: string; comparator: unknown }[],
      force?: boolean,
      page?: number,
    ): Promise<FetchResult & { hasMore?: boolean }> => {
      const chart = metaMap[cid];
      if (!chart) return { id: cid, data: {}, totalRow: null };
      try {
        const fd = parseChartConfig(chart);
        const dsId =
          chart.datasource_id ||
          (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : 0);
        if (!dsId) return { id: cid, data: {}, totalRow: null };

        const query = buildQueryObject(fd, chart.viz_type);
        if (!query.metrics || (query.metrics as unknown[]).length === 0)
          return { id: cid, data: {}, totalRow: null };

        const isPivot = chart.viz_type === "pivot_table_v2";
        const pageSize = 50;
        if (isPivot) {
          query.row_limit = 10000;
        } else if (page != null) {
          query.row_limit = pageSize + 1;
          query.row_offset = page * pageSize;
        }

        const buildFn = buildAdhocFilters ?? buildAdhocFiltersRef.current;
        const adhocFilters = buildFn(dsId);
        if (adhocFilters.length > 0) {
          query.filters = adhocFilters.map((f) => ({
            col: f.subject,
            op: f.operator,
            val: f.comparator as string | string[],
          }));
        }

        const queries = [query];
        const totalQuery = buildQueryObject(fd, chart.viz_type);
        if (isPivot) {
          // Group by the column dimensions only, so dataset-defined metrics
          // (e.g. ratios) are recomputed per their definition for the totals
          // row instead of summing the displayed cells.
          totalQuery.columns = Array.isArray(fd.groupbyColumns)
            ? [...fd.groupbyColumns]
            : [];
        } else {
          totalQuery.groupby = [];
          totalQuery.columns = [];
        }
        delete totalQuery.row_limit;
        delete totalQuery.orderby;
        delete totalQuery.timeseries_limit_metric;
        if (adhocFilters.length > 0) {
          totalQuery.filters = adhocFilters.map((f) => ({
            col: f.subject,
            op: f.operator,
            val: f.comparator as string | string[],
          }));
        }
        queries.push(totalQuery);

        const rowDims = Array.isArray(fd.groupbyRows)
          ? fd.groupbyRows
          : Array.isArray(fd.groupby)
            ? fd.groupby
            : [];
        const colDims = Array.isArray(fd.groupbyColumns)
          ? fd.groupbyColumns
          : [];
        for (let level = 0; level < rowDims.length - 1; level += 1) {
          const subtotalQuery = buildQueryObject(fd, chart.viz_type);
          subtotalQuery.groupby = [];
          subtotalQuery.columns = [...rowDims.slice(0, level + 1), ...colDims];
          delete subtotalQuery.row_limit;
          delete subtotalQuery.orderby;
          delete subtotalQuery.timeseries_limit_metric;
          if (adhocFilters.length > 0) {
            subtotalQuery.filters = adhocFilters.map((f) => ({
              col: f.subject,
              op: f.operator,
              val: f.comparator as string | string[],
            }));
          }
          queries.push(subtotalQuery);
        }

        const body: {
          datasource: { id: number; type: string };
          queries: typeof queries;
          result_format: string;
          result_type: string;
          force?: boolean;
          form_data?: FormData;
        } = {
          datasource: { id: dsId, type: chart.datasource_type || "table" },
          queries,
          result_format: "json",
          result_type: "full",
        };
        if (force) body.force = true;
        const chartDataUrl = getChartDataUrl(dsId);
        const postRes = await api.post(chartDataUrl, body);
        const results = (
          Array.isArray(postRes.data?.result) ? postRes.data.result : []
        ) as ChartDataResponseResult[];
        const first = (results[0] || {}) as ChartDataPayload;
        const totalRaw = results[1] as ChartDataResponseResult | undefined;
        const totalRow: ChartDataRow | null =
          totalRaw?.data &&
          Array.isArray(totalRaw.data) &&
          totalRaw.data.length > 0
            ? totalRaw.data[0]
            : null;

        // Client-side computed columns: sum from detail rows for accuracy.
        // Skip for federated datasets — the backend already returns the
        // correct cross-database grand total for these columns, and the
        // detail rows here are paginated (first page only) which would
        // otherwise undercount the total.
        if (
          !isFederatedDataset(dsId) &&
          totalRow &&
          first?.data &&
          Array.isArray(first.data) &&
          first.data.length > 0
        ) {
          const computedCols = ["分成后流水"];
          for (const col of computedCols) {
            if (col in totalRow && first.data.some((r) => col in r)) {
              const sum = first.data.reduce((acc, r) => {
                const v = Number(r[col]);
                return acc + (Number.isFinite(v) ? v : 0);
              }, 0);
              totalRow[col] = sum;
            }
          }
        }

        let hasMore: boolean | undefined;
        if (isPivot) {
          hasMore = false;
        } else if (page != null && first && Array.isArray(first.data)) {
          hasMore = first.data.length > pageSize;
          if (hasMore) {
            first.data = first.data.slice(0, pageSize);
          }
        }

        const pivotTotalRows: ChartDataRow[] | undefined =
          isPivot && totalRaw?.data && Array.isArray(totalRaw.data)
            ? totalRaw.data
            : undefined;
        const pivotSubtotalRows: ChartDataRow[][] | undefined = isPivot
          ? results
              .slice(2)
              .map((r) => (r?.data && Array.isArray(r.data) ? r.data : null))
              .filter((v): v is ChartDataRow[] => v !== null)
          : undefined;

        return {
          id: cid,
          data: first,
          totalRow,
          pivotTotalRows,
          pivotSubtotalRows,
          hasMore,
        };
      } catch {
        return { id: cid, data: {}, totalRow: null };
      }
    },
    [],
  );

  const getChartDataWithFilters = useCallback(
    async (
      chartIds: number[],
      metaMap: Record<number, ChartData>,
      buildAdhocFilters?: (
        dsId: number,
      ) => { subject: string; operator: string; comparator: unknown }[],
      force?: boolean,
      page?: number,
    ) => {
      const dataMap: Record<number, ChartDataPayload> = {};
      const totalRowMap: Record<number, ChartDataRow | null> = {};
      const pivotTotalRowsMap: Record<number, ChartDataRow[]> = {};
      const pivotSubtotalRowsMap: Record<number, ChartDataRow[][]> = {};
      const hasMoreMap: Record<number, boolean> = {};
      const CONCURRENCY = 3;
      for (let i = 0; i < chartIds.length; i += CONCURRENCY) {
        const batch = chartIds.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map((cid) =>
            fetchChartWithTotal(cid, metaMap, buildAdhocFilters, force, page),
          ),
        );
        results.forEach((r) => {
          dataMap[r.id] = r.data;
          totalRowMap[r.id] = r.totalRow;
          if (r.pivotTotalRows) pivotTotalRowsMap[r.id] = r.pivotTotalRows;
          if (r.pivotSubtotalRows)
            pivotSubtotalRowsMap[r.id] = r.pivotSubtotalRows;
          if (r.hasMore !== undefined) {
            hasMoreMap[r.id] = r.hasMore;
          }
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
    [fetchChartWithTotal],
  );

  const refreshChart = useCallback(
    async (
      chartId: number,
      metaMap: Record<number, ChartData>,
      buildAdhocFilters?: (
        dsId: number,
      ) => { subject: string; operator: string; comparator: unknown }[],
      page?: number,
    ): Promise<{
      data: ChartDataPayload;
      hasMore?: boolean;
      pivotTotalRows?: ChartDataRow[];
      pivotSubtotalRows?: ChartDataRow[][];
    } | null> => {
      const chart = metaMap[chartId];
      if (!chart) return null;
      try {
        const fd = parseChartConfig(chart);
        const dsId =
          chart.datasource_id ||
          (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : 0);
        if (!dsId) return null;
        const query = buildQueryObject(fd, chart.viz_type);
        if (!query.metrics || query.metrics.length === 0) return null;

        const isPivot = chart.viz_type === "pivot_table_v2";
        const pageSize = 50;
        if (isPivot) {
          query.row_limit = 10000;
        } else if (page != null) {
          query.row_limit = pageSize + 1;
          query.row_offset = page * pageSize;
        }

        const buildFn = buildAdhocFilters ?? buildAdhocFiltersRef.current;
        const adhocFilters = buildFn(dsId);
        if (adhocFilters.length > 0) {
          query.filters = adhocFilters.map((f) => ({
            col: f.subject,
            op: f.operator,
            val: f.comparator as string | string[],
          }));
        }

        const totalsQuery = isPivot
          ? buildQueryObject(fd, chart.viz_type)
          : null;
        if (totalsQuery) {
          totalsQuery.groupby = [];
          totalsQuery.columns = Array.isArray(fd.groupbyColumns)
            ? [...fd.groupbyColumns]
            : [];
          delete totalsQuery.row_limit;
          delete totalsQuery.orderby;
          delete totalsQuery.timeseries_limit_metric;
          if (adhocFilters.length > 0) {
            totalsQuery.filters = adhocFilters.map((f) => ({
              col: f.subject,
              op: f.operator,
              val: f.comparator as string | string[],
            }));
          }
        }
        const refreshRowDims = Array.isArray(fd.groupbyRows)
          ? fd.groupbyRows
          : Array.isArray(fd.groupby)
            ? fd.groupby
            : [];
        const refreshColDims = Array.isArray(fd.groupbyColumns)
          ? fd.groupbyColumns
          : [];
        const subtotalQueries: (typeof query)[] = [];
        if (isPivot) {
          for (let level = 0; level < refreshRowDims.length - 1; level += 1) {
            const subtotalQuery = buildQueryObject(fd, chart.viz_type);
            subtotalQuery.groupby = [];
            subtotalQuery.columns = [
              ...refreshRowDims.slice(0, level + 1),
              ...refreshColDims,
            ];
            delete subtotalQuery.row_limit;
            delete subtotalQuery.orderby;
            delete subtotalQuery.timeseries_limit_metric;
            if (adhocFilters.length > 0) {
              subtotalQuery.filters = adhocFilters.map((f) => ({
                col: f.subject,
                op: f.operator,
                val: f.comparator as string | string[],
              }));
            }
            subtotalQueries.push(subtotalQuery);
          }
        }
        const queries: (typeof query)[] = [query];
        if (totalsQuery) queries.push(totalsQuery);
        queries.push(...subtotalQueries);

        const payload = {
          datasource: { id: dsId, type: chart.datasource_type || "table" },
          queries,
          form_data: fd,
          result_format: "json",
          result_type: "full" as const,
          force: true,
        };
        const chartDataUrl = getChartDataUrl(dsId);
        const postRes = await api.post(chartDataUrl, payload);
        const postResult = postRes.data?.result;
        const results = Array.isArray(postResult) ? postResult : [];
        const data: ChartDataPayload = results[0] || {};
        const totalsRaw = results[1] as ChartDataResponseResult | undefined;
        const pivotTotalRows: ChartDataRow[] | undefined =
          isPivot && totalsRaw?.data && Array.isArray(totalsRaw.data)
            ? totalsRaw.data
            : undefined;
        const pivotSubtotalRows: ChartDataRow[][] | undefined = isPivot
          ? results
              .slice(2)
              .map((r) => (r?.data && Array.isArray(r.data) ? r.data : null))
              .filter((v): v is ChartDataRow[] => v !== null)
          : undefined;

        let hasMore: boolean | undefined;
        if (isPivot) {
          hasMore = false;
        } else if (page != null && data && Array.isArray(data.data)) {
          hasMore = data.data.length > pageSize;
          if (hasMore) {
            data.data = data.data.slice(0, pageSize);
          }
        }
        return { data, hasMore, pivotTotalRows, pivotSubtotalRows };
      } catch {
        return null;
      }
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
