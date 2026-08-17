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

/**
 * The shared axios instance plus its request/response interceptors.
 *
 * Request interceptor: attach the bearer token and, for non-idempotent
 * methods, the CSRF header.  Response interceptor: transparently refresh on
 * 401 (coalescing concurrent refreshes) and retry once with a fresh CSRF
 * token on CSRF failures.
 */

const api = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
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
        clearAuthAndBackup();
        if (!isOnLogin()) {
          window.location.href = "/login?reason=session_expired";
        }
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }

      clearAuthAndBackup();
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
