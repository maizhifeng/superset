import { create } from "zustand";
import api, {
  getStoredToken,
  setStoredToken,
  setStoredRefreshToken,
  refreshAccessToken,
  setupTokenRefresh,
  cancelTokenRefresh,
} from "@/api";

interface User {
  username: string;
  roles?: Record<string, boolean>;
}

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>()((set, _get) => ({
  token: getStoredToken(),
  user: (() => {
    try {
      const stored = localStorage.getItem("superset_user");
      return stored ? JSON.parse(stored) : null;
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
        set({ user: userData, loading: false, isAuthenticated: true });
        setupTokenRefresh();
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
            set({ user: userData, loading: false, isAuthenticated: true });
            setupTokenRefresh();
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
  },

  logout: () => {
    setStoredToken(null);
    setStoredRefreshToken(null);
    localStorage.removeItem("superset_user");
    cancelTokenRefresh();
    set({ token: null, user: null, isAuthenticated: false });
  },

  setToken: (token: string | null) => {
    set({ token, isAuthenticated: !!token });
  },
}));

useAuthStore.getState().init();
