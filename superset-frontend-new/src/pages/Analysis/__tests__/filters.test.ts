import dayjs from "dayjs";
import { test, expect } from "vitest";
import {
  defaultFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
  resolveDateBounds,
  resolveMatureDateBounds,
  resolvePreviousPeriodBounds,
  resolveTimeRange,
  toQueryFilters,
  toTrendFilters,
} from "@/pages/Analysis/filters";
import { getAnalysisTopic } from "@/pages/Analysis/topics";

const topic = getAnalysisTopic("cost")!;
const projectCompareTopic = getAnalysisTopic("project-compare")!;

test("default filters use 30 days and the topic dimension", () => {
  const filters = defaultFilters(topic);
  expect(filters.range).toBe("30d");
  expect(filters.dimension).toBe("日期");
  expect(filters.games).toEqual([]);
});

test("serializes and parses filters through the URL", () => {
  const filters = {
    ...defaultFilters(topic),
    range: "14d" as const,
    games: ["游戏 A", "游戏 B"],
    regions: ["国内"],
    media: ["媒体 A"],
    drill: { games: ["游戏 B"] },
    dimension: "媒体",
  };
  const params = filtersToSearchParams(filters);
  const parsed = filtersFromSearchParams(params, topic);
  expect(parsed.range).toBe("14d");
  expect(parsed.games).toEqual(["游戏 A", "游戏 B"]);
  expect(parsed.regions).toEqual(["国内"]);
  expect(parsed.media).toEqual(["媒体 A"]);
  expect(parsed.drill.games).toEqual(["游戏 B"]);
  expect(parsed.dimension).toBe("媒体");
});

test("custom range keeps explicit dates", () => {
  const filters = {
    ...defaultFilters(topic),
    range: "custom" as const,
    start: "2026-09-01",
    end: "2026-09-30",
    focusDate: "2026-09-15",
  };
  const parsed = filtersFromSearchParams(filtersToSearchParams(filters), topic);
  expect(parsed.range).toBe("custom");
  expect(parsed.start).toBe("2026-09-01");
  expect(parsed.end).toBe("2026-09-30");
  expect(parsed.focusDate).toBe("2026-09-15");
  expect(resolveTimeRange(parsed)).toBe("2026-09-01 : 2026-09-30");
});

test("malformed custom dates fall back to the default range", () => {
  const params = new URLSearchParams("range=custom&start=bad&end=2026-09-30");
  const parsed = filtersFromSearchParams(params, topic);
  expect(parsed.range).toBe("30d");
  expect(parsed.start).toBeUndefined();
  expect(parsed.end).toBeUndefined();
});

test("drops an invalid drill-down date", () => {
  const parsed = filtersFromSearchParams(
    new URLSearchParams("date=not-a-date"),
    topic,
  );
  expect(parsed.focusDate).toBeUndefined();
});

test("unknown dimension falls back to the topic default", () => {
  const params = new URLSearchParams("dim=不存在");
  expect(filtersFromSearchParams(params, topic).dimension).toBe("日期");
});

test("preset ranges span the expected number of days", () => {
  const filters = { ...defaultFilters(topic), range: "7d" as const };
  const { start, end } = resolveDateBounds(filters);
  expect(dayjs(end).diff(dayjs(start), "day")).toBe(6);
});

test("mature bounds end at the observation-window cutoff", () => {
  const filters = { ...defaultFilters(topic), range: "30d" as const };
  const { start, end } = resolveMatureDateBounds(filters, 30);
  expect(dayjs(end).isSame(dayjs().subtract(30, "day"), "day")).toBe(true);
  expect(dayjs(end).diff(dayjs(start), "day")).toBe(29);
});

test("previous period ends immediately before the current window", () => {
  const filters = { ...defaultFilters(topic), range: "30d" as const };
  const current = resolveMatureDateBounds(filters, 30);
  const previous = resolvePreviousPeriodBounds(filters, 30);
  expect(dayjs(previous.end).add(1, "day").isSame(current.start, "day")).toBe(
    true,
  );
  expect(dayjs(previous.end).diff(dayjs(previous.start), "day")).toBe(29);
});

test("maps selected values to chart-data filters", () => {
  const filters = {
    ...defaultFilters(topic),
    games: ["游戏 A"],
    regions: ["国内", "海外"],
  };
  expect(toQueryFilters(filters)).toEqual([
    { col: "主游戏", op: "IN", val: ["游戏 A"] },
    { col: "地区", op: "IN", val: ["国内", "海外"] },
  ]);
});

test("natural traffic is included by default and excluded only from trend filters", () => {
  const filters = defaultFilters(topic);
  expect(filters.includeNatural).toBe(true);
  expect(toTrendFilters(filters)).toEqual(toQueryFilters(filters));

  const excluded = { ...filters, media: ["Google"], includeNatural: false };
  // The page-level media filter stays a positive IN filter for the KPI/table;
  // the trend gets the extra exclusion clause.
  expect(toQueryFilters(excluded)).toEqual([
    { col: "媒体", op: "IN", val: ["Google"] },
  ]);
  expect(toTrendFilters(excluded)).toContainEqual({
    col: "媒体",
    op: "NOT IN",
    val: ["自然量"],
  });
});

test("URL round-trips the natural-traffic switch only when disabled", () => {
  const enabled = defaultFilters(topic);
  expect(filtersToSearchParams(enabled).get("natural")).toBeNull();
  expect(
    filtersFromSearchParams(filtersToSearchParams(enabled), topic)
      .includeNatural,
  ).toBe(true);

  const disabled = { ...enabled, includeNatural: false };
  const params = filtersToSearchParams(disabled);
  expect(params.get("natural")).toBe("0");
  expect(filtersFromSearchParams(params, topic).includeNatural).toBe(false);
});

