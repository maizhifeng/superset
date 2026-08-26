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
import { describe, expect, test } from "vitest";
import { supersetPalette } from "@/theme/palette";
import { BRIEFING_CHART_CHROME, BRIEFING_CHART_COLORS } from "../reportStyles";

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe("BRIEFING_CHART_COLORS", () => {
  test("every entry is a plain hex color", () => {
    for (const value of Object.values(BRIEFING_CHART_COLORS)) {
      expect(value).toMatch(HEX_RE);
    }
    expect(BRIEFING_CHART_CHROME.axisLabel).toMatch(HEX_RE);
    expect(BRIEFING_CHART_CHROME.gridLine).toMatch(HEX_RE);
  });

  test("each metric series keeps a distinct hue", () => {
    const series = [
      BRIEFING_CHART_COLORS.spend,
      BRIEFING_CHART_COLORS.newUsers,
      BRIEFING_CHART_COLORS.roi1,
      BRIEFING_CHART_COLORS.ltv1,
    ];
    // 新增进入 bars and the ROI1 line used to share #5a8f6a; distinct hues
    // keep the visual encoding unambiguous.
    expect(new Set(series).size).toBe(series.length);
  });

  test("colors are derived from the app palette tokens", () => {
    expect(BRIEFING_CHART_COLORS.spend).toBe(supersetPalette.primary.main);
    expect(BRIEFING_CHART_COLORS.newUsers).toBe(supersetPalette.chart[1]);
    expect(BRIEFING_CHART_COLORS.roi1).toBe(supersetPalette.success.main);
    expect(BRIEFING_CHART_COLORS.ltv1).toBe(supersetPalette.info.main);
    expect(BRIEFING_CHART_COLORS.breakevenLine).toBe(
      supersetPalette.error.main,
    );
    expect(BRIEFING_CHART_CHROME.axisLabel).toBe(
      supersetPalette.text.secondary,
    );
    expect(BRIEFING_CHART_CHROME.gridLine).toBe(supersetPalette.divider);
  });
});
