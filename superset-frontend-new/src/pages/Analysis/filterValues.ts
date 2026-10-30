import api from "@/api";
import { ANALYSIS_DATASET_ID } from "./topics";

/**
 * Distinct values for one filter column, cached per column.
 *
 * The analysis dataset is federated (domestic + oversea), so values must come
 * from the BI endpoint; the generic datasource endpoint only sees the primary
 * side and would hide oversea games/media.
 *
 * Every topic page mounts the same filter bar and asks for the same five
 * columns, so responses are kept for {@link FILTER_VALUES_TTL_MS} and
 * concurrent callers share a single in-flight request.  Aborting one caller
 * only rejects that caller's promise; the shared request keeps running so the
 * cache still warms up for the next mount.
 */

/** How long a distinct-value response stays reusable (five minutes). */
export const FILTER_VALUES_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  values: string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string[]>>();

/** Cache identity: the request depends on both dataset and column. */
function cacheKey(column: string): string {
  return `${ANALYSIS_DATASET_ID}:${column}`;
}

function normalizeValues(raw: (string | number | null)[]): string[] {
  const values = raw
    .filter((value): value is string | number => value !== null)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return Array.from(new Set(values)).sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}

async function requestFilterValues(column: string): Promise<string[]> {
  const response = await api.get<{ result?: (string | number | null)[] }>(
    `/bi/filter-values/${ANALYSIS_DATASET_ID}/${encodeURIComponent(column)}/`,
  );
  return normalizeValues(response.data?.result ?? []);
}

/** DOMException is not guaranteed in every runtime; a named Error suffices. */
function abortError(): Error {
  const error = new Error("请求已取消");
  error.name = "AbortError";
  return error;
}

/**
 * Reject as soon as the caller aborts without cancelling the shared request.
 * Callers that ignore abort (or pass no signal) simply await the request.
 */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    const handleAbort = () => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        // Promise rejections must carry an Error; wrapped once here instead
        // of leaking unknown values to callers.
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Distinct values for a filter column, reusing the five-minute cache.
 *
 * @param column dataset column name (for example ``主游戏``)
 * @param signal optional abort signal for the awaiting caller only
 */
export async function fetchFilterValues(
  column: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const key = cacheKey(column);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.values;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = requestFilterValues(column)
      .then((values) => {
        cache.set(key, {
          values,
          expiresAt: Date.now() + FILTER_VALUES_TTL_MS,
        });
        return values;
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, pending);
  }
  return abortable(pending, signal);
}

/** Drop every cached and in-flight value (used by tests and force refresh). */
export function clearFilterValuesCache(): void {
  cache.clear();
  inFlight.clear();
}
