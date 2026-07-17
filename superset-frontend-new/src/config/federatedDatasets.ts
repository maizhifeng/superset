/**
 * Federated dataset configuration.
 *
 * Dataset IDs that are bound for cross-database queries.
 * When a filter box queries values for a federated dataset,
 * it should use the bi filter-values endpoint to get merged
 * values from both databases.
 *
 * The hardcoded Set below is the initial/fallback list.  At runtime the
 * frontend calls ``GET /api/v1/bi/federated-datasets`` and merges the
 * authoritative server-side list into this Set (see ``refreshFederatedDatasets``),
 * so the two sources of truth stay in sync without manual edits.
 *
 * To add a new federated dataset the preferred path is to bind it via the
 * dataset list UI (which writes ``extra.federated``); the backend then
 * reports it through ``/bi/federated-datasets``.  Only keep IDs here as a
 * fallback for environments where that endpoint is unavailable.
 */
export const FEDERATED_DATASETS: Set<number> = new Set([
  26, // ad_combined_report <-> ad_operate_data_report
]);

let initialized = false;

export function isFederatedDataset(datasetId: number | undefined): boolean {
  if (datasetId === undefined) return false;
  return FEDERATED_DATASETS.has(datasetId);
}

/**
 * Fetch the authoritative federated dataset list from the backend and merge it
 * into {@link FEDERATED_DATASETS}.  Idempotent per session (runs once).  Falls
 * back silently to the hardcoded set on any error.
 */
export async function refreshFederatedDatasets(
  apiGet: (path: string) => Promise<{ data?: { result?: number[] } }>,
): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const res = await apiGet("/bi/federated-datasets");
    const ids = res.data?.result;
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === "number") FEDERATED_DATASETS.add(id);
      }
    }
  } catch {
    // Keep using the hardcoded fallback set.
  }
}
