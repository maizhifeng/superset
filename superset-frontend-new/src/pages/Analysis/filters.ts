import dayjs from "dayjs";
import type { SimpleFilter } from "@/utils/query/types";
import { ANALYSIS_TIME_COLUMN } from "./topics";
import type { AnalysisTopic } from "./types";

export type RangeValue = "7d" | "14d" | "30d" | "90d" | "custom";

export const RANGE_OPTIONS: { value: RangeValue; label: string }[] = [
  { value: "7d", label: "近 7 天" },
  { value: "14d", label: "近 14 天" },
  { value: "30d", label: "近 30 天" },
  { value: "90d", label: "近 90 天" },
  { value: "custom", label: "自定义" },
];

const RANGE_DAYS: Record<Exclude<RangeValue, "custom">, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
};

export const FILTER_DEFINITIONS = [
  { key: "games", column: "主游戏", label: "主游戏" },
  { key: "regions", column: "地区", label: "地区" },
  { key: "media", column: "媒体", label: "媒体" },
  { key: "channels", column: "渠道商", label: "渠道商" },
  { key: "platforms", column: "平台", label: "平台" },
] as const;

export type FilterKey = (typeof FILTER_DEFINITIONS)[number]["key"];

export interface AnalysisFilters {
  range: RangeValue;
  start?: string;
  end?: string;
  /** Optional single-day focus for the breakdown table (chart drill-down). */
  focusDate?: string;
  /** Sunday start of a drilled week (weekly chart drill-down). */
  focusWeek?: string;
  games: string[];
  regions: string[];
  media: string[];
  channels: string[];
  platforms: string[];
  /** Parent-dimension filters kept by hierarchical table drill-down. */
  drill: Partial<Record<FilterKey, string[]>>;
  dimension: string;
  /**
   * Whether the trend chart includes rows whose 媒体 is 自然量. Defaults to
   * true; only the trend queries honour it (KPIs and the breakdown table keep
   * the page scope).
   */
  includeNatural?: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string | null | undefined): value is string {
  return Boolean(value && DATE_PATTERN.test(value) && dayjs(value).isValid());
}

export function defaultFilters(topic: AnalysisTopic): AnalysisFilters {
  return {
    range: "30d",
    games: [],
    regions: [],
    media: [],
    channels: [],
    platforms: [],
    drill: {},
    dimension: topic.defaultDimension,
    includeNatural: true,
  };
}

/** Read filters from the URL; unknown or malformed values fall back safely. */
export function filtersFromSearchParams(
  params: URLSearchParams,
  topic: AnalysisTopic,
): AnalysisFilters {
  const fallback = defaultFilters(topic);
  const rawRange = params.get("range");
  let range: RangeValue = fallback.range;
  if (RANGE_OPTIONS.some((option) => option.value === rawRange)) {
    range = rawRange as RangeValue;
  }

  let start = params.get("start") ?? undefined;
  let end = params.get("end") ?? undefined;
  if (!isValidDate(start) || !isValidDate(end)) {
    start = undefined;
    end = undefined;
  }
  if (start && end && dayjs(start).isAfter(dayjs(end))) {
    start = undefined;
    end = undefined;
  }
  if (range === "custom" && (!start || !end)) {
    range = fallback.range;
    start = undefined;
    end = undefined;
  }

  const values = (key: FilterKey) =>
    params
      .getAll(key)
      .map((value) => value.trim())
      .filter(Boolean);

  const rawDimension = params.get("dim");
  const dimension =
    rawDimension &&
    (rawDimension === ANALYSIS_TIME_COLUMN ||
      topic.dimensions.some((item) => item.key === rawDimension))
      ? rawDimension
      : fallback.dimension;
  const rawFocusDate = params.get("date");
  const focusDate = isValidDate(rawFocusDate) ? rawFocusDate : undefined;
  const rawFocusWeek = params.get("week");
  const focusWeek = isValidDate(rawFocusWeek) ? rawFocusWeek : undefined;
  const drill: Partial<Record<FilterKey, string[]>> = {};
  // The switch is URL-encoded only when disabled; older links default to on.
  const includeNatural = params.get("natural") !== "0";
  for (const definition of FILTER_DEFINITIONS) {
    const drillValues = params
      .getAll(`drill_${definition.key}`)
      .map((value) => value.trim())
      .filter(Boolean);
    if (drillValues.length > 0) drill[definition.key] = drillValues;
  }

  return {
    range,
    start,
    end,
    focusDate,
    focusWeek,
    games: values("games"),
    regions: values("regions"),
    media: values("media"),
    channels: values("channels"),
    platforms: values("platforms"),
    drill,
    dimension,
    includeNatural,
  };
}

/** Serialize filters into a shareable, stable URL query. */
export function filtersToSearchParams(
  filters: AnalysisFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("range", filters.range);
  if (filters.range === "custom" && filters.start && filters.end) {
    params.set("start", filters.start);
    params.set("end", filters.end);
  }
  if (filters.focusDate) {
    params.set("date", filters.focusDate);
  }
  if (filters.focusWeek) {
    params.set("week", filters.focusWeek);
  }
  for (const definition of FILTER_DEFINITIONS) {
    for (const value of filters[definition.key]) {
      params.append(definition.key, value);
    }
    for (const value of filters.drill?.[definition.key] ?? []) {
      params.append(`drill_${definition.key}`, value);
    }
  }
  if (filters.includeNatural === false) {
    params.set("natural", "0");
  }
  params.set("dim", filters.dimension);
  return params;
}

