/**
 * API entry point.  Re-exports the shared axios instance and all the auth /
 * cache helpers so callers can keep importing from `@/api`.
 *
 * The implementation is split into cohesive modules (see client.ts for the
 * axios instance + interceptors, tokenStorage.ts for token persistence,
 * csrf.ts, refresh.ts and datasetCache.ts).
 */
export { default } from "@/api/client";

export {
  getStoredToken,
  setStoredToken,
  getStoredBackupToken,
  setStoredBackupToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearAuthAndBackup,
  SWITCHED_FLAG_KEY,
} from "@/api/tokenStorage";

export { fetchCsrfToken } from "@/api/csrf";

export {
  refreshAccessToken,
  setupTokenRefresh,
  cancelTokenRefresh,
} from "@/api/refresh";

export {
  getDataset,
  getMetricFormatMap,
} from "@/api/datasetCache";
