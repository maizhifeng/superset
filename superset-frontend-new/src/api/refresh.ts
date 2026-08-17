import axios from "axios";
import {
  getStoredRefreshToken,
  getStoredToken,
  setStoredRefreshToken,
  setStoredToken,
} from "@/api/tokenStorage";

/**
 * Access-token refresh plumbing: the auth endpoint call, the proactive
 * refresh timer, and the "single in-flight refresh" queue used by the
 * response interceptor so concurrent 401s share one refresh.
 */

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

/** Whether a token refresh is currently in flight (for the interceptor). */
export function isTokenRefreshing(): boolean {
  return isRefreshing;
}

/** Set the in-flight flag while a refresh is ongoing. */
export function setRefreshing(flag: boolean): void {
  isRefreshing = flag;
}

/** Resolve the queue with a fresh token or fail every waiter. */
export function settleRefreshQueue(
  error: unknown,
  token: string | null = null,
): void {
  processQueue(error, token);
}

/** Register a waiter for the current in-flight refresh. */
export function enqueueRefreshWaiter(
  resolve: (token: string) => void,
  reject: (err: unknown) => void,
): void {
  failedQueue.push({ resolve, reject });
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await axios.post(
      "/api/v1/security/refresh",
      {},
      {
        headers: { Authorization: `Bearer ${refreshToken}` },
      },
    );
    const newAccessToken = res.data?.access_token;
    const newRefreshToken = res.data?.refresh_token;

    if (newAccessToken) {
      setStoredToken(newAccessToken);
      if (newRefreshToken) {
        setStoredRefreshToken(newRefreshToken);
      }
      return newAccessToken;
    }
    return null;
  } catch {
    return null;
  }
}

function getTokenExpiration(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function setupTokenRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);

  const token = getStoredToken();
  if (!token) return;

  const exp = getTokenExpiration(token);
  if (!exp) return;

  const now = Date.now();
  const ttl = exp - now;
  if (ttl <= 0) return;

  const refreshAt = ttl - 60_000;
  if (refreshAt <= 0) return;

  refreshTimer = setTimeout(() => {
    void (async () => {
      const newToken = await refreshAccessToken();
      if (newToken) {
        setupTokenRefresh();
      }
    })();
  }, refreshAt);
}

export function cancelTokenRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
