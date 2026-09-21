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
import { gamesOf, summarizeDailyRows, visibleLtvDays } from "../reportData";

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

test("visibleLtvDays keeps only the milestones that carry data", () => {
  expect(visibleLtvDays([{ ltv1: 1, ltv2: 0, ltv3: 2 }])).toEqual([1, 3]);
  expect(visibleLtvDays([])).toEqual([]);
});
