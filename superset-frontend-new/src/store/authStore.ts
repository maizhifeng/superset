import { create } from "zustand";
import api, {
  getStoredToken,
  setStoredToken,
  setStoredRefreshToken,
  refreshAccessToken,
  setupTokenRefresh,
  cancelTokenRefresh,
  setStoredBackupToken,
  getStoredBackupToken,
  fetchCsrfToken,
  clearAuthAndBackup,
  SWITCHED_FLAG_KEY,
} from "@/api";

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

interface AuthState {
  token: string | null;
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
      set({ loading: false });
      return;
    }
    api.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
    try {
      const res = await api.get("/me/");
      if (res.data?.result) {
        const userData: User = { username: res.data.result.username };
        localStorage.setItem("superset_user", JSON.stringify(userData));
        set({ user: userData, isAuthenticated: true });
        setupTokenRefresh();
        await _get().fetchRoles();
        set({ loading: false });
      }
    } catch {
      const newToken = await refreshAccessToken();
      if (newToken) {
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        try {
          const meRes = await api.get("/me/");
          if (meRes.data?.result) {
            const userData: User = { username: meRes.data.result.username };
            localStorage.setItem("superset_user", JSON.stringify(userData));
            set({ user: userData, isAuthenticated: true });
            setupTokenRefresh();
            await _get().fetchRoles();
            set({ loading: false });
            return;
          }
        } catch {
          // /me/ failed even after refresh, fall through to clear auth
        }
      }

      setStoredToken(null);
      setStoredRefreshToken(null);
      set({ token: null, user: null, loading: false, isAuthenticated: false });
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
    if (refreshToken) {
      setStoredRefreshToken(refreshToken);
    }
    const userData: User = { username };
    localStorage.setItem("superset_user", JSON.stringify(userData));
    set({ token: accessToken, user: userData, isAuthenticated: true });
    setupTokenRefresh();
    await _get().fetchRoles();
    void fetchCsrfToken();
  },

  logout: () => {
    clearAuthAndBackup();
    cancelTokenRefresh();
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      loading: false,
      isSwitchedUser: false,
    });
  },

  setToken: (token: string | null) => {
    set({ token, isAuthenticated: !!token });
  },

  switchToUser: async (username: string, _password?: string) => {
    const currentToken = getStoredToken();
    if (currentToken) {
      setStoredBackupToken(currentToken);
    }
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
      if (refreshToken) {
        setStoredRefreshToken(refreshToken);
      }
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
        user: userData,
        isAuthenticated: true,
        isSwitchedUser: true,
      });
      setupTokenRefresh();
    } catch (err) {
      setStoredBackupToken(null);
      throw err;
    }
  },

  switchBackToAdmin: async () => {
    const backupToken = getStoredBackupToken();
    if (!backupToken) return;
    cancelTokenRefresh();
    setStoredToken(backupToken);
    setStoredBackupToken(null);
    localStorage.removeItem(SWITCHED_FLAG_KEY);
    api.defaults.headers.common.Authorization = `Bearer ${backupToken}`;
    try {
      const res = await api.get("/me/");
      if (res.data?.result) {
        const userData: User = {
          username: res.data.result.username,
        };
        localStorage.setItem("superset_user", JSON.stringify(userData));
        set({
          token: backupToken,
          user: userData,
          isAuthenticated: true,
          isSwitchedUser: false,
        });
        setupTokenRefresh();
        await _get().fetchRoles();
      }
    } catch {
      clearAuthAndBackup();
      set({ token: null, user: null, isAuthenticated: false, loading: false });
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

void useAuthStore.getState().init();