export interface DateBounds {
  start: string;
  end: string;
}

export function resolveDateBounds(filters: AnalysisFilters): DateBounds {
  if (filters.focusWeek && isValidDate(filters.focusWeek)) {
    const start = dayjs(filters.focusWeek);
    return {
      start: start.format("YYYY-MM-DD"),
      end: start.add(6, "day").format("YYYY-MM-DD"),
    };
  }
  if (
    filters.range === "custom" &&
    isValidDate(filters.start) &&
    isValidDate(filters.end)
  ) {
    return { start: filters.start, end: filters.end };
  }
  const days =
    filters.range === "custom" ? RANGE_DAYS["30d"] : RANGE_DAYS[filters.range];
  const end = dayjs();
  return {
    start: end.subtract(days - 1, "day").format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
  };
}

/** Superset time-range syntax: `start : end` (inclusive). */
export function resolveTimeRange(filters: AnalysisFilters): string {
  const { start, end } = resolveDateBounds(filters);
  return `${start} : ${end}`;
}

/**
 * Bounds for KPI/table queries on topics with an observation window.  The
 * selected window is shifted back until its end is old enough for every
 * metric in the topic to have matured, so a 30-day retention rate never
 * averages cohorts that have not reached day 30 yet.
 */
export function resolveMatureDateBounds(
  filters: AnalysisFilters,
  maturityDays = 0,
): DateBounds {
  const selected = resolveDateBounds(filters);
  if (maturityDays <= 0) return selected;
  const cutoff = dayjs().startOf("day").subtract(maturityDays, "day");
  const selectedEnd = dayjs(selected.end);
  if (!selectedEnd.isAfter(cutoff)) return selected;
  const span = Math.max(0, selectedEnd.diff(dayjs(selected.start), "day"));
  const end = cutoff.format("YYYY-MM-DD");
  return {
    start: cutoff.subtract(span, "day").format("YYYY-MM-DD"),
    end,
  };
}

export function resolveMatureTimeRange(
  filters: AnalysisFilters,
  maturityDays = 0,
): string {
  const { start, end } = resolveMatureDateBounds(filters, maturityDays);
  return `${start} : ${end}`;
}

/**
 * The comparison window immediately before the current KPI/table window.
 * Uses the mature window for topics with an observation period so the delta
 * compares two equally mature cohorts.
 */
export function resolvePreviousPeriodBounds(
  filters: AnalysisFilters,
  maturityDays = 0,
): DateBounds {
  const current = resolveMatureDateBounds(filters, maturityDays);
  const start = dayjs(current.start);
  const end = dayjs(current.end);
  const span = end.diff(start, "day") + 1;
  return {
    start: start.subtract(span, "day").format("YYYY-MM-DD"),
    end: start.subtract(1, "day").format("YYYY-MM-DD"),
  };
}

export function resolvePreviousPeriodTimeRange(
  filters: AnalysisFilters,
  maturityDays = 0,
): string {
  const { start, end } = resolvePreviousPeriodBounds(filters, maturityDays);
  return `${start} : ${end}`;
}

/** Turn the UI filters into the chart-data `filters` array. */
/** Media value treated as organic/natural traffic by the trend switch. */
export const NATURAL_MEDIA_VALUE = "自然量";

/** Whether the trend chart should include natural traffic rows. */
export function includesNaturalTraffic(filters: AnalysisFilters): boolean {
  return filters.includeNatural !== false;
}

/**
 * Trend filters = page filters + table drill context, plus a NOT IN 自然量
 * clause when the corresponding switch is disabled. The KPI totals and the
 * breakdown table deliberately keep using toQueryFilters/toBreakdownFilters.
 */
export function toTrendFilters(filters: AnalysisFilters): SimpleFilter[] {
  const result = toBreakdownFilters(filters);
  if (!includesNaturalTraffic(filters)) {
    result.push({ col: "媒体", op: "NOT IN", val: [NATURAL_MEDIA_VALUE] });
  }
  return result;
}

export function toQueryFilters(filters: AnalysisFilters): SimpleFilter[] {
  const result: SimpleFilter[] = [];
  for (const definition of FILTER_DEFINITIONS) {
    const values = filters[definition.key];
    if (values.length > 0) {
      result.push({ col: definition.column, op: "IN", val: values });
    }
  }
  return result;
}

/**
 * Breakdown filters combine global filters with the hierarchy context kept by
 * table drill-down. Drill values win when both exist for the same column.
 */
export function toBreakdownFilters(filters: AnalysisFilters): SimpleFilter[] {
  const merged: AnalysisFilters = { ...filters };
  for (const definition of FILTER_DEFINITIONS) {
    const drillValues = filters.drill?.[definition.key] ?? [];
    if (drillValues.length > 0) {
      merged[definition.key] = drillValues;
    }
  }
  return toQueryFilters(merged);
}
