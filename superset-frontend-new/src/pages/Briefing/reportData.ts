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
 * Data shaping shared by the briefing tables.
 *
 * Column selection and row roll-ups live here rather than in the page so the
 * rules can be unit tested without rendering a chart-heavy page.
 */

/** Every LTV milestone a report can carry (LTV1…LTV7). */
export const ALL_LTV_DAYS: number[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Which LTV milestones carry data at all.
 *
 * A briefing generated the morning after its report date has LTV3…LTV7 at zero
 * on most days, so those columns cost width and add a wall of "0.00" without
 * saying anything.  Columns are decided per table, not per row, so a table
 * never ends up with ragged columns.
 */
export function visibleLtvDays(rows: readonly object[]): number[] {
  return ALL_LTV_DAYS.filter((d) =>
    rows.some(
      (row) => Number((row as Record<string, unknown>)[`ltv${d}`] ?? 0) > 0,
    ),
  );
}

/**
 * Games represented by a set of channel rows.
 *
 * The merged ("不分客户端") table reuses this so switching the channel split
 * never changes *which* games are listed — only whether their channels are
 * broken out.
 */
export function gamesOf(rows: readonly { project: string }[]): Set<string> {
  return new Set(rows.map((row) => row.project));
}

/** Group rows by a string key, preserving payload order inside each group. */
function groupByKey<T>(
  rows: readonly T[] | undefined,
  key: (row: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows ?? []) {
    const group = grouped.get(key(row));
    if (group) {
      group.push(row);
    } else {
      grouped.set(key(row), [row]);
    }
  }
  return grouped;
}

/**
 * Index the 媒体 × 主游戏 rows by media channel.
 *
 * The media view ranks media and the drill behind one of them reads the same
 * rows one channel at a time, so the page groups them once per payload instead
 * of re-filtering on every render.  Row order is preserved, which is what lets
 * a media's games stay spend-descending as the backend sent them.
 */
export function gamesByMedia<T extends { channel: string }>(
  rows: readonly T[] | undefined,
): Map<string, T[]> {
  return groupByKey(rows, (row) => row.channel);
}

/**
 * Index the 媒体 × 客户端 rows by platform, spend-descending inside each.
 *
 * The media chart reads 客户端 as the first level and 媒体 as the second, so a
 * media that bought on several platforms shows up once under each of them —
 * ordered by that platform's own spend, not by the media's total.
 */
export function mediaByPlatform<
  T extends { platform: string; spend?: number | null },
>(rows: readonly T[] | undefined): Map<string, T[]> {
  const grouped = groupByKey(rows, (row) => row.platform);
  for (const members of grouped.values()) {
    members.sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
  }
  return grouped;
}

/**
 * Platforms ranked by total spend — the order the grouped bars are drawn in.
 *
 * A fixed order across every media is what makes a group readable without a
 * legend: the widest platform always sits at the top of its group.
 */
export function platformsBySpend<
  T extends { platform: string; spend?: number | null },
>(rows: readonly T[] | undefined): string[] {
  const totals = new Map<string, number>();
  for (const row of rows ?? []) {
    totals.set(
      row.platform,
      (totals.get(row.platform) ?? 0) + (row.spend ?? 0),
    );
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([platform]) => platform);
}

/**
 * Index the 媒体 × 主游戏 rows by 主游戏.
 *
 * The media table can swap its outer and inner dimensions, and the swapped
 * view groups the very same rows the other way round.  Row order is preserved:
 * the payload arrives media by media in the parent view's spend order, which is
 * also the order the swapped view lists a game's media in.
 */
export function mediaRowsByProject<T extends { project: string }>(
  rows: readonly T[] | undefined,
): Map<string, T[]> {
  return groupByKey(rows, (row) => row.project);
}

/** How a ROI1 sits against the report's thresholds, for colour coding. */
export type RoiQuality = "good" | "warning" | "critical" | "unknown";

/**
 * Classify a ROI1 against the breakeven and critical lines.
 *
 * Mirrors the backend's alert ladder: below the critical line reads 低, below
 * the breakeven line reads 中, at or above it reads 达标.  A row without a ROI1
 * (no ROI column mapped) is ``unknown`` and gets a neutral colour rather than
 * being read as a failure.
 */
export function roiQuality(
  roi1: number | null | undefined,
  breakeven: number,
  critical: number,
): RoiQuality {
  if (roi1 === null || roi1 === undefined || Number.isNaN(roi1)) {
    return "unknown";
  }
  if (roi1 >= breakeven) return "good";
  if (roi1 >= critical) return "warning";
  return "critical";
}

/** The metric shape a rolled-up row exposes — mirrors the table's columns. */
export interface DailyTotals {
  spend: number;
  new_users: number;
  /** null = 该窗口没有分母（无消耗 / 无新增），比值无定义。 */
  cpa: number | null;
  /** 充值流水：纯加法指标，直接求和。 */
  recharge: number;
  /** 比率类指标按新增人数加权（与明细行同口径）。 */
  pay_rate: number | null;
  retention_rate: number | null;
  /** 自然新增%：自然量新增 / 新增进入，同样按新增人数加权。 */
  natural_rate: number | null;
  /** LTV 各成熟度：按新增人数加权的窗口均值。 */
  ltv: Record<number, number | null>;
  roi1: number | null;
  /** 累计ROI / 流水ROI：与 ROI1 同分母，按消耗加权。 */
  roi_cum: number | null;
  roi_flow: number | null;
}

export type DailyLike = {
  spend?: number | null;
  new_users?: number | null;
  recharge?: number | null;
  pay_rate?: number | null;
  retention_rate?: number | null;
  natural_rate?: number | null;
  ltv1?: number | null;
  ltv2?: number | null;
  ltv3?: number | null;
  ltv4?: number | null;
  ltv5?: number | null;
  ltv6?: number | null;
  ltv7?: number | null;
  roi1?: number | null;
  roi_cum?: number | null;
  roi_flow?: number | null;
};

/** LTV milestones a row can carry. */
export const LTV_MILESTONES = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Roll a project's daily rows into the period figure for that project.
 *
 * Additive metrics (spend, new users, 充值流水) are summed; the per-unit ratios
 * (CPA, LTV, ROI1, 累计ROI, 流水ROI, 1日付费率, 2日留存率, 自然新增%) are
 * rebuilt from their
 * weights instead of averaging averages — CPA from the period's spend and
 * users, LTV1 weighted by each day's new users, ROI1 weighted by each day's
 * spend (the same convention ``aggregateByChannel`` uses for channels).
 *
 * Returns ``null`` when there is nothing to roll up, so callers can fall back
 * to the report-day values.
 */
export function summarizeDailyRows(
  rows: readonly DailyLike[] | undefined,
): DailyTotals | null {
  if (!rows || rows.length === 0) return null;
  let spend = 0;
  let users = 0;
  let recharge = 0;
  let payWeighted = 0;
  let retentionWeighted = 0;
  let naturalWeighted = 0;
  let roiWeighted = 0;
  let roiCumWeighted = 0;
  let roiFlowWeighted = 0;
  const ltvWeighted: Record<number, number> = {};
  for (const row of rows) {
    const rowSpend = row.spend ?? 0;
    const rowUsers = row.new_users ?? 0;
    spend += rowSpend;
    users += rowUsers;
    recharge += row.recharge ?? 0;
    payWeighted += (row.pay_rate ?? 0) * rowUsers;
    retentionWeighted += (row.retention_rate ?? 0) * rowUsers;
    naturalWeighted += (row.natural_rate ?? 0) * rowUsers;
    roiWeighted += (row.roi1 ?? 0) * rowSpend;
    roiCumWeighted += (row.roi_cum ?? 0) * rowSpend;
    roiFlowWeighted += (row.roi_flow ?? 0) * rowSpend;
    for (const day of LTV_MILESTONES) {
      const key = `ltv${day}` as keyof DailyLike;
      ltvWeighted[day] = (ltvWeighted[day] ?? 0) + (row[key] ?? 0) * rowUsers;
    }
  }
  const ltv: Record<number, number | null> = {};
  for (const day of LTV_MILESTONES) {
    ltv[day] = users ? (ltvWeighted[day] ?? 0) / users : null;
  }
  return {
    spend,
    new_users: users,
    cpa: users ? spend / users : null,
    recharge,
    pay_rate: users ? payWeighted / users : null,
    retention_rate: users ? retentionWeighted / users : null,
    natural_rate: users ? naturalWeighted / users : null,
    ltv,
    roi1: spend ? roiWeighted / spend : null,
    roi_cum: spend ? roiCumWeighted / spend : null,
    roi_flow: spend ? roiFlowWeighted / spend : null,
  };
}

/** One 媒体 × 主游戏 row, as much of it as the swapped table reads. */
export interface MediaProjectLike extends DailyLike {
  prev?: DailyLike | null;
}

/** A 主游戏-level row rolled up from the media rows behind it. */
export interface MediaRollupRow {
  spend: number;
  new_users: number;
  cpa: number | null;
  recharge: number;
  pay_rate: number | null;
  retention_rate: number | null;
  natural_rate: number | null;
  ltv1: number | null;
  roi1: number | null;
  prev: {
    spend: number;
    new_users: number;
    cpa: number | null;
    ltv1: number | null;
    roi1: number | null;
    recharge: number;
  };
}

/**
 * Roll a 主游戏's media rows into the row the swapped table shows.
 *
 * A game's spend is only cut by media inside the 媒体 × 主游戏 rows, so the
 * swapped (主游戏 × 媒体) view has to rebuild the game's own figures from them.
 * The rebuild follows the same weighting rules as ``summarizeDailyRows`` —
 * additive metrics summed, user-denominated ratios weighted by new users and
 * spend-denominated ones by spend — so a swapped outer row and the media rows
 * it opens read on one definition.  The period-over-period block is rebuilt the
 * same way from each row's ``prev``.
 *
 * Returns ``null`` when there is nothing to roll up.
 */
export function rollupMediaRows(
  rows: readonly MediaProjectLike[] | undefined,
): MediaRollupRow | null {
  const totals = summarizeDailyRows(rows);
  if (!totals) return null;
  let prevSpend = 0;
  let prevUsers = 0;
  let prevRecharge = 0;
  let prevLtvWeighted = 0;
  let prevRoiWeighted = 0;
  for (const row of rows ?? []) {
    const prev = row.prev;
    if (!prev) continue;
    const spend = prev.spend ?? 0;
    const users = prev.new_users ?? 0;
    prevSpend += spend;
    prevUsers += users;
    prevRecharge += prev.recharge ?? 0;
    prevLtvWeighted += (prev.ltv1 ?? 0) * users;
    prevRoiWeighted += (prev.roi1 ?? 0) * spend;
  }
  return {
    spend: totals.spend,
    new_users: totals.new_users,
    cpa: totals.cpa,
    recharge: totals.recharge,
    pay_rate: totals.pay_rate,
    retention_rate: totals.retention_rate,
    natural_rate: totals.natural_rate,
    ltv1: totals.ltv[1] ?? null,
    roi1: totals.roi1,
    prev: {
      spend: prevSpend,
      new_users: prevUsers,
      cpa: prevUsers ? prevSpend / prevUsers : null,
      ltv1: prevUsers ? prevLtvWeighted / prevUsers : null,
      roi1: prevSpend ? prevRoiWeighted / prevSpend : null,
      recharge: prevRecharge,
    },
  };
}
