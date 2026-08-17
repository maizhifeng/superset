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
 * Column metadata helper for the Compare modal.
 *
 * A column coming out of the chart-data API is identified by its raw
 * ``name`` (e.g. ``SUM(clicks)`` or ``papp_name``), but the UI shows a
 * human-friendly ``displayName`` (``clicks`` or ``月``).  These helpers
 * centralize that inference so the Compare modal never re-derives it
 * inline, and so the mapping is unit-testable.
 */

/** Aggregation function prefixes that are stripped from a column's label. */
const AGG_PREFIX_RE = /^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/;

/** Preferred labels for time-grain columns. */
export function resolveDisplayName(
  name: string,
  timeCol?: string,
  timeGrain?: string,
): string {
  if (name === timeCol) {
    if (timeGrain === "P1W") return "周";
    if (timeGrain === "P1M") return "月";
    return "日期";
  }
  const m = AGG_PREFIX_RE.exec(name);
  if (m) return m[2];
  return name;
}

/** A display label for a column: its resolved label, falling back to name. */
export function displayLabel(name: string, displayName?: string): string {
  return displayName ?? name;
}
