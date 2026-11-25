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

import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import {
  getStoredToken,
  getStoredRefreshToken,
  clearAuthAndBackup,
} from "@/api/tokenStorage";
import { ensureCsrfToken, unsetCsrfToken, fetchCsrfToken } from "@/api/csrf";
import {
  isTokenRefreshing,
  setRefreshing,
  settleRefreshQueue,
  enqueueRefreshWaiter,
  refreshAccessToken,
} from "@/api/refresh";
import { emitAuthExpired } from "@/api/authEvents";
import { clearQueryCache } from "@/api/queryClient";

/**
 * The shared axios instance plus its request/response interceptors.
 *
 * Request interceptor: attach the bearer token and, for non-idempotent
 * methods, the CSRF header.  Response interceptor: transparently refresh on
 * 401 (coalescing concurrent refreshes) and retry once with a fresh CSRF
 * token on CSRF failures.
 */

/** Default timeout for ordinary API calls. */
export const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Timeout for data-query endpoints (chart data, wide pivot data and SQL Lab
 * execution).  These can legitimately run much longer than regular CRUD
 * calls, so they get a separate, more permissive budget.
 */
export const QUERY_TIMEOUT_MS = 300_000;

const api = axios.create({
  baseURL: "/api/v1",
  timeout: DEFAULT_TIMEOUT_MS,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.method && !["get", "head", "options"].includes(config.method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) {
      config.headers["X-CSRFToken"] = csrf;
    }
  }
  return config;
});

interface RetryRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

function expireSession(): void {
  clearAuthAndBackup();
  delete api.defaults.headers.common.Authorization;
  clearQueryCache();
  emitAuthExpired();
}

function isOnLogin(): boolean {
  return window.location.pathname.includes("/login");
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      const refreshToken = getStoredRefreshToken();

      if (refreshToken && !isOnLogin()) {
        if (isTokenRefreshing()) {
          return new Promise<string>((resolve, reject) => {
            enqueueRefreshWaiter(resolve, reject);
          }).then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          });
        }

        originalRequest._retry = true;
        setRefreshing(true);

        const newToken = await refreshAccessToken();
        setRefreshing(false);

        if (newToken) {
          settleRefreshQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }

        settleRefreshQueue(error, null);
        expireSession();
        if (!isOnLogin()) {
          window.location.href = "/login?reason=session_expired";
        }
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }

      expireSession();
      if (!isOnLogin()) {
        window.location.href = "/login?reason=session_expired";
      }
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    // Retry with a fresh CSRF token if the session token was missing.
    if (
      error.response?.status === 400 &&
      originalRequest &&
      !originalRequest._retry &&
      /CSRF/i.test(JSON.stringify(error.response.data))
    ) {
      unsetCsrfToken();
      const newCsrf = await fetchCsrfToken();
      if (newCsrf) {
        originalRequest._retry = true;
        originalRequest.headers["X-CSRFToken"] = newCsrf;
        return api(originalRequest);
      }
    }

    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  },
);

export default api;
