import { useAuthStore } from "@/store/authStore";
import api from "@/api";
import { vi, test, expect, beforeEach } from "vitest";

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { headers: { common: {} } },
  },
  getStoredToken: vi.fn(() => null),
  setStoredToken: vi.fn(),
  setStoredRefreshToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  setupTokenRefresh: vi.fn(),
  cancelTokenRefresh: vi.fn(),
  setStoredBackupToken: vi.fn(),
  getStoredBackupToken: vi.fn(() => null),
  fetchCsrfToken: vi.fn(),
  clearAuthAndBackup: vi.fn(),
  SWITCHED_FLAG_KEY: "superset_switched_user",
}));

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    token: null,
    user: null,
    loading: true,
    isAuthenticated: false,
  });
});

test("initial state has loading true and no user", () => {
  const state = useAuthStore.getState();
  expect(state.token).toBeNull();
  expect(state.user).toBeNull();
  expect(state.loading).toBe(true);
  expect(state.isAuthenticated).toBe(false);
});

test("login stores token and user", async () => {
  const mockToken = "test-access-token";
  vi.mocked(api.post).mockResolvedValueOnce({
    data: { access_token: mockToken },
  });

  await useAuthStore.getState().login("admin", "password");

  const state = useAuthStore.getState();
  expect(state.token).toBe(mockToken);
  expect(state.user).toEqual({ username: "admin" });
  expect(state.isAuthenticated).toBe(true);
  expect(localStorage.getItem("superset_user")).toBe(
    JSON.stringify({ username: "admin" }),
  );
});

test("login throws on missing access_token", async () => {
  vi.mocked(api.post).mockResolvedValueOnce({
    data: { message: "Invalid credentials" },
  });

  await expect(useAuthStore.getState().login("admin", "wrong")).rejects.toThrow(
    "Invalid credentials",
  );
});

test("logout clears auth state", () => {
  useAuthStore.setState({
    token: "token",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });

  useAuthStore.getState().logout();

  const state = useAuthStore.getState();
  expect(state.token).toBeNull();
  expect(state.user).toBeNull();
  expect(state.isAuthenticated).toBe(false);
});

test("setToken updates token and auth status", () => {
  useAuthStore.getState().setToken("new-token");

  expect(useAuthStore.getState().token).toBe("new-token");
  expect(useAuthStore.getState().isAuthenticated).toBe(true);

  useAuthStore.getState().setToken(null);

  expect(useAuthStore.getState().token).toBeNull();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
