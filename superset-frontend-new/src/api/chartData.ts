/**
 * Unified chart-data request helper.
 *
 * Federated datasets (see @/config/federatedDatasets) must be queried
 * through the dedicated ``/api/v1/bi/chart/data`` endpoint so the backend
 * merges results from both databases.  This module picks the correct
 * endpoint based on the datasource id in the payload, keeping callers
 * (daily/weekly reports, drill-down, chart insight, AI query tool, ...)
 * from hardcoding the URL themselves.
 */

import api, { QUERY_TIMEOUT_MS } from "@/api";
import { isFederatedDataset } from "@/config/federatedDatasets";

export function getChartDataUrl(dsId: number | undefined): string {
  return isFederatedDataset(dsId) ? "/bi/chart/data" : "/chart/data";
}

export async function postChartData(
  payload: Record<string, unknown>,
  config?: { signal?: AbortSignal },
) {
  const dsId = (payload.datasource as { id?: number } | undefined)?.id;
  return api.post(getChartDataUrl(dsId), payload, {
    timeout: QUERY_TIMEOUT_MS,
    ...config,
  });
}

/**
 * POST the analysis page's topic queries to the backend SQL executor.
 *
 * Topics marked ``backendSql`` do not read a Superset dataset: the backend
 * compiles the query around the topic's own trimmed SQL and runs it on both
 * federated sides, returning the same ``{result: [...]}`` shape as
 * ``/bi/chart/data``.
 */
export function postAnalysisChartData(
  payload: Record<string, unknown>,
  config?: { signal?: AbortSignal },
) {
  return api.post("/bi/analysis/chart-data", payload, {
    timeout: QUERY_TIMEOUT_MS,
    ...config,
  });
}

/** SQL returned by ``/bi/analysis/sql`` for the "查看 SQL" dialog. */
export interface AnalysisSqlPreview {
  topic: string;
  title: string;
  base_sql: { mainland: string; oversea: string; wide_mainland?: string };
  queries: {
    index: number;
    mainland_sql: string;
    oversea_sql: string;
    /** Same query compiled against the historical wide view (for comparison). */
    wide_mainland_sql?: string;
    labels: string[];
  }[];
}

/** Compile (without executing) the SQL a topic would run for these queries. */
export function fetchAnalysisTopicSql(
  topic: string,
  queries: Record<string, unknown>[],
  config?: { signal?: AbortSignal },
) {
  return api.post<{ result: AnalysisSqlPreview }>(
    "/bi/analysis/sql",
    { topic, queries },
    { timeout: QUERY_TIMEOUT_MS, ...config },
  );
}
