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
  // Already timezone-aware: trailing "Z" or an explicit ±HH:MM offset.
  if (/[zZ]$/.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)) {
    return new Date(value);
  }
  // Naive datetime with a time part → interpret as UTC.
  if (/T\d{2}:\d{2}/.test(value)) {
    return new Date(`${value}Z`);
  }
  // Date-only value: leave as-is.
  return new Date(value);
}
