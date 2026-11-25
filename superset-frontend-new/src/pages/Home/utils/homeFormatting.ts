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

import type { KeyboardEvent } from "react";

export const RECENT_QUERY_STORAGE_KEY = "superset-sql-lab-recent-queries";
export const RECENT_QUERY_LIMIT = 8;

export interface StatSummaryItem {
  label: string;
  value: number;
  error?: string;
}

export function handleRowKeyDown(
  event: KeyboardEvent<HTMLElement>,
  action: () => void,
) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function formatStatSummary(items: readonly StatSummaryItem[]) {
  return items
    .map((item) =>
      item.error ? `${item.label}: 加载失败` : `${item.label}: ${item.value}`,
    )
    .join("\n");
}

export function readRecentQueries(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? (parsed.slice(0, RECENT_QUERY_LIMIT) as string[])
      : [];
  } catch {
    return [];
  }
}

export function formatQueryPreview(query: string) {
  return query.split("\n").filter(Boolean).join(" ").slice(0, 80);
}
