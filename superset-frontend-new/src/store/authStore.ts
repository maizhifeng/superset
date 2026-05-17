import { create } from 'zustand';
import api, { getStoredToken, setStoredToken } from '@/api';

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

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: getStoredToken(),
  user: (() => {
    try {
      const stored = localStorage.getItem('superset_user');
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
      const res = await api.get('/me/');
      if (res.data?.result) {
        const userData: User = { username: res.data.result.username };
        localStorage.setItem('superset_user', JSON.stringify(userData));
        set({ user: userData, loading: false, isAuthenticated: true });
      }
    } catch {
      setStoredToken(null);
      set({ token: null, user: null, loading: false, isAuthenticated: false });
    }
  },

  login: async (username: string, password: string) => {
    const res = await api.post('/security/login', {
      username,
      password,
      provider: 'db',
      refresh: true,
    });
    const accessToken = res.data?.access_token;
    if (!accessToken) {
      throw new Error(res.data?.message || 'Login failed');
    }
    setStoredToken(accessToken);
    const userData: User = { username };
    localStorage.setItem('superset_user', JSON.stringify(userData));
    set({ token: accessToken, user: userData, isAuthenticated: true });
  },

  logout: () => {
    setStoredToken(null);
    localStorage.removeItem('superset_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  setToken: (token: string | null) => {
    set({ token, isAuthenticated: !!token });
  },
}));

useAuthStore.getState().init();
