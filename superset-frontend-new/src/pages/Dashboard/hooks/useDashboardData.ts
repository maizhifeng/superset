/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useState, useCallback, useRef } from "react";
import { isCancelledError } from "@tanstack/react-query";
import type {
  ChartData,
  ChartDataPayload,
  ChartDataRow,
  FormData,
} from "@/types/api";
import { queryClient } from "@/api/queryClient";
import { useAuthStore } from "@/store/authStore";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import {
  fetchChartData,
  type ChartDataResult,
} from "@/utils/query/buildChartDataRequest";

export function parseChartConfig(chart: ChartData): FormData {
  const raw = chart.params || chart.form_data || "{}";
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  const fd =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return {
    ...fd,
    datasource:
      (typeof fd.datasource === "string" && fd.datasource) ||
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

/** Resolve a chart's datasource id from its meta or saved form_data. */
export function chartDatasourceId(chart: ChartData): number {
  if (chart.datasource_id) return chart.datasource_id;
  const fd = parseChartConfig(chart);
  return fd.datasource ? Number(String(fd.datasource).split("__")[0]) || 0 : 0;
}

interface FetchResult extends ChartDataResult {
  id: number;
}

type BatchFetchResult =
  | { status: "success"; cid: number; result: FetchResult }
  | { status: "error"; cid: number; error: string };

/**
 * React-query cache key for one chart fetch.  The filter fingerprint is part
 * of the key for every fetch — forced ones included — so react-query never
 * joins an in-flight request that was built with the previous filters (that
 * would resolve the newer conditions with the older response) and caches by
 * filters + page.
 */
function chartDataKey(
  cid: number,
  sig: string | undefined,
  page: number,
  sessionId: string | null,
): string[] {
  return [
    "chart-data",
    sessionId ?? "anonymous",
    String(cid),
    sig ?? "force",
    String(page),
  ];
}

/**
 * Merge one chart's optional rows into a per-chart map.  Rows the latest
 * fetch did not produce (e.g. the wide-table path returns no backend totals)
 * delete the chart's previous entry instead of keeping stale rows around.
 */
export function upsertRows<T>(
  prev: Record<number, T>,
  chartId: number,
  rows: T | undefined,
): Record<number, T> {
  const next = { ...prev };
  if (rows) next[chartId] = rows;
  else delete next[chartId];
  return next;
}

export function useDashboardData() {
  const sessionId = useAuthStore((state) => state.sessionId);
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
   * getChartDataWithFilters bumps the epoch; a call superseded by a newer one
   * resolves to null instead of returning partial maps, so a slow request
   * that finishes after a faster, newer one can never clobber or dilute the
   * newer data.
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
      const errorMap: Record<number, string> = {};
      // Charts used to be fetched three at a time.  On a dashboard where one
      // card is a pivot table the pivot request dominates its batch, so the
      // remaining cards only started after it finished, roughly doubling the
      // first paint.  Six keeps a normal dashboard's cards in one wave while
      // still bounding load on dashboards with many charts.
      const CONCURRENCY = 6;
      for (let i = 0; i < chartIds.length; i += CONCURRENCY) {
        const batch = chartIds.slice(i, i + CONCURRENCY);

        // Fingerprint the active filters over the batch's datasources for
        // every fetch — forced ones included — so each filter state gets its
        // own cache key.  Forced fetches also drop the chart's cached entries
        // up front: staleTime 0 alone would still refetch, but only a fresh
        // key guarantees an overlapping newer filter change cannot dedupe
        // onto this request or serve it later.
        const dsIds = batch
          .map((cid) => {
            const chart = metaMap[cid];
            return chart ? chartDatasourceId(chart) : 0;
          })
          .filter(Boolean);
        const sig = JSON.stringify(dsIds.map((id) => buildFn(id)));
        if (force) {
          for (const cid of batch) {
            queryClient.removeQueries({
              queryKey: ["chart-data", sessionId ?? "anonymous", String(cid)],
            });
          }
        }

        const results = await Promise.all(
          batch.map(async (cid): Promise<BatchFetchResult | null> => {
            try {
              const result = await queryClient.fetchQuery<FetchResult>({
                queryKey: chartDataKey(cid, sig, page ?? 0, sessionId),
                staleTime: force ? 0 : 30_000,
                queryFn: () =>
                  fetchChartWithTotal(
                    cid,
                    metaMap,
                    buildAdhocFilters,
                    force,
                    page,
                  ),
              });
              return { status: "success", cid, result };
            } catch (error) {
              if (isCancelledError(error)) return null;
              return {
                status: "error",
                cid,
                error: parseErrorMessage(error, "图表加载失败"),
              };
            }
          }),
        );
        for (const entry of results) {
          if (entry === null) return null;
          if (entry.status === "error") {
            errorMap[entry.cid] = entry.error;
            continue;
          }
          const result = entry.result;
          dataMap[result.id] = result.data;
          totalRowMap[result.id] = result.totalRow;
          if (result.pivotTotalRows)
            pivotTotalRowsMap[result.id] = result.pivotTotalRows;
          if (result.pivotSubtotalRows)
            pivotSubtotalRowsMap[result.id] = result.pivotSubtotalRows;
          if (result.hasMore !== undefined)
            hasMoreMap[result.id] = result.hasMore;
        }
      }
      // A newer call superseded this one mid-flight: report nothing so
      // callers keep their previous state instead of merging a partial
      // result that mixes old- and new-condition charts.
      if (epoch !== epochRef.current) return null;
      return {
        dataMap,
        totalRowMap,
        pivotTotalRowsMap,
        pivotSubtotalRowsMap,
        hasMoreMap,
        errorMap,
      };
    },
    [fetchChartWithTotal, buildAdhocFiltersRef, sessionId],
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
