import type { AnalysisFilters, FilterKey } from "./filters";
import { ANALYSIS_TIME_COLUMN } from "./topics";
import type { AnalysisTopic } from "./types";

const DIMENSION_FILTER_KEYS: Record<string, FilterKey> = {
  主游戏: "games",
  媒体: "media",
  渠道商: "channels",
  平台: "platforms",
  地区: "regions",
};

export function drillPath(topic: AnalysisTopic): string[] {
  return topic.drilldownPath ?? topic.dimensions.map((item) => item.key);
}

export function nextDrillDimension(
  topic: AnalysisTopic,
  dimension: string,
): string | null {
  const path = drillPath(topic);
  const index = path.indexOf(dimension);
  if (index === -1 || index === path.length - 1) return null;
  return path[index + 1];
}

/** The dimension a filter key belongs to (inverse of the drill filter map). */
export function dimensionForFilterKey(key: FilterKey): string | null {
  const entry = Object.entries(DIMENSION_FILTER_KEYS).find(
    ([, filterKey]) => filterKey === key,
  );
  return entry ? entry[0] : null;
}

/**
 * Step one drill level back: drop the filter of `key` and every deeper level,
 * then move the table/chart back to the dimension that filter belongs to.
 */
export function removeDrillLevel(
  filters: AnalysisFilters,
  topic: AnalysisTopic,
  key: FilterKey,
): AnalysisFilters {
  const drill = { ...(filters.drill ?? {}) };
  delete drill[key];
  const dimension = dimensionForFilterKey(key);
  if (!dimension) return { ...filters, drill };

  const path = drillPath(topic);
  const index = path.indexOf(dimension);
  if (index >= 0) {
    for (const deeper of path.slice(index + 1)) {
      const deeperKey = DIMENSION_FILTER_KEYS[deeper];
      if (deeperKey) delete drill[deeperKey];
    }
  }
  return { ...filters, drill, dimension };
}

export function drillTargetLabel(
  topic: AnalysisTopic,
  dimension: string,
): string | null {
  const next = nextDrillDimension(topic, dimension);
  if (!next) return null;
  return topic.dimensions.find((item) => item.key === next)?.label ?? next;
}

/**
 * Enter drill mode from a trend-chart date: apply that single day and move one
 * level down the topic hierarchy (time → next dimension).  When the current
 * dimension is already the last level, the chart stays on it and only the date
 * becomes the active drill context.
 */
export function enterDateDrill(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  date: string,
): AnalysisFilters {
  const target =
    nextDrillDimension(topic, filters.dimension) ?? filters.dimension;
  return { ...filters, focusDate: date, dimension: target };
}

/**
 * Next hierarchy dimension after the current drill filters.  The time view
 * (dimension 日期) has no hierarchy of its own; when it is filtered to a
 * channel, this resolves the next level (媒体) so the trend can keep drilling.
 */
export function nextDimensionAfterDrills(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
): string | null {
  const path = drillPath(topic);
  let deepest = -1;
  for (const [key, values] of Object.entries(filters.drill ?? {})) {
    if (!values || values.length === 0) continue;
    const dimension = dimensionForFilterKey(key as FilterKey);
    if (!dimension) continue;
    deepest = Math.max(deepest, path.indexOf(dimension));
  }
  if (deepest >= 0) return path[deepest + 1] ?? null;
  return path[0] ?? null;
}

/** Weekly drill always opens the channel breakdown, regardless of the topic's
 * default/terminal dimension (e.g. the channel topic defaults to 媒体). */
export function weeklyDrillDimension(topic: AnalysisTopic): string | null {
  return drillPath(topic).includes("渠道商") ? "渠道商" : null;
}

/**
 * From a single-day drill, clicking a category should pivot to that category's
 * day-by-day view instead of continuing down the hierarchy (e.g. a channel's
 * daily trend), so the date context becomes a filter and time becomes the
 * breakdown dimension.
 */
export function pivotDrillToTime(
  filters: AnalysisFilters,
  topic: AnalysisTopic,
  dimension: string,
  value: string,
): AnalysisFilters | null {
  const currentKey = DIMENSION_FILTER_KEYS[dimension];
  if (!currentKey) return null;

  const path = drillPath(topic);
  const index = path.indexOf(dimension);
  const drill = { ...(filters.drill ?? {}) };
  if (index >= 0) {
    for (const deeperDimension of path.slice(index + 1)) {
      const key = DIMENSION_FILTER_KEYS[deeperDimension];
      if (key) delete drill[key];
    }
  }
  drill[currentKey] = [value];

  return {
    ...filters,
    focusDate: undefined,
    drill,
    dimension: ANALYSIS_TIME_COLUMN,
  };
}

/**
 * Apply a hierarchical drill: keep the clicked value as a filter for the
 * current dimension, clear any filters for dimensions below it, and move the
 * table to the next dimension in the topic's hierarchy.
 */
export function applyDimensionDrill(
  filters: AnalysisFilters,
  topic: AnalysisTopic,
  dimension: string,
  value: string,
): AnalysisFilters | null {
  const currentKey = DIMENSION_FILTER_KEYS[dimension];
  const next = nextDrillDimension(topic, dimension);
  if (!currentKey || !next) return null;

  const path = drillPath(topic);
  const index = path.indexOf(dimension);
  const drill = { ...(filters.drill ?? {}) };
  for (const deeperDimension of path.slice(index + 1)) {
    const key = DIMENSION_FILTER_KEYS[deeperDimension];
    if (key) delete drill[key];
  }
  drill[currentKey] = [value];

  return {
    ...filters,
    drill,
    dimension: next,
  };
}
