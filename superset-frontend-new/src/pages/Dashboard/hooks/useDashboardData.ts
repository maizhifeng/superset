import { useState, useCallback, useRef } from "react";
import type { ChartData } from "@/types/api";
import api from "@/api";
import { buildQueryObject } from "@/utils/query/extractQueryFields";
import type { SimpleFilter } from "@/utils/query/types";

export { buildQueryObject };

export function parseChartConfig(chart: ChartData): Record<string, unknown> {
  const raw = chart.params || chart.form_data || "{}";
  const fd = typeof raw === "string" ? JSON.parse(raw) : raw;
  return {
    ...fd,
    datasource:
      fd.datasource ||
      `${chart.datasource_id}__${chart.datasource_type || "table"}`,
  };
}

interface FetchResult {
  id: number;
  data: Record<string, unknown>;
  totalRow: Record<string, unknown> | null;
}

export function useDashboardData() {
  const [chartMeta, setChartMeta] = useState<Record<number, ChartData>>({});
  const [chartData, setChartData] = useState<
    Record<number, Record<string, unknown>>
  >({});
  const [totalRows, setTotalRows] = useState<
    Record<number, Record<string, unknown> | null>
  >({});
  const [otherRows, setOtherRows] = useState<
    Record<number, Record<string, unknown> | null>
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

        const pageSize = 50;
        if (page != null) {
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
          })) as SimpleFilter[];
        }

        const queries = [query];
        const totalQuery = buildQueryObject(fd, chart.viz_type);
        totalQuery.groupby = [];
        totalQuery.columns = [];
        delete totalQuery.row_limit;
        delete totalQuery.orderby;
        delete totalQuery.timeseries_limit_metric;
        if (adhocFilters.length > 0) {
          totalQuery.filters = adhocFilters.map((f) => ({
            col: f.subject,
            op: f.operator,
            val: f.comparator as string | string[],
          })) as SimpleFilter[];
        }
        queries.push(totalQuery);

        const body: Record<string, unknown> = {
          datasource: { id: dsId, type: chart.datasource_type || "table" },
          queries,
          result_format: "json",
          result_type: "full" as const,
        };
        if (force) body.force = true;
        const postRes = await api.post("/chart/data", body);
        const results = (
          Array.isArray(postRes.data?.result) ? postRes.data.result : []
        ) as Record<string, unknown>[];
        const first = results[0] || {};
        const totalRaw = results[1];
        const totalRow =
          totalRaw?.data &&
          Array.isArray(totalRaw.data) &&
          totalRaw.data.length > 0
            ? (totalRaw.data[0] as Record<string, unknown>)
            : null;

        let hasMore: boolean | undefined;
        if (page != null && first && Array.isArray(first.data)) {
          hasMore = first.data.length > pageSize;
          if (hasMore) {
            first.data = first.data.slice(0, pageSize);
          }
        }

        return { id: cid, data: first, totalRow, hasMore };
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
      const dataMap: Record<number, Record<string, unknown>> = {};
      const totalRowMap: Record<number, Record<string, unknown> | null> = {};
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
          if (r.hasMore !== undefined) {
            hasMoreMap[r.id] = r.hasMore;
          }
        });
      }
      return { dataMap, totalRowMap, hasMoreMap };
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
    ): Promise<{ data: Record<string, unknown>; hasMore?: boolean } | null> => {
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

        const pageSize = 50;
        if (page != null) {
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
          })) as SimpleFilter[];
        }

        const payload = {
          datasource: { id: dsId, type: chart.datasource_type || "table" },
          queries: [query],
          form_data: fd,
          result_format: "json",
          result_type: "full" as const,
          force: true,
        };
        const postRes = await api.post("/chart/data", payload);
        const postResult = postRes.data?.result;
        const data = Array.isArray(postResult)
          ? postResult[0] || {}
          : postResult || {};

        let hasMore: boolean | undefined;
        if (page != null && data && Array.isArray(data.data)) {
          hasMore = data.data.length > pageSize;
          if (hasMore) {
            data.data = data.data.slice(0, pageSize);
          }
        }
        return { data, hasMore };
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
    otherRows,
    setChartMeta,
    setChartData,
    setTotalRows,
    setOtherRows,
    buildAdhocFiltersRef,
    getChartDataWithFilters,
    fetchChartWithTotal,
    refreshChart,
  };
}
