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

import api from "@/api";
import { isFederatedDataset } from "@/config/federatedDatasets";

export function getChartDataUrl(dsId: number | undefined): string {
  return isFederatedDataset(dsId) ? "/bi/chart/data" : "/chart/data";
}

export async function postChartData(
  payload: Record<string, unknown>,
  config?: { signal?: AbortSignal },
) {
  const dsId = (payload.datasource as { id?: number } | undefined)?.id;
  return api.post(getChartDataUrl(dsId), payload, config);
}
