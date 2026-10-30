import { test, expect } from "vitest";
import { defaultFilters } from "@/pages/Analysis/filters";
import {
  applyDimensionDrill,
  drillPath,
  drillTargetLabel,
  enterDateDrill,
  nextDimensionAfterDrills,
  nextDrillDimension,
  pivotDrillToTime,
  removeDrillLevel,
  weeklyDrillDimension,
} from "@/pages/Analysis/drilldown";
import { ANALYSIS_TOPICS, getAnalysisTopic } from "@/pages/Analysis/topics";

const cost = getAnalysisTopic("cost")!;
const channel = getAnalysisTopic("channel")!;
const retention = getAnalysisTopic("retention")!;

test("exposes the configured drill hierarchy", () => {
  expect(drillPath(cost)).toEqual(["主游戏", "渠道商", "媒体"]);
  expect(nextDrillDimension(cost, "主游戏")).toBe("渠道商");
  expect(nextDrillDimension(cost, "渠道商")).toBe("媒体");
  expect(nextDrillDimension(cost, "媒体")).toBeNull();
  expect(drillTargetLabel(cost, "主游戏")).toBe("渠道商");
  // The channel topic starts at 媒体, which is the terminal level.
  expect(nextDrillDimension(channel, "媒体")).toBeNull();
});

test("all topics share the 主游戏 → 渠道商 → 媒体 drill order", () => {
  for (const topic of ANALYSIS_TOPICS) {
    expect(drillPath(topic)).toEqual(["主游戏", "渠道商", "媒体"]);
    expect(drillPath(topic)).not.toContain("平台");
  }
});

test("drills to the next dimension and keeps the clicked value as a filter", () => {
  const filters = {
    ...defaultFilters(cost),
    games: ["手动筛选游戏"],
    dimension: "媒体",
  };
  const next = applyDimensionDrill(filters, cost, "主游戏", "游戏 C");
  expect(next).toMatchObject({
    games: ["手动筛选游戏"],
    dimension: "渠道商",
    drill: { games: ["游戏 C"] },
  });
});

test("clears deeper drill filters when drilling from a parent dimension", () => {
  const filters = {
    ...defaultFilters(cost),
    drill: {
      games: ["游戏 A"],
      channels: ["渠道商 B"],
      media: ["媒体 C"],
    },
    dimension: "主游戏",
  };
  const next = applyDimensionDrill(filters, cost, "主游戏", "游戏 B");
  expect(next?.drill).toEqual({ games: ["游戏 B"] });
  expect(next?.dimension).toBe("渠道商");
});

test("does not drill below the last hierarchy level", () => {
  const filters = { ...defaultFilters(cost), dimension: "媒体" };
  expect(applyDimensionDrill(filters, cost, "媒体", "Facebook")).toBeNull();
});

test("enters date drill mode one hierarchy level deeper", () => {
  const filters = defaultFilters(cost);
  const next = enterDateDrill(cost, filters, "2026-10-09");
  expect(next.focusDate).toBe("2026-10-09");
  expect(next.dimension).toBe("渠道商");
  // Retention/LTV used to drill media-first; the unified order is vendor-first.
  expect(
    enterDateDrill(retention, defaultFilters(retention), "2026-10-09").dimension,
  ).toBe("渠道商");

  // The channel topic starts on 媒体 (terminal level), so the date drill keeps
  // that dimension and only applies the day filter.
  expect(enterDateDrill(channel, defaultFilters(channel), "2026-10-09").dimension).toBe(
    "媒体",
  );
});

test("keeps the last dimension when there is nothing deeper to drill into", () => {
  const filters = { ...defaultFilters(cost), dimension: "媒体" };
  const next = enterDateDrill(cost, filters, "2026-10-09");
  expect(next.dimension).toBe("媒体");
  expect(next.focusDate).toBe("2026-10-09");
});

test("平台 stays selectable as a breakdown dimension but cannot be drilled", () => {
  const filters = { ...defaultFilters(cost), dimension: "平台" };
  expect(applyDimensionDrill(filters, cost, "平台", "移动端")).toBeNull();
});

test("steps back one drill level and clears deeper filters", () => {
  const filters = {
    ...defaultFilters(cost),
    dimension: "媒体",
    drill: { games: ["游戏 A"], channels: ["渠道商 B"] },
  };
  const back = removeDrillLevel(filters, cost, "channels");
  expect(back.dimension).toBe("渠道商");
  expect(back.drill).toEqual({ games: ["游戏 A"] });

  const top = removeDrillLevel(filters, cost, "games");
  expect(top.dimension).toBe("主游戏");
  expect(top.drill).toEqual({});
});

test("pivots a single-day drill into the category's daily view", () => {
  const filters = {
    ...defaultFilters(cost),
    focusDate: "2026-10-09",
    dimension: "渠道商",
    drill: { games: ["游戏 A"] },
  };
  const next = pivotDrillToTime(filters, cost, "渠道商", "android");

  expect(next?.focusDate).toBeUndefined();
  expect(next?.dimension).toBe("日期");
  // The clicked category becomes a filter; game context is preserved.
  expect(next?.drill).toEqual({
    games: ["游戏 A"],
    channels: ["android"],
  });
  // Time is a terminal breakdown, so no further hierarchy drill is offered.
  expect(nextDrillDimension(cost, next?.dimension ?? "")).toBeNull();
});

test("weekly drill pivots to the channel's daily view inside the week", () => {
  const filters = {
    ...defaultFilters(cost),
    focusWeek: "2026-09-27",
    dimension: "渠道商",
  };
  const next = pivotDrillToTime(filters, cost, "渠道商", "android");

  expect(next?.dimension).toBe("日期");
  expect(next?.focusWeek).toBe("2026-09-27");
  expect(next?.focusDate).toBeUndefined();
  expect(next?.drill?.channels).toEqual(["android"]);
});

test("weekly drill always opens the channel dimension", () => {
  for (const topic of ANALYSIS_TOPICS) {
    expect(weeklyDrillDimension(topic)).toBe("渠道商");
  }
});

test("resolves the next media level after a channel-filtered time view", () => {
  const base = defaultFilters(cost);
  expect(
    nextDimensionAfterDrills(cost, {
      ...base,
      dimension: "日期",
      drill: { channels: ["android"] },
    }),
  ).toBe("媒体");
  expect(
    nextDimensionAfterDrills(cost, {
      ...base,
      dimension: "日期",
      drill: { games: ["游戏 A"], channels: ["android"] },
    }),
  ).toBe("媒体");
  expect(
    nextDimensionAfterDrills(cost, {
      ...base,
      dimension: "日期",
      drill: { channels: ["android"], media: ["Google"] },
    }),
  ).toBeNull();
});
