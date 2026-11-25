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

import { useAuthStore } from "@/store/authStore";
import api, {
  setStoredBackupRefreshToken,
  setStoredRefreshToken,
  getStoredBackupRefreshToken,
  getStoredBackupToken,
  getStoredToken,
  getStoredRefreshToken,
} from "@/api";
import { clearQueryCache } from "@/api/queryClient";
import { AUTH_EXPIRED_EVENT } from "@/api/authEvents";
import { vi, test, expect, beforeEach } from "vitest";

vi.mock("@/api/queryClient", () => ({
  clearQueryCache: vi.fn(),
}));

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { headers: { common: {} } },
  },
  getStoredToken: vi.fn(() => null),
  setStoredToken: vi.fn(),
  getStoredRefreshToken: vi.fn(() => null),
  setStoredRefreshToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  setupTokenRefresh: vi.fn(),
  cancelTokenRefresh: vi.fn(),
  setStoredBackupToken: vi.fn(),
  getStoredBackupToken: vi.fn(() => null),
  setStoredBackupRefreshToken: vi.fn(),
  getStoredBackupRefreshToken: vi.fn(() => null),
  fetchCsrfToken: vi.fn(),
  clearAuthAndBackup: vi.fn(),
  SWITCHED_FLAG_KEY: "superset_switched_user",
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(getStoredBackupToken).mockReturnValue(null);
  vi.mocked(getStoredBackupRefreshToken).mockReturnValue(null);
  vi.mocked(getStoredRefreshToken).mockReturnValue(null);
  vi.mocked(getStoredToken).mockReturnValue(null);
  localStorage.clear();
  delete api.defaults.headers.common.Authorization;
  useAuthStore.setState({
    token: null,
    sessionId: null,
    user: null,
    loading: true,
    isAuthenticated: false,
    isSwitchedUser: false,
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
  expect(state.sessionId).toEqual(expect.any(String));
  expect(state.user).toEqual({ username: "admin" });
  expect(state.isAuthenticated).toBe(true);
  expect(api.defaults.headers.common.Authorization).toBe(`Bearer ${mockToken}`);
  expect(clearQueryCache).toHaveBeenCalledOnce();
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
    sessionId: "session",
    user: { username: "admin" },
    isAuthenticated: true,
    loading: false,
  });
  api.defaults.headers.common.Authorization = "Bearer token";

  useAuthStore.getState().logout();

  const state = useAuthStore.getState();
  expect(state.token).toBeNull();
  expect(state.sessionId).toBeNull();
  expect(state.user).toBeNull();
  expect(state.isAuthenticated).toBe(false);
  expect(api.defaults.headers.common.Authorization).toBeUndefined();
  expect(clearQueryCache).toHaveBeenCalledOnce();
});

test("setToken updates token and auth status", () => {
  useAuthStore.getState().setToken("new-token");

  expect(useAuthStore.getState().token).toBe("new-token");
  expect(useAuthStore.getState().isAuthenticated).toBe(true);

  useAuthStore.getState().setToken(null);

  expect(useAuthStore.getState().token).toBeNull();
  expect(useAuthStore.getState().sessionId).toBeNull();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(clearQueryCache).toHaveBeenCalledOnce();
});

test("impersonation backs up and restores both tokens", async () => {
  vi.mocked(getStoredToken).mockReturnValue("admin-access");
  vi.mocked(getStoredRefreshToken).mockReturnValue("admin-refresh");
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      access_token: "user-access",
      refresh_token: "user-refresh",
      roles: ["Gamma"],
    },
  });

  await useAuthStore.getState().switchToUser("gamma");

  expect(setStoredBackupRefreshToken).toHaveBeenCalledWith("admin-refresh");
  expect(setStoredRefreshToken).toHaveBeenCalledWith("user-refresh");

  vi.mocked(getStoredBackupToken).mockReturnValue("admin-access");
  vi.mocked(getStoredBackupRefreshToken).mockReturnValue("admin-refresh");
  vi.mocked(api.get)
    .mockResolvedValueOnce({ data: { result: { username: "admin" } } })
    .mockResolvedValueOnce({ data: { result: { roles: { Admin: true } } } });

  await useAuthStore.getState().switchBackToAdmin();

  expect(setStoredRefreshToken).toHaveBeenLastCalledWith("admin-refresh");
  expect(useAuthStore.getState().user?.username).toBe("admin");
  expect(useAuthStore.getState().isSwitchedUser).toBe(false);
});

test("auth expiration clears client and store state", () => {
  useAuthStore.setState({
    token: "token",
    sessionId: "session",
    user: { username: "admin" },
    isAuthenticated: true,
  });
  api.defaults.headers.common.Authorization = "Bearer token";

  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));

  expect(useAuthStore.getState().token).toBeNull();
  expect(useAuthStore.getState().sessionId).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(api.defaults.headers.common.Authorization).toBeUndefined();
  expect(clearQueryCache).toHaveBeenCalledOnce();
});
