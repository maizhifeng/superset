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
    ): Promise<FetchResult> => {
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
        return { id: cid, data: first, totalRow };
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
    ) => {
      const dataMap: Record<number, Record<string, unknown>> = {};
      const totalRowMap: Record<number, Record<string, unknown> | null> = {};
      const CONCURRENCY = 3;
      for (let i = 0; i < chartIds.length; i += CONCURRENCY) {
        const batch = chartIds.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map((cid) =>
            fetchChartWithTotal(cid, metaMap, buildAdhocFilters, force),
          ),
        );
        results.forEach((r) => {
          dataMap[r.id] = r.data;
          totalRowMap[r.id] = r.totalRow;
        });
      }
      return { dataMap, totalRowMap };
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
    ) => {
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
        return Array.isArray(postResult)
          ? postResult[0] || {}
          : postResult || {};
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
