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
 * Region rules for the Compare modal's 渠道商/媒体 filters.
 *
 * A domestic game only has domestic channels and an oversea game only has
 * oversea ones, so pairing every selected game with every selected channel
 * produces sections that can never hold data.  These helpers narrow the
 * selections to the channels that can actually apply to a game.
 */

import type { GameRegion } from "@/config/regions";

/**
 * Region of a ``渠道商[ID]`` value.  Both datasets build the column the same
 * way: domestic rows are ``CONCAT(cch_name, ' [', cch_id, ']')`` while oversea
 * rows use the raw ``system`` (``ios``/``android``/``third``), so the numeric
 * suffix tells the two apart.
 */
export function cchValueRegion(value: string): GameRegion {
  return /\[\d+\]\s*$/.test(value.trim()) ? "domestic" : "oversea";
}

/**
 * Narrow channel selections to the ones usable by ``gameRegion``.
 *
 * Returns ``null`` when the caller selected values for this dimension but none
 * of them belongs to the game's region — the game has no valid combination and
 * the caller should skip its queries instead of falling back to every channel.
 * An empty selection means "no filter", not "nothing".
 */
export function narrowByRegion(
  selected: string[],
  gameRegion: GameRegion,
  regionOf: (value: string) => GameRegion,
): string[] | null {
  if (selected.length === 0) return [];
  const matched = selected.filter((value) => regionOf(value) === gameRegion);
  return matched.length > 0 ? matched : null;
}

/**
 * Narrow 媒体 selections to the values that actually occur for a game.
 *
 * 媒体 has no region column, so its region is inferred from the data: values
 * are collected per game and the selection is intersected with them.  When the
 * lookup is unavailable (``known === null``) the selection is kept untouched so
 * a failed lookup never hides a section.
 */
export function narrowMediaByKnownValues(
  selected: string[],
  known: ReadonlySet<string> | null | undefined,
): string[] | null {
  if (selected.length === 0) return [];
  if (known == null) return selected;
  const matched = selected.filter((value) => known.has(value));
  return matched.length > 0 ? matched : null;
}