test("accepts the time dimension in drill URLs", () => {
  const params = new URLSearchParams("v=2&dim=日期&drill_channels=android");
  const filters = filtersFromSearchParams(params, topic);
  expect(filters.dimension).toBe("日期");
  expect(filters.drill.channels).toEqual(["android"]);
  expect(filtersToSearchParams(filters).get("dim")).toBe("日期");
});

test("parses and resolves a weekly drill context", () => {
  const params = new URLSearchParams("v=2&week=2026-09-27&dim=渠道商");
  const filters = filtersFromSearchParams(params, topic);
  expect(filters.focusWeek).toBe("2026-09-27");
  expect(resolveDateBounds(filters)).toEqual({
    start: "2026-09-27",
    end: "2026-10-03",
  });
  expect(filtersToSearchParams(filters).get("week")).toBe("2026-09-27");
});

test("ignores view state from unversioned legacy links", () => {
  // URLs written before the schema marker would otherwise resurrect the old
  // default view (主游戏) and its drills after the date-first migration.
  const legacy = new URLSearchParams(
    "dim=主游戏&drill_games=游戏 A&date=2026-10-09&week=2026-09-27",
  );
  const filters = filtersFromSearchParams(legacy, topic);
  expect(filters.dimension).toBe("日期");
  expect(filters.drill).toEqual({});
  expect(filters.focusDate).toBeUndefined();
  expect(filters.focusWeek).toBeUndefined();
  // Range and column filters still parse from legacy links.
  const legacyRange = new URLSearchParams("range=7d&games=游戏 A&dim=主游戏");
  const rangeFilters = filtersFromSearchParams(legacyRange, topic);
  expect(rangeFilters.range).toBe("7d");
  expect(rangeFilters.games).toEqual(["游戏 A"]);
  expect(rangeFilters.dimension).toBe("日期");

  // Versioned URLs keep honouring an explicit dimension.
  const current = filtersToSearchParams({
    ...defaultFilters(topic),
    dimension: "主游戏",
  });
  expect(current.get("v")).toBe("2");
  expect(filtersFromSearchParams(current, topic).dimension).toBe("主游戏");
});

test("ignores filters the topic hides from its toolbar", () => {
  const projectCompare = getAnalysisTopic("project-compare")!;
  const params = new URLSearchParams();
  params.set("v", "2");
  params.set("range", "30d");
  params.append("games", "游戏 A");
  params.append("regions", "mainland");
  params.append("drill_games", "游戏 B");

  // A link shared from another topic can carry the hidden filter; applying it
  // without showing it in the toolbar would silently narrow the page.
  const parsed = filtersFromSearchParams(params, projectCompare);
  expect(parsed.games).toEqual([]);
  // Region/platform are hidden for the comparison topic as well.
  expect(parsed.regions).toEqual([]);
  expect(parsed.platforms).toEqual([]);
  // Drill context stays honoured: the page renders drilling chips for it.
  expect(parsed.drill.games).toEqual(["游戏 B"]);

  // Topics that show the filter still parse it.
  expect(filtersFromSearchParams(params, topic).games).toEqual(["游戏 A"]);
});

test("round-trips the comparison anchors and window through the URL", () => {
  const filters = {
    ...defaultFilters(projectCompareTopic),
    anchors: ["首测起始时间", "上线时间"] as const,
    periodDays: 60,
  };
  const params = filtersToSearchParams({
    ...filters,
    anchors: [...filters.anchors],
  });
  expect(params.getAll("anchor")).toEqual(["上线时间", "首测起始时间"]);
  expect(params.get("period")).toBe("60");

  const parsed = filtersFromSearchParams(params, projectCompareTopic);
  expect(parsed.anchors).toEqual(["上线时间", "首测起始时间"]);
  expect(parsed.periodDays).toBe(60);
});

test("invalid anchor/window values fall back to the (empty) defaults", () => {
  const params = new URLSearchParams();
  params.set("v", "2");
  params.set("range", "30d");
  params.append("anchor", "不存在的轮次");
  params.set("period", "13");

  const parsed = filtersFromSearchParams(params, projectCompareTopic);
  // No anchor is selected by default; an invalid value does not invent one.
  expect(parsed.anchors).toEqual([]);
  expect(parsed.periodDays).toBe(30);

  // Duplicates collapse and the selection keeps the display order.
  const deduped = new URLSearchParams();
  deduped.set("v", "2");
  deduped.append("anchor", "二测起始时间");
  deduped.append("anchor", "二测起始时间");
  expect(filtersFromSearchParams(deduped, projectCompareTopic).anchors).toEqual(
    ["二测起始时间"],
  );
});

test("default comparison controls are omitted from the URL", () => {
  const defaults = defaultFilters(projectCompareTopic);
  expect(defaults.anchors).toEqual([]);
  expect(defaults.projects).toEqual([]);
  const params = filtersToSearchParams(defaults);
  expect(params.getAll("anchor")).toEqual([]);
  expect(params.getAll("project")).toEqual([]);
  expect(params.get("metric")).toBeNull();
  expect(params.get("period")).toBeNull();
  // A non-default control is written so the link stays shareable.
  const custom = filtersToSearchParams({
    ...defaultFilters(projectCompareTopic),
    anchors: ["上线时间", "二测起始时间"],
    periodDays: 90,
  });
  expect(custom.getAll("anchor")).toEqual(["上线时间", "二测起始时间"]);
  expect(custom.get("period")).toBe("90");
});
