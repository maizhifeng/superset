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
 * Parse a datetime string returned by the Superset backend into a `Date`.
 *
 * The Flask-AppBuilder metadata APIs (e.g. `/security/users/`) serialize
 * `DateTime` columns as naive ISO 8601 strings in UTC without a timezone
 * designator, like `"2026-08-27T09:34:29.404826"`.  `new Date(value)` would
 * interpret such a string as *local* time, skewing the value (by 8 hours on
 * UTC+8 machines) and making a just-created timestamp look old.  This helper
 * treats naive strings as UTC; timezone-aware values pass through unchanged.
 */
export function parseBackendDate(value: string): Date {
  // Normalize two shapes the metadata APIs emit but JS Date parsing is only
  // lenient about: six-digit fractional seconds and ±HHMM offsets.
  const normalized = value
    .trim()
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  // Already timezone-aware: trailing "Z" or an explicit ±HH:MM offset.
  if (/[zZ]$/.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized)) {
    return new Date(normalized);
  }
  // Naive datetime with a time part → interpret as UTC.
  if (/T\d{2}:\d{2}/.test(normalized)) {
    return new Date(`${normalized}Z`);
  }
  // Date-only value: leave as-is.
  return new Date(normalized);
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Format a backend timestamp as ``YYYY-MM-DD HH:mm`` in the viewer's timezone. */
export function formatDateTime(
  value: string | null | undefined,
  fallback = "—",
): string {
  if (!value) return fallback;
  const date = parseBackendDate(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export interface RelativeTimeOptions {
  /** Injectable clock for deterministic tests / periodic refresh. */
  now?: number;
  /** Returned when the value is missing or unparsable. */
  fallback?: string;
}

/**
 * Render a backend timestamp as Chinese relative time (``3 天前``), matching
 * the granularity of Superset's ``*_delta_humanized`` fields without leaking
 * the backend's English copy into the UI.
 */
export function formatRelativeTime(
  value: string | null | undefined,
  options: RelativeTimeOptions = {},
): string {
  const { now = Date.now(), fallback = "—" } = options;
  if (!value) return fallback;
  const date = parseBackendDate(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);

  if (diffSeconds >= 0) {
    if (abs < 60) return "即将";
    if (abs < 3600) return `${Math.ceil(abs / 60)} 分钟后`;
    if (abs < 86400) return `${Math.ceil(abs / 3600)} 小时后`;
    return `${Math.ceil(abs / 86400)} 天后`;
  }

  if (abs < 60) return "刚刚";
  if (abs < 3600) return `${Math.floor(abs / 60)} 分钟前`;
  if (abs < 86400) return `${Math.floor(abs / 3600)} 小时前`;
  if (abs < 86400 * 30) return `${Math.floor(abs / 86400)} 天前`;
  if (abs < 86400 * 365) return `${Math.floor(abs / (86400 * 30))} 个月前`;
  return `${Math.floor(abs / (86400 * 365))} 年前`;
}
