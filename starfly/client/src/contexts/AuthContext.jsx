import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

// ============================================================
// 认证上下文 - 管理用户登录状态、Token 持久化与自动恢复
// ============================================================

const AuthContext = createContext(null);

const TOKEN_KEY = 'bi_dashboard_token';
const USER_KEY = 'bi_dashboard_user';
const REFRESH_TOKEN_KEY = 'bi_dashboard_refresh_token';
const REMEMBER_KEY = 'bi_dashboard_remember';

function getStorage(preferSession) {
  return preferSession ? sessionStorage : localStorage;
}

function getRememberMe() {
  return localStorage.getItem(REMEMBER_KEY) !== 'false';
}

function setRememberMe(val) {
  localStorage.setItem(REMEMBER_KEY, val ? 'true' : 'false');
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  }, [token]);

  useEffect(() => {
    const initAuth = async () => {
      const localStorageToken = localStorage.getItem(TOKEN_KEY);
      const sessionStorageToken = sessionStorage.getItem(TOKEN_KEY);
      const savedToken = localStorageToken || sessionStorageToken;

      if (!savedToken) {
        setLoading(false);
        return;
      }

      const tryToken = async (t) => {
        api.defaults.headers.common['Authorization'] = `Bearer ${t}`;
        const res = await api.get('/auth/me');
        if (res.data?.success) {
          return res.data.data;
        }
        return null;
      };

      let userData = null;
      try {
        userData = await tryToken(localStorageToken);
      } catch (err) {
        console.warn('Auth init: localStorage token validation failed:', err?.message);
      }

      if (userData) {
        setToken(localStorageToken);
        setUser(userData);
        setLoading(false);
        return;
      }

      // localStorage 的 token 验证失败，尝试 sessionStorage
      if (sessionStorageToken && sessionStorageToken !== localStorageToken) {
        try {
          userData = await tryToken(sessionStorageToken);
        } catch (err) {
          console.warn('Auth init: sessionStorage token validation failed:', err?.message);
        }
        if (userData) {
          setToken(sessionStorageToken);
          setUser(userData);
          setLoading(false);
          return;
        }
      }

      // 两种存储方式均验证失败，执行登出
      logout();
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (username, password, rememberMe = true) => {
    const res = await api.post('/auth/login', { username, password, rememberMe });
    if (res.success && res.token) {
      const storage = getStorage(!rememberMe);
      storage.setItem(TOKEN_KEY, res.token);
      storage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
      storage.setItem(USER_KEY, JSON.stringify({ username: res.username }));
      setRememberMe(rememberMe);
      setToken(res.token);
      setUser({ username: res.username });
      api.defaults.headers.common['Authorization'] = `Bearer ${res.token}`;
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    delete api.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
