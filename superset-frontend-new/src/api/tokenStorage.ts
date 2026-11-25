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

/**
 * Token storage helpers (pure localStorage, no axios dependency).
 *
 * The Authorization header itself is applied by the request interceptor in
 * `client.ts` from `getStoredToken()` on every request; these helpers only
 * manage localStorage persistence and the auth-flag keys.
 */

import { clearAllRecentSqlQueries } from "@/utils/recentSql";

const TOKEN_KEY = "superset_token";
const REFRESH_TOKEN_KEY = "superset_refresh_token";
const BACKUP_TOKEN_KEY = "superset_admin_token";
const BACKUP_REFRESH_TOKEN_KEY = "superset_admin_refresh_token";
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

export function getStoredBackupRefreshToken(): string | null {
  return localStorage.getItem(BACKUP_REFRESH_TOKEN_KEY);
}

export function setStoredBackupRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(BACKUP_REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(BACKUP_REFRESH_TOKEN_KEY);
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
  setStoredBackupRefreshToken(null);
  clearAllRecentSqlQueries();
  localStorage.removeItem("superset_user");
  localStorage.removeItem(SWITCHED_FLAG_KEY);
}
