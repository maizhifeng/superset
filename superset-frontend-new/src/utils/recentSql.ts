/*
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/

const RECENT_SQL_PREFIX = "superset-sql-lab-recent-queries:";
const LEGACY_RECENT_SQL_KEY = "superset-sql-lab-recent-queries";

export function readRecentSqlQueries(username: string): string[] {
  if (!username) return [];
  try {
    const raw = localStorage.getItem(
      `${RECENT_SQL_PREFIX}${encodeURIComponent(username)}`,
    );
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((query): query is string => typeof query === "string")
      : [];
  } catch {
    return [];
  }
}

export function storeRecentSqlQueries(
  username: string,
  queries: string[],
): void {
  if (!username) return;
  localStorage.setItem(
    `${RECENT_SQL_PREFIX}${encodeURIComponent(username)}`,
    JSON.stringify(queries),
  );
}

export function clearRecentSqlQueries(username: string): void {
  if (username) {
    localStorage.removeItem(
      `${RECENT_SQL_PREFIX}${encodeURIComponent(username)}`,
    );
  }
  localStorage.removeItem(LEGACY_RECENT_SQL_KEY);
}

export function clearAllRecentSqlQueries(): void {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(RECENT_SQL_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(LEGACY_RECENT_SQL_KEY);
}
