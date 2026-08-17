/**
 * Token storage helpers (pure localStorage, no axios dependency).
 *
 * The Authorization header itself is applied by the request interceptor in
 * `client.ts` from `getStoredToken()` on every request; these helpers only
 * manage localStorage persistence and the auth-flag keys.
 */

const TOKEN_KEY = "superset_token";
const REFRESH_TOKEN_KEY = "superset_refresh_token";
const BACKUP_TOKEN_KEY = "superset_admin_token";
export const SWITCHED_FLAG_KEY = "superset_switched_user";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredBackupToken(): string | null {
  return localStorage.getItem(BACKUP_TOKEN_KEY);
}

export function setStoredBackupToken(token: string | null): void {
  if (token) {
    localStorage.setItem(BACKUP_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(BACKUP_TOKEN_KEY);
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

export function clearAuthAndBackup() {
  setStoredToken(null);
  setStoredRefreshToken(null);
  setStoredBackupToken(null);
  localStorage.removeItem("superset_user");
  localStorage.removeItem(SWITCHED_FLAG_KEY);
}
