import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api, { getStoredToken, setStoredToken } from '@/api';

interface User {
  username: string;
  roles?: Record<string, boolean>;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('superset_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
    }
  }, [token]);

  useEffect(() => {
    const initAuth = async () => {
      const savedToken = getStoredToken();
      if (!savedToken) {
        setLoading(false);
        return;
      }
      api.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
      try {
        const res = await api.get('/me/');
        if (res.data?.result) {
          const userData: User = { username: res.data.result.username };
          setUser(userData);
          localStorage.setItem('superset_user', JSON.stringify(userData));
        }
      } catch {
        setStoredToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
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
    setToken(accessToken);
    const userData: User = { username };
    setUser(userData);
    localStorage.setItem('superset_user', JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    localStorage.removeItem('superset_user');
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, user, login, logout, loading, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
