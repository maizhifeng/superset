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

/**
 * API entry point.  Re-exports the shared axios instance and all the auth /
 * cache helpers so callers can keep importing from `@/api`.
 *
 * The implementation is split into cohesive modules (see client.ts for the
 * axios instance + interceptors, tokenStorage.ts for token persistence,
 * csrf.ts, refresh.ts and datasetCache.ts).
 */
export { default, DEFAULT_TIMEOUT_MS, QUERY_TIMEOUT_MS } from "@/api/client";

export {
  getStoredToken,
  setStoredToken,
  getStoredBackupToken,
  setStoredBackupToken,
  getStoredBackupRefreshToken,
  setStoredBackupRefreshToken,
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

export { getDataset, getMetricFormatMap } from "@/api/datasetCache";
