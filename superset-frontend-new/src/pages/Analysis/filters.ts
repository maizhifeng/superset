import dayjs from "dayjs";
import type { SimpleFilter } from "@/utils/query/types";
import {
  DEFAULT_PROJECT_COMPARE_ANCHORS,
  DEFAULT_PROJECT_COMPARE_PERIOD_DAYS,
  isPeriodDays,
  normalizeAnchors,
  PROJECT_COMPARE_ANCHORS,
  sameAnchors,
  type AnchorKey,
} from "./anchorOptions";
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
  /**
   * Anchor rounds compared by the project-comparison topic (上线/首测/二测/
   * 三测).  Unused by other topics; kept in the shared filter state so the
   * control lives in the page's filter bar and the URL stays shareable.
   */
  anchors: AnchorKey[];
  /** Observation window in days after the anchor (project comparison). */
  periodDays: number;
  /**
   * Explicitly selected comparison projects (``region:papp_id`` keys).  Empty
   * means "automatic": the view seeds the spend ranking's top projects.
   */
  projects: string[];
  /** Metric-catalog key shown by the comparison chart; unset uses the first. */
  compareMetric?: string;
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

/**
 * Version of the analysis filter URL schema.
 *
 * URLs written before this marker predate the date-first breakdown default, so
 * their ``dim``/``date``/``week``/``drill_*`` params would keep resurrecting the
 * old view (e.g. 主游戏).  They are parsed without that view state; every URL
 * written by the current page carries ``v=2`` and round-trips fully.
 */
export const FILTERS_URL_VERSION = "2";

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
    anchors: [...DEFAULT_PROJECT_COMPARE_ANCHORS],
    periodDays: DEFAULT_PROJECT_COMPARE_PERIOD_DAYS,
    projects: [],
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
  const versioned = params.get("v") === FILTERS_URL_VERSION;
  // Filters the topic hides from its toolbar are ignored on read: a link
  // shared from another topic (or kept by the breadcrumb topic switcher) can
  // still carry them, and silently applying a scope the page no longer shows
  // would make the page disagree with its own toolbar.
  const hiddenFilters = new Set(topic.hiddenFilters ?? []);
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
    // Hidden filters are ignored, not just removed from the toolbar: a link
    // shared from another topic can still carry them, and applying a scope the
    // page no longer shows would be invisible.  Drill context is separate and
    // stays honoured because the drill chips are rendered in the page.
    hiddenFilters.has(key)
      ? []
      : params
          .getAll(key)
          .map((value) => value.trim())
          .filter(Boolean);

  const rawDimension = versioned ? params.get("dim") : null;
  const dimension =
    rawDimension &&
    (rawDimension === ANALYSIS_TIME_COLUMN ||
      topic.dimensions.some((item) => item.key === rawDimension))
      ? rawDimension
      : fallback.dimension;
  const rawFocusDate = versioned ? params.get("date") : null;
  const focusDate = isValidDate(rawFocusDate) ? rawFocusDate : undefined;
  const rawFocusWeek = versioned ? params.get("week") : null;
  const focusWeek = isValidDate(rawFocusWeek) ? rawFocusWeek : undefined;
  const drill: Partial<Record<FilterKey, string[]>> = {};
  // The switch is URL-encoded only when disabled; older links default to on.
  const includeNatural = params.get("natural") !== "0";
  // Project-comparison controls: an absent/invalid selection falls back to the
  // defaults, so links written by other topics still load here.
  const anchors = normalizeAnchors(params.getAll("anchor"));
  const rawPeriod = Number(params.get("period"));
  const periodDays = isPeriodDays(rawPeriod)
    ? rawPeriod
    : DEFAULT_PROJECT_COMPARE_PERIOD_DAYS;
  const projects = params
    .getAll("project")
    .map((value) => value.trim())
    .filter(Boolean);
  // Only metrics the topic actually compares are accepted from the URL.
  const rawMetric = params.get("metric");
  const compareMetric =
    rawMetric && topic.extra?.metrics?.includes(rawMetric)
      ? rawMetric
      : undefined;
  if (versioned) {
    for (const definition of FILTER_DEFINITIONS) {
      const drillValues = params
        .getAll(`drill_${definition.key}`)
        .map((value) => value.trim())
        .filter(Boolean);
      if (drillValues.length > 0) drill[definition.key] = drillValues;
    }
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
    anchors,
    periodDays,
    projects,
    compareMetric,
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
  params.set("v", FILTERS_URL_VERSION);
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
  // Compare controls are only written when they differ from the defaults, so
  // other topics' links stay free of parameters they never use.
  if (!sameAnchors(filters.anchors, DEFAULT_PROJECT_COMPARE_ANCHORS)) {
    // Canonical order keeps shared links stable regardless of click order.
    for (const anchor of PROJECT_COMPARE_ANCHORS) {
      if (filters.anchors.includes(anchor)) params.append("anchor", anchor);
    }
  }
  if (filters.periodDays !== DEFAULT_PROJECT_COMPARE_PERIOD_DAYS) {
    params.set("period", String(filters.periodDays));
  }
  for (const project of filters.projects) params.append("project", project);
  if (filters.compareMetric) params.set("metric", filters.compareMetric);
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
