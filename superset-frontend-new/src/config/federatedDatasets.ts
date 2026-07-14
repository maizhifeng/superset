/**
 * Federated dataset configuration.
 *
 * Dataset IDs that are bound for cross-database queries.
 * When a filter box queries values for a federated dataset,
 * it should use the bi filter-values endpoint to get merged
 * values from both databases.
 *
 * IMPORTANT: This Set must be kept in sync with the equivalent config in
 * superset-frontend/src/config/federatedDatasets.ts.
 *
 * To add a new federated dataset, add its dataset ID to this Set in BOTH files.
 */
export const FEDERATED_DATASETS: Set<number> = new Set([
  26,  // ad_combined_report <-> ad_operate_data_report
]);

export function isFederatedDataset(datasetId: number | undefined): boolean {
  if (datasetId === undefined) return false;
  return FEDERATED_DATASETS.has(datasetId);
}
