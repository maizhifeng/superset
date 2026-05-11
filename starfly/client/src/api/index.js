// ============================================================
// API 层 — axios 实例、CSRF token 管理、401 自动刷新
// ============================================================
// 核心特性：
//   1. CSRF token 自动注入：仅对 POST/PUT/PATCH/DELETE 添加
//   2. 401 自动刷新：使用 refreshPromise 锁避免并发重复刷新
//   3. CSRF 403 自动重试：刷新 token 后重试原始请求一次
// ============================================================
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// 认证存储 key
const TOKEN_KEY = 'bi_dashboard_token';
const USER_KEY = 'bi_dashboard_user';
const REFRESH_TOKEN_KEY = 'bi_dashboard_refresh_token';
const REMEMBER_KEY = 'bi_dashboard_remember';

let csrfToken = null;
let refreshPromise = null;

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  delete api.defaults.headers.common['Authorization'];
}

/**
 * 从服务端获取 CSRF token
 */
async function fetchCsrfToken() {
  try {
    const response = await axios.get('/api/csrf-token', { withCredentials: true });
    if (response.data?.success && response.data?.csrfToken) {
      csrfToken = response.data.csrfToken;
    }
  } catch (error) {}
}

/**
 * 获取 CSRF token（缓存未命中时自动请求）
 * @returns {string|null}
 */
async function getCsrfToken() {
  if (!csrfToken) {
    await fetchCsrfToken();
  }
  return csrfToken;
}

// 请求拦截器 — 为写操作注入 CSRF token
api.interceptors.request.use(
  async (config) => {
    const protectedMethods = ['post', 'put', 'patch', 'delete'];
    if (protectedMethods.includes(config.method?.toLowerCase())) {
      const token = await getCsrfToken();
      if (token) {
        config.headers['X-CSRF-Token'] = token;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器 — 处理 401 自动刷新和 CSRF 403 重试
api.interceptors.response.use(
  (response) => {
    if (response.headers['x-csrf-token']) {
      csrfToken = response.headers['x-csrf-token'];
    }
    return response.data;
  },
  async (error) => {
    // 401 — token 过期，尝试静默刷新
    if (error.response?.status === 401) {
      const url = error.config?.url || '';

      if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      // 已有刷新请求在进行中，等待后重试
      if (refreshPromise) {
        try {
          await refreshPromise;
          const newToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
          if (newToken) {
            error.config.headers.Authorization = `Bearer ${newToken}`;
            return axios(error.config);
          }
        } catch {}
        return Promise.reject(error);
      }

      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) || sessionStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) {
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      refreshPromise = (async () => {
        const res = await axios.post('/api/auth/refresh', { refreshToken: storedRefreshToken }, {
          headers: { 'Content-Type': 'application/json' },
          withCredentials: true,
        });
        const data = res.data;
        if (!data.success || !data.token) {
          throw new Error('刷新 token 失败');
        }
        const remember = localStorage.getItem(REMEMBER_KEY) !== 'false';
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem(TOKEN_KEY, data.token);
        storage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      })();

      try {
        await refreshPromise;
        const newToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
        if (newToken) {
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return axios(error.config);
        }
      } finally {
        refreshPromise = null;
      }

      clearAuth();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // CSRF 403 — token 过期，刷新后重试一次
    if (error.response?.status === 403 && error.response?.data?.error?.includes('CSRF')) {
      csrfToken = null;
      await fetchCsrfToken();

      const originalRequest = error.config;
      if (csrfToken && !originalRequest._csrfRetry) {
        originalRequest._csrfRetry = true;
        originalRequest.headers['X-CSRF-Token'] = csrfToken;
        return axios(originalRequest);
      }
    }

    const message = error.response?.data?.error || error.message;
    return Promise.reject(new Error(message));
  }
);

export const dbAPI = {
  testConnection: (config) => api.post('/db/test', config),
  testConnectionWithTables: (config) => api.post('/db/test-with-tables', config),
  connect: (config) => api.post('/db/connect', config),
  getTables: () => api.get('/db/tables'),
  getTableColumns: (tableName, schema = 'public') => api.get(`/db/tables/${tableName}/columns?schema=${schema}`),
  executeQuery: (sql, params = []) => api.post('/db/query', { sql, params }),
  getConnections: () => api.get('/db/connections'),
  saveConnection: (config) => api.post('/db/connections', config),
  updateConnection: (id, config) => api.put(`/db/connections/${id}`, config),
  deleteConnection: (id) => api.delete(`/db/connections/${id}`),
  activateConnection: (id) => api.post(`/db/connections/${id}/activate`, {}),
  getActiveConnection: () => api.get('/db/active-connection'),
  getFieldMeta: (connectionId, tableName) => api.get(`/db/connections/${connectionId}/tables/${tableName}/meta`),
  setFieldMeta: (connectionId, tableName, fields) => api.put(`/db/connections/${connectionId}/tables/${tableName}/meta`, { fields }),
};

export const metricsAPI = {
  getConfig: () => api.get('/metrics/config'),
  previewSQL: (config) => api.post('/metrics/preview', config),
  executeMetric: (config) => api.post('/metrics/execute', config),
  list: (table) => api.get('/metrics', { params: { table } }),
  getGroupedByTable: () => api.get('/metrics/grouped-by-table'),
  get: (id) => api.get(`/metrics/${id}`),
  create: (data) => api.post('/metrics', data),
  update: (id, data) => api.put(`/metrics/${id}`, data),
  delete: (id) => api.delete(`/metrics/${id}`),
};

export const dashboardsAPI = {
  list: () => api.get('/dashboards'),
  get: (id) => api.get(`/dashboards/${id}`),
  create: (data) => api.post('/dashboards', data),
  update: (id, data) => api.put(`/dashboards/${id}`, data),
  delete: (id) => api.delete(`/dashboards/${id}`),
  addWidget: (dashboardId, data) => api.post(`/dashboards/${dashboardId}/widgets`, data),
  getWidget: (widgetId) => api.get(`/dashboards/widgets/${widgetId}`),
  updateWidget: (widgetId, data) => api.put(`/dashboards/widgets/${widgetId}`, data),
  deleteWidget: (widgetId) => api.delete(`/dashboards/widgets/${widgetId}`),
};

export const datasetsAPI = {
  list: () => api.get('/datasets'),
  listWithStatus: () => api.get('/datasets/with-connection-status'),
  get: (id) => api.get(`/datasets/${id}`),
  create: (data) => api.post('/datasets', data),
  update: (id, data) => api.put(`/datasets/${id}`, data),
  delete: (id) => api.delete(`/datasets/${id}`),
  preview: (config) => api.post('/datasets/preview', config),
  execute: (config) => api.post('/datasets/execute', config),
  getTables: () => api.get('/datasets/tables'),
  getTableColumns: (tableName) => api.get(`/datasets/tables/${tableName}/columns`),
};

export const widgetsAPI = {
  query: (widgetId, queryConfig) => api.post(`/widgets/${widgetId}/query`, queryConfig),
  batchQuery: (widgetIds, filters) => api.post('/widgets/batch-query', { widgetIds, filters }),
};

export const filtersAPI = {
  getValues: (fieldName) => api.get(`/filters/${fieldName}/values`),
};

export const systemAPI = {
  getStatus: () => api.get('/system/status'),
};

export default api;
