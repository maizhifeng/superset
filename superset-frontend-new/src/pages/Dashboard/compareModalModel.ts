/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { GameRegion } from "@/config/regions";
import type { ChartDataRow } from "@/types/api";
import type { MetricFormatMap } from "@/utils/formatNumber";
import { formatMetricValue } from "@/utils/formatNumber";
import { startKey } from "@/pages/Dashboard/compareStartDate";
import type { AnchorKey } from "@/pages/Dashboard/compareStartDate";

export interface GameOption {
  papp_id: string;
  region: GameRegion;
  papp_name: string;
  上线时间: string;
}

export type SelectedGame = GameOption;

export interface CompareSecondaryResult {
  columns: { name: string; type?: string; displayName?: string }[];
  data: ChartDataRow[];
}

export interface CompareQuerySnapshot {
  games: SelectedGame[];
  cchNames: string[];
  channels: string[];
  anchors: AnchorKey[];
}

export interface CompareSectionTag {
  key: string;
  label: string;
  gameId: string;
  start?: string;
  anchor: AnchorKey;
}

export interface CompareHoveredCell {
  table: "primary" | "secondary";
  row: number;
}

export const COL = {
  papp_name: "主游戏",
  papp_id: "主游戏[ID]",
  report_date_calc: "日期",
  cch_name: "渠道商",
  cch_name_id: "渠道商[ID]",
  channel_name: "媒体",
  ad_real_cost: "ad_real_cost",
  n_unum: "n_unum",
};

export const PERIOD_DAYS = [7, 14, 30, 60, 90, 180, 360, 720];

export function gameKey(game: { region: GameRegion; papp_id: string }): string {
  return startKey(game.region, game.papp_id);
}

export const extractName = (value: string) =>
  value.replace(/\s*[([][^)\]]*[)\]]$/, "").trim();

export function fmtValue(
  key: string,
  value: unknown,
  formatMap?: MetricFormatMap,
): string {
  return formatMetricValue(key, value, formatMap);
}
