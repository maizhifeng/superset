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

import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import api, {
  getStoredToken,
  setStoredToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  refreshAccessToken,
  setupTokenRefresh,
  cancelTokenRefresh,
  setStoredBackupToken,
  getStoredBackupToken,
  setStoredBackupRefreshToken,
  getStoredBackupRefreshToken,
  fetchCsrfToken,
  clearAuthAndBackup,
  SWITCHED_FLAG_KEY,
} from "@/api";
import { clearQueryCache } from "@/api/queryClient";
import { AUTH_EXPIRED_EVENT } from "@/api/authEvents";
import { useMenuSettings } from "@/store/menuSettings";

interface User {
  username: string;
  roles?: Record<string, boolean>;
}

function normalizeRoles(
  apiRoles: Record<string, unknown> | undefined,
): Record<string, boolean> {
  if (!apiRoles) return {};
  return Object.keys(apiRoles).reduce(
    (acc, role) => {
      acc[role] = true;
      return acc;
    },
    {} as Record<string, boolean>,
  );
}

function clearClientAuthorization(): void {
  delete api.defaults.headers.common.Authorization;
}

interface AuthState {
  token: string | null;
  sessionId: string | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isSwitchedUser: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string | null) => void;
  fetchRoles: () => Promise<void>;
  switchToUser: (username: string, password?: string) => Promise<void>;
  switchBackToAdmin: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, _get) => ({
  token: getStoredToken(),
  sessionId: null,
  isSwitchedUser: localStorage.getItem(SWITCHED_FLAG_KEY) === "true",
  user: (() => {
    try {
      const stored = localStorage.getItem("superset_user");
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return {
        username: parsed.username ?? "",
        roles: parsed.roles ?? undefined,
      };
    } catch {
      return null;
    }
  })(),
  loading: true,
  isAuthenticated: !!getStoredToken(),

  init: async () => {
    const savedToken = getStoredToken();
    if (!savedToken) {
      clearClientAuthorization();
      clearQueryCache();
      set({ token: null, sessionId: null, loading: false });
      return;
    }
    api.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
    try {
      const res = await api.get("/me/");
      if (!res.data?.result) throw new Error("Invalid session response");
      const userData: User = { username: res.data.result.username };
      localStorage.setItem("superset_user", JSON.stringify(userData));
      clearQueryCache();
      set({
        token: savedToken,
        sessionId: uuidv4(),
        user: userData,
        isAuthenticated: true,
      });
      setupTokenRefresh();
      await _get().fetchRoles();
      await useMenuSettings.getState().fetchSettings();
      set({ loading: false });
    } catch {
      const newToken = await refreshAccessToken();
      if (newToken) {
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        try {
          const meRes = await api.get("/me/");
          if (!meRes.data?.result) throw new Error("Invalid session response");
          const userData: User = { username: meRes.data.result.username };
          localStorage.setItem("superset_user", JSON.stringify(userData));
          clearQueryCache();
          set({
            token: newToken,
            sessionId: uuidv4(),
            user: userData,
            isAuthenticated: true,
          });
          setupTokenRefresh();
          await _get().fetchRoles();
          await useMenuSettings.getState().fetchSettings();
          set({ loading: false });
          return;
        } catch {
          clearAuthAndBackup();
        }
      } else {
        clearAuthAndBackup();
      }

      clearClientAuthorization();
      clearQueryCache();
      set({
        token: null,
        sessionId: null,
        user: null,
        loading: false,
        isAuthenticated: false,
      });
    }
  },

  login: async (username: string, password: string) => {
    const res = await api.post("/security/login", {
      username,
      password,
      provider: "db",
      refresh: true,
    });
    const accessToken = res.data?.access_token;
    if (!accessToken) {
      throw new Error(res.data?.message || "Login failed");
    }
    const refreshToken = res.data?.refresh_token;

    setStoredToken(accessToken);
    setStoredRefreshToken(refreshToken ?? null);
    setStoredBackupToken(null);
    setStoredBackupRefreshToken(null);
    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    const userData: User = { username };
    localStorage.setItem("superset_user", JSON.stringify(userData));
    clearQueryCache();
    set({
      token: accessToken,
      sessionId: uuidv4(),
      user: userData,
      isAuthenticated: true,
      loading: false,
      isSwitchedUser: false,
    });
    setupTokenRefresh();
    await _get().fetchRoles();
    await useMenuSettings.getState().fetchSettings();
    void fetchCsrfToken();
  },

  logout: () => {
    clearAuthAndBackup();
    clearClientAuthorization();
    clearQueryCache();
    cancelTokenRefresh();
    set({
      token: null,
      sessionId: null,
      user: null,
      isAuthenticated: false,
      loading: false,
      isSwitchedUser: false,
    });
  },

  setToken: (token: string | null) => {
    if (!token) {
      clearClientAuthorization();
      clearQueryCache();
    }
    set((state) => ({
      token,
      sessionId: token ? (state.sessionId ?? uuidv4()) : null,
      isAuthenticated: !!token,
    }));
  },

  switchToUser: async (username: string, _password?: string) => {
    const currentToken = getStoredToken();
    const currentRefreshToken = getStoredRefreshToken();
    if (currentToken) {
      setStoredBackupToken(currentToken);
    }
    setStoredBackupRefreshToken(currentRefreshToken);
    cancelTokenRefresh();
    try {
      const res = await api.get<{
        access_token: string;
        refresh_token?: string;
        roles?: string[];
      }>(`/me/impersonate/?username=${encodeURIComponent(username)}`);
      const accessToken = res.data?.access_token;
      if (!accessToken) {
        throw new Error("切换失败");
      }
      const refreshToken = res.data?.refresh_token;
      setStoredToken(accessToken);
      setStoredRefreshToken(refreshToken ?? null);
      api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
      clearQueryCache();
      const targetRoles: Record<string, boolean> = {};
      if (res.data?.roles) {
        for (const role of res.data.roles) {
          targetRoles[role] = true;
        }
      }
      const userData: User = { username, roles: targetRoles };
      localStorage.setItem("superset_user", JSON.stringify(userData));
      localStorage.setItem(SWITCHED_FLAG_KEY, "true");
      set({
        token: accessToken,
        sessionId: uuidv4(),
        user: userData,
        isAuthenticated: true,
        isSwitchedUser: true,
      });
      setupTokenRefresh();
    } catch (err) {
      setStoredBackupToken(null);
      setStoredBackupRefreshToken(null);
      throw err;
    }
  },

  switchBackToAdmin: async () => {
    const backupToken = getStoredBackupToken();
    const backupRefreshToken = getStoredBackupRefreshToken();
    if (!backupToken) return;
    cancelTokenRefresh();
    setStoredToken(backupToken);
    setStoredRefreshToken(backupRefreshToken);
    setStoredBackupToken(null);
    setStoredBackupRefreshToken(null);
    localStorage.removeItem(SWITCHED_FLAG_KEY);
    api.defaults.headers.common.Authorization = `Bearer ${backupToken}`;
    clearQueryCache();
    try {
      const res = await api.get("/me/");
      if (res.data?.result) {
        const userData: User = {
          username: res.data.result.username,
        };
        localStorage.setItem("superset_user", JSON.stringify(userData));
        set({
          token: backupToken,
          sessionId: uuidv4(),
          user: userData,
          isAuthenticated: true,
          isSwitchedUser: false,
        });
        setupTokenRefresh();
        await _get().fetchRoles();
      }
    } catch {
      clearAuthAndBackup();
      clearClientAuthorization();
      clearQueryCache();
      set({
        token: null,
        sessionId: null,
        user: null,
        isAuthenticated: false,
        loading: false,
        isSwitchedUser: false,
      });
    }
  },

  fetchRoles: async () => {
    try {
      const res = await api.get("/me/roles/");
      if (res.data?.result?.roles) {
        const roles = normalizeRoles(res.data.result.roles);
        set((state) => ({
          user: state.user ? { ...state.user, roles } : null,
        }));
        const stored = localStorage.getItem("superset_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.roles = roles;
          localStorage.setItem("superset_user", JSON.stringify(parsed));
        }
      }
    } catch {
      // roles fetch is best-effort
    }
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_EXPIRED_EVENT, () => {
    cancelTokenRefresh();
    clearClientAuthorization();
    clearQueryCache();
    useAuthStore.setState({
      token: null,
      sessionId: null,
      user: null,
      isAuthenticated: false,
      loading: false,
      isSwitchedUser: false,
    });
  });
}

void useAuthStore.getState().init();
