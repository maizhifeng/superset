import axios, { InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const TOKEN_KEY = 'superset_token';
const REFRESH_TOKEN_KEY = 'superset_refresh_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common.Authorization;
  }
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setStoredRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

let csrfToken: string | null = null;

async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  try {
    const token = getStoredToken();
    const res = await axios.get('/api/v1/security/csrf_token/', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    csrfToken = res.data?.result ?? null;
    return csrfToken;
  } catch {
    return null;
  }
}

api.interceptors.request.use(async config => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.method && !['get', 'head', 'options'].includes(config.method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) {
      config.headers['X-CSRFToken'] = csrf;
    }
  }
  return config;
});

// --- Token refresh state ---
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await axios.post(
      '/api/v1/security/refresh',
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

interface RetryRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config as RetryRequestConfig | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      const refreshToken = getStoredRefreshToken();

      if (refreshToken && !window.location.pathname.includes('/login')) {
        if (isRefreshing) {
          return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(newToken => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const newToken = await refreshAccessToken();
        isRefreshing = false;

        if (newToken) {
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }

        processQueue(error, null);
        clearAuth();
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      clearAuth();
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 400 && originalRequest?.url?.includes('/chart/data')) {
      return Promise.resolve({ data: { result: [{}] } } as any);
    }
    return Promise.reject(error);
  },
);

function clearAuth() {
  setStoredToken(null);
  setStoredRefreshToken(null);
  localStorage.removeItem('superset_user');
}

// --- JWT expiration check ---
function getTokenExpiration(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
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
  if (ttl <= 0) {
    return;
  }

  const refreshAt = ttl - 60_000;
  if (refreshAt <= 0) {
    return;
  }

  refreshTimer = setTimeout(async () => {
    const newToken = await refreshAccessToken();
    if (newToken) {
      setupTokenRefresh();
    }
  }, refreshAt);
}

export function cancelTokenRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

export default api;
