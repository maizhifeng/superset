import api from "@/api/client";

/**
 * Small in-memory dataset cache with a TTL.  Backs `getDataset` so column
 * metadata is not re-fetched on every metric-format lookup, and invalidates
 * an entry the moment the upstream request fails.
 */

const datasetCache = new Map<string, Promise<unknown>>();
const DATASET_CACHE_TTL = 30_000;

/** Fetch a dataset, memoized per id for DATASET_CACHE_TTL milliseconds. */
export function getDataset<T = unknown>(id: number | string): Promise<T> {
  const key = String(id);
  const cached = datasetCache.get(key);
  if (cached) return cached as Promise<T>;
  const promise = api
    .get<{ result: T }>(`/dataset/${key}`)
    .then((res) => {
      setTimeout(() => datasetCache.delete(key), DATASET_CACHE_TTL);
      return res.data.result;
    })
    .catch((err) => {
      datasetCache.delete(key);
      throw err;
    });
  datasetCache.set(key, promise);
  return promise;
}

/** Build a metric-name -> d3format map for a dataset. */
export async function getMetricFormatMap(
  dsId: number,
): Promise<Record<string, string>> {
  const dataset = await getDataset<{
    metrics: { metric_name: string; d3format: string | null }[];
  }>(dsId);
  const map: Record<string, string> = {};
  for (const m of dataset.metrics ?? []) {
    if (m.d3format) map[m.metric_name] = m.d3format;
  }
  return map;
}
