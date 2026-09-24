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
import { expect, test } from "vitest";
import {
  gamesByMedia,
  gamesOf,
  mediaByPlatform,
  mediaRowsByProject,
  platformsBySpend,
  roiQuality,
  rollupMediaRows,
  summarizeDailyRows,
  visibleLtvDays,
} from "../reportData";

test("summarizeDailyRows sums additive metrics and reweights ratios", () => {
  const totals = summarizeDailyRows([
    { spend: 100, new_users: 10, ltv1: 2, roi1: 0.1 },
    { spend: 300, new_users: 30, ltv1: 3, roi1: 0.2 },
  ]);

  expect(totals).not.toBeNull();
  expect(totals?.spend).toBe(400);
  expect(totals?.new_users).toBe(40);
  expect(totals?.cpa).toBeCloseTo(10); // 400 / 40
  expect(totals?.ltv[1]).toBeCloseTo(2.75); // (2·10 + 3·30) / 40
  expect(totals?.roi1).toBeCloseTo(0.175); // (0.1·100 + 0.2·300) / 400
});

test("summarizeDailyRows weights 付费率 / 留存率 / LTV by new users", () => {
  const totals = summarizeDailyRows([
    { spend: 100, new_users: 10, pay_rate: 0.2, retention_rate: 0.3, ltv1: 1 },
    { spend: 300, new_users: 30, pay_rate: 0.4, retention_rate: 0.5, ltv1: 3 },
  ]);

  expect(totals?.pay_rate).toBeCloseTo((0.2 * 10 + 0.4 * 30) / 40);
  expect(totals?.retention_rate).toBeCloseTo((0.3 * 10 + 0.5 * 30) / 40);
  expect(totals?.ltv[1]).toBeCloseTo((1 * 10 + 3 * 30) / 40);
});

test("summarizeDailyRows rolls 自然新增% up into the window's organic share", () => {
  // Each day's rate is a share of that day's new users, so the window's share
  // is the new-user-weighted mean — the same denominator the backend uses.
  const totals = summarizeDailyRows([
    { spend: 100, new_users: 10, natural_rate: 0.5 },
    { spend: 300, new_users: 30, natural_rate: 0.25 },
  ]);

  expect(totals?.natural_rate).toBeCloseTo((0.5 * 10 + 0.25 * 30) / 40);
});

test("summarizeDailyRows reports an undefined 自然新增% as null, not zero", () => {
  // No new users at all: the organic share has a zero denominator.
  expect(
    summarizeDailyRows([{ spend: 0, new_users: 0, natural_rate: null }])
      ?.natural_rate,
  ).toBeNull();
});

test("summarizeDailyRows adds 充值流水 like any other additive metric", () => {
  const totals = summarizeDailyRows([
    { spend: 100, new_users: 10, recharge: 250, ltv1: 2, roi1: 0.1 },
    { spend: 300, new_users: 30, recharge: 400, ltv1: 3, roi1: 0.2 },
  ]);

  expect(totals?.recharge).toBe(650);
});

test("summarizeDailyRows weights by volume instead of averaging averages", () => {
  const totals = summarizeDailyRows([
    { spend: 1000, new_users: 100, ltv1: 1 },
    { spend: 10, new_users: 1, ltv1: 9 },
  ]);

  expect(totals?.ltv[1]).toBeCloseTo((1 * 100 + 9 * 1) / 101);
  expect(totals?.ltv[1]).not.toBeCloseTo(5); // the plain mean of 1 and 9
});

test("summarizeDailyRows returns null when there is nothing to roll up", () => {
  expect(summarizeDailyRows([])).toBeNull();
  expect(summarizeDailyRows(undefined)).toBeNull();
});

test("summarizeDailyRows reports undefined ratios as null, not zero", () => {
  // No spend and no new users in the window: every ratio has a zero
  // denominator, so the total must not read as "zero return".
  const totals = summarizeDailyRows([
    { spend: 0, new_users: 0, recharge: 120 },
  ]);

  expect(totals?.recharge).toBe(120);
  expect(totals?.cpa).toBeNull();
  expect(totals?.ltv[1]).toBeNull();
  expect(totals?.roi1).toBeNull();
});

test("gamesOf collects the games behind a set of channel rows", () => {
  // The merged view reuses this so both views list the same games.
  expect(
    gamesOf([{ project: "A" }, { project: "B" }, { project: "A" }]),
  ).toEqual(new Set(["A", "B"]));
  expect(gamesOf([])).toEqual(new Set());
});

test("gamesByMedia keeps each media's games together and in payload order", () => {
  const games = gamesByMedia([
    { channel: "m1", project: "A" },
    { channel: "m1", project: "B" },
    { channel: "m2", project: "A" },
  ]);

  expect([...games.keys()]).toEqual(["m1", "m2"]);
  expect(games.get("m1")?.map((g) => g.project)).toEqual(["A", "B"]);
  expect(games.get("m2")?.map((g) => g.project)).toEqual(["A"]);
});

test("gamesByMedia tolerates a result generated before the drill existed", () => {
  // Legacy payloads carry no 媒体 × 主游戏 rows at all.
  expect(gamesByMedia(undefined).size).toBe(0);
  expect(gamesByMedia([]).size).toBe(0);
});

test("mediaRowsByProject keeps each game's media together and in payload order", () => {
  const byProject = mediaRowsByProject([
    { project: "A", channel: "m1" },
    { project: "A", channel: "m2" },
    { project: "B", channel: "m1" },
  ]);

  expect([...byProject.keys()]).toEqual(["A", "B"]);
  expect(byProject.get("A")?.map((r) => r.channel)).toEqual(["m1", "m2"]);
  expect(byProject.get("B")?.map((r) => r.channel)).toEqual(["m1"]);
});

test("mediaRowsByProject tolerates a result generated before the drill existed", () => {
  expect(mediaRowsByProject(undefined).size).toBe(0);
  expect(mediaRowsByProject([]).size).toBe(0);
});

test("mediaByPlatform keeps each platform's media spend-descending", () => {
  // The chart's first level is the platform, so a media that bought on two
  // platforms shows up under each — ordered by that platform's own spend.
  const byPlatform = mediaByPlatform([
    { platform: "oversea", channel: "Facebook", spend: 300 },
    { platform: "mobile", channel: "今日头条", spend: 60 },
    { platform: "oversea", channel: "Google", spend: 100 },
  ]);

  expect([...byPlatform.keys()]).toEqual(["oversea", "mobile"]);
  expect(byPlatform.get("oversea")?.map((r) => r.channel)).toEqual([
    "Facebook",
    "Google",
  ]);
  expect(byPlatform.get("mobile")?.map((r) => r.channel)).toEqual(["今日头条"]);
  // A result generated before the platform cut existed has nothing to group.
  expect(mediaByPlatform(undefined).size).toBe(0);
});

test("platformsBySpend ranks platforms by their total spend", () => {
  // A fixed order across every media is what makes a group readable without a
  // legend, so it is pinned here.
  const order = platformsBySpend([
    { platform: "oversea", spend: 100 },
    { platform: "mobile", spend: 300 },
    { platform: "oversea", spend: 100 },
    { platform: "mini_game", spend: 50 },
  ]);

  expect(order).toEqual(["mobile", "oversea", "mini_game"]);
  expect(platformsBySpend(undefined)).toEqual([]);
});

test("roiQuality classifies against the breakeven and critical lines", () => {
  expect(roiQuality(0.12, 0.1, 0.05)).toBe("good");
  expect(roiQuality(0.1, 0.1, 0.05)).toBe("good"); // 达标 includes the line
  expect(roiQuality(0.07, 0.1, 0.05)).toBe("warning");
  expect(roiQuality(0.05, 0.1, 0.05)).toBe("warning");
  expect(roiQuality(0.01, 0.1, 0.05)).toBe("critical");
  expect(roiQuality(0, 0.1, 0.05)).toBe("critical");
  // A row without a ROI1 is "not rated", never read as a failure.
  expect(roiQuality(null, 0.1, 0.05)).toBe("unknown");
  expect(roiQuality(undefined, 0.1, 0.05)).toBe("unknown");
});

test("rollupMediaRows rebuilds a game's row from its media rows", () => {
  const row = rollupMediaRows([
    {
      spend: 100,
      new_users: 10,
      ltv1: 2,
      roi1: 0.1,
      recharge: 30,
      prev: { spend: 80, new_users: 8, ltv1: 1, roi1: 0.05, recharge: 20 },
    },
    {
      spend: 300,
      new_users: 30,
      ltv1: 3,
      roi1: 0.2,
      recharge: 70,
      prev: { spend: 320, new_users: 40, ltv1: 4, roi1: 0.1, recharge: 50 },
    },
  ]);

  expect(row).not.toBeNull();
  expect(row?.spend).toBe(400);
  expect(row?.new_users).toBe(40);
  expect(row?.cpa).toBeCloseTo(10); // 400 / 40
  expect(row?.recharge).toBe(100);
  expect(row?.ltv1).toBeCloseTo((2 * 10 + 3 * 30) / 40);
  expect(row?.roi1).toBeCloseTo((0.1 * 100 + 0.2 * 300) / 400);
  // The 环比 block is rebuilt from each row's own prev, same weights.
  expect(row?.prev.spend).toBe(400);
  expect(row?.prev.new_users).toBe(48);
  expect(row?.prev.cpa).toBeCloseTo(400 / 48);
  expect(row?.prev.ltv1).toBeCloseTo((1 * 8 + 4 * 40) / 48);
  expect(row?.prev.roi1).toBeCloseTo((0.05 * 80 + 0.1 * 320) / 400);
  expect(row?.prev.recharge).toBe(70);
});

test("rollupMediaRows adds up to the media rows it rolls up", () => {
  // The swapped outer row and the inner rows it opens must read as one total.
  const rows = [
    { spend: 120, new_users: 12, roi1: 0.25 },
    { spend: 30, new_users: 3, roi1: 0.5 },
  ];
  const row = rollupMediaRows(rows);

  expect(row?.spend).toBe(150);
  expect(row?.new_users).toBe(15);
  expect(row?.roi1).toBeCloseTo((0.25 * 120 + 0.5 * 30) / 150);
});

test("rollupMediaRows returns null when there is nothing to roll up", () => {
  expect(rollupMediaRows([])).toBeNull();
  expect(rollupMediaRows(undefined)).toBeNull();
});

test("rollupMediaRows reports undefined ratios as null, not zero", () => {
  const row = rollupMediaRows([{ spend: 0, new_users: 0, recharge: 120 }]);

  expect(row?.recharge).toBe(120);
  expect(row?.cpa).toBeNull();
  expect(row?.ltv1).toBeNull();
  expect(row?.roi1).toBeNull();
});

test("visibleLtvDays keeps only the milestones that carry data", () => {
  expect(visibleLtvDays([{ ltv1: 1, ltv2: 0, ltv3: 2 }])).toEqual([1, 3]);
  expect(visibleLtvDays([])).toEqual([]);
});
