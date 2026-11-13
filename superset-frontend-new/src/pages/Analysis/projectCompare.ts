import dayjs from "dayjs";
import { REGION_LABELS, isGameRegion, type GameRegion } from "@/config/regions";
import {
  ANCHOR_LABELS,
  hasAnyStart,
  resolveStartWindow,
  startKey,
  type AnchorKey,
  type StartMaps,
} from "@/pages/Dashboard/compareStartDate";
import type { ChartDataRow } from "@/types/api";
import type { QueryObject, SimpleFilter } from "@/utils/query/types";
import { toQueryFilters, type AnalysisFilters } from "./filters";
import { formatFullDay, toNumber } from "./format";
import {
  ANALYSIS_TIME_COLUMN,
  PROJECT_COMPARE_METRIC_KEYS,
  topicMetric,
} from "./topics";
import type { AnalysisMetric, AnalysisTopic } from "./types";
import { aggregateBucketMetric } from "./weekly";

/**
 * Pure planning/query/aggregation helpers for the "项目对比分析" topic.
 *
 * Every (project × anchor × window-length) combination needs its own query,
 * because each project is measured inside its own "anchor + N days" window and
 * that window is capped by the next milestone.  Queries return daily rows; the
 * window total and the day/week/month buckets are aggregated in the browser so
 * the grain switch never re-scans the backend.
 *
 * The view only owns UI state; all window/query/result shaping lives here so it
 * can be unit tested without a DOM.
 */

// The anchor/window choices live in the shared filter state (they are rendered
// in the page filter bar and persisted in the URL); re-exported here so the
// view and its tests keep importing them from the comparison module.
export {
  DEFAULT_PROJECT_COMPARE_ANCHORS,
  DEFAULT_PROJECT_COMPARE_PERIOD_DAYS,
  PROJECT_COMPARE_ANCHORS,
  PROJECT_COMPARE_PERIOD_DAYS,
} from "./anchorOptions";

/** Debounce before a changed comparison selection is queried. */
export const PROJECT_COMPARE_QUERY_DEBOUNCE_MS = 250;

/** One daily row per day of the window; 800 covers the 360-day window. */
export const PROJECT_COMPARE_DAILY_ROW_LIMIT = 800;

/** Dataset/project-config column holding a project's display name. */
const PROJECT_NAME_COLUMN = "主游戏";

/**
 * Federated-side discriminator for same-named projects.
 *
 * The two sides encode their region differently: the mainland SQL hard-codes
 * ``'mainland'::varchar as "地区"``, while the oversea SQL puts the real region
 * code (US/JP/...) in ``"地区"`` and marks itself with ``'oversea'::varchar as
 * "平台"``.  A single ``地区`` filter can therefore never isolate an oversea
 * project — that has to go through ``平台 = 'oversea'``.
 */
export const PROJECT_SIDE_FILTERS: Record<GameRegion, SimpleFilter> = {
  domestic: { col: "地区", op: "IN", val: ["mainland"] },
  oversea: { col: "平台", op: "IN", val: ["oversea"] },
};

/** Copy a side filter so callers cannot mutate the shared constant. */
function projectSideFilter(region: GameRegion): SimpleFilter {
  const filter = PROJECT_SIDE_FILTERS[region];
  return {
    col: filter.col,
    op: filter.op,
    val: Array.isArray(filter.val) ? [...filter.val] : filter.val,
  };
}

/** Chart x-axis grain: anchor-relative day, week or calendar month. */
export type ProjectCompareGrain = "day" | "week" | "month";

export const PROJECT_COMPARE_GRAINS: {
  key: ProjectCompareGrain;
  label: string;
}[] = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
];

export const DEFAULT_PROJECT_COMPARE_GRAIN: ProjectCompareGrain = "day";

/** One row of ``GET /project/papp``. */
export interface ProjectGameRow {
  papp_id: number | string;
  region?: string;
  papp_name?: string;
}

/** A selectable comparison project (region normalized, start date exists). */
export interface ProjectOption {
  papp_id: string;
  region: GameRegion;
  papp_name: string;
}

/** One query/section: a project measured in a specific anchor window. */
export interface ProjectCompareSection {
  /** Stable identity: project key + anchor. */
  key: string;
  project: ProjectOption;
  anchor: AnchorKey;
  /** Window start (``YYYY-MM-DD``). */
  start: string;
  /** Window end (``YYYY-MM-DD``, exclusive upstream / capped by next stage). */
  end: string;
  /** ``start ~ end`` as rendered in the table. */
  windowLabel: string;
}

/** A project × anchor pair that has no start date and is therefore skipped. */
export interface SkippedProjectCompareSection {
  project: ProjectOption;
  anchor: AnchorKey;
  label: string;
}

export interface ProjectComparePlan {
  sections: ProjectCompareSection[];
  skipped: SkippedProjectCompareSection[];
}

/** Daily rows of one comparison section. */
export type ProjectCompareSectionRows = ChartDataRow[];

/** Aggregated window values, keyed by the metric's response field. */
export type ProjectCompareTotals = Record<string, number | null>;

/** One chart series: a project inside one anchor window. */
export interface ProjectCompareChartSeries {
  /** Unique per project × anchor. */
  key: string;
  name: string;
  projectKey: string;
  anchor: AnchorKey;
  /** Aligned with the category list; ``null`` = no data in that bucket. */
  values: (number | null)[];
}

export interface ProjectCompareChartModel {
  categories: string[];
  series: ProjectCompareChartSeries[];
}

/** A comparison-table row: the planned window plus its aggregated totals. */
export interface ProjectCompareTableRow {
  section: ProjectCompareSection;
  rows: ProjectCompareSectionRows;
  totals: ProjectCompareTotals;
}

/**
 * Normalize the project region; legacy/missing values fall back to domestic,
 * matching how the project-config pages treat unlabelled games.
 */
export function normalizeProjectRegion(region: unknown): GameRegion {
  return typeof region === "string" && isGameRegion(region)
    ? region
    : "domestic";
}

/** Identity of a project: region-scoped, because oversea papp_ids can collide. */
export function projectKey(
  project: Pick<ProjectOption, "region" | "papp_id">,
): string {
  return startKey(project.region, project.papp_id);
}

/** ``项目名（国内/海外）`` — used by pickers and chart labels. */
export function projectOptionLabel(project: ProjectOption): string {
  return `${project.papp_name}（${REGION_LABELS[project.region]}）`;
}

/** Identity of one project × anchor comparison section. */
export function projectAnchorKey(
  project: ProjectOption,
  anchor: AnchorKey,
): string {
  return `${projectKey(project)}:${anchor}`;
}

/**
 * Selectable projects: both regions are loaded together, and a project only
 * qualifies when at least one of its anchors has a configured start date.
 */
export function buildProjectOptions(
  games: ProjectGameRow[],
  startMaps: StartMaps,
): ProjectOption[] {
  const seen = new Set<string>();
  const options: ProjectOption[] = [];
  for (const game of games) {
    const region = normalizeProjectRegion(game.region);
    const key = startKey(region, game.papp_id);
    if (seen.has(key) || !hasAnyStart(startMaps, key)) continue;
    seen.add(key);
    options.push({
      papp_id: String(game.papp_id),
      region,
      papp_name: String(game.papp_name ?? "").trim(),
    });
  }
  return options;
}

/** Convert an anchor window date (``YYYY/MM/DD``) to ``YYYY-MM-DD``. */
export function formatWindowDate(value: string): string {
  const parsed = dayjs(value);
  return parsed.isValid()
    ? parsed.format("YYYY-MM-DD")
    : value.replace(/\//g, "-");
}

function skippedSectionLabel(
  project: ProjectOption,
  anchor: AnchorKey,
): string {
  const anchorLabel = ANCHOR_LABELS[anchor];
  return `已跳过：${project.papp_name} · ${anchorLabel}（无${anchorLabel}起始日期）`;
}

/**
 * Plan one section per project × anchor.  Sections without a start date do not
 * produce a query; they are reported so the view can explain the gap instead of
 * silently dropping a project.
 */
export function planProjectCompareSections(
  projects: ProjectOption[],
  anchors: AnchorKey[],
  startMaps: StartMaps,
  periodDays: number,
): ProjectComparePlan {
  const sections: ProjectCompareSection[] = [];
  const skipped: SkippedProjectCompareSection[] = [];
  for (const project of projects) {
    const key = projectKey(project);
    for (const anchor of anchors) {
      const window = resolveStartWindow(startMaps, anchor, key, periodDays);
      if (!window) {
        skipped.push({
          project,
          anchor,
          label: skippedSectionLabel(project, anchor),
        });
        continue;
      }
      const start = formatWindowDate(window.start);
      const end = formatWindowDate(window.end);
      // ``end`` is exclusive for the query (`date >= start AND date < end`);
      // the label shows the last included day so the displayed range matches
      // the data (e.g. 20260916..20260923 → "2026-09-16 ~ 2026-09-22").
      const lastDay = dayjs(end).subtract(1, "day");
      const endInclusive =
        lastDay.isValid() && !lastDay.isBefore(dayjs(start))
          ? lastDay.format("YYYY-MM-DD")
          : start;
      sections.push({
        key: projectAnchorKey(project, anchor),
        project,
        anchor,
        start,
        end,
        windowLabel: `${start} ~ ${endInclusive}`,
      });
    }
  }
  return { sections, skipped };
}

/**
 * Page-level filters for this view.  The project picker owns the 主游戏 scope,
 * so the page's (hidden) games selection is dropped rather than merged.
 */
export function projectComparePageFilters(
  filters: AnalysisFilters,
): SimpleFilter[] {
  return toQueryFilters({ ...filters, games: [] });
}

/** The 14 metric definitions, in display order. */
export function projectCompareMetricDefs(
  topic: AnalysisTopic,
): AnalysisMetric[] {
  return PROJECT_COMPARE_METRIC_KEYS.map((key) => topicMetric(topic, key));
}

/**
 * Metrics fetched by every comparison query: the 14 compared metrics plus the
 * denominator metrics that coarse-bucket rate re-aggregation needs.  Deduped by
 * response field so the same SUM is never requested twice.
 */
export function projectCompareQueryMetrics(
  topic: AnalysisTopic,
): AnalysisMetric[] {
  const metricDefs = projectCompareMetricDefs(topic);
  const seen = new Set(metricDefs.map((metric) => metric.key));
  const result = [...metricDefs];
  for (const metric of metricDefs) {
    if (!metric.bucketWeight) continue;
    const weight = topicMetric(topic, metric.bucketWeight);
    if (seen.has(weight.key)) continue;
    seen.add(weight.key);
    result.push(weight);
  }
  return result;
}

/**
 * Response field of the denominator used to weight a rate metric.  ``null`` for
 * additive metrics (they are summed) and for unknown catalog keys.
 */
export function projectCompareWeightKey(
  topic: AnalysisTopic,
  metric: AnalysisMetric,
): string | null {
  if (!metric.bucketWeight) return null;
  try {
    return topicMetric(topic, metric.bucketWeight).key;
  } catch {
    return null;
  }
}

/**
 * One comparison query for a single project × anchor window.  Returns daily
 * rows: the window total and the day/week/month buckets are derived in the
 * browser, so switching the chart grain never issues another query.
 */
export function buildProjectCompareQuery(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  section: ProjectCompareSection,
): QueryObject {
  return {
    result_type: "full",
    metrics: projectCompareQueryMetrics(topic).map((metric) => metric.metric),
    groupby: [ANALYSIS_TIME_COLUMN],
    columns: [],
    filters: [
      ...projectComparePageFilters(filters),
      {
        col: PROJECT_NAME_COLUMN,
        op: "IN",
        val: [section.project.papp_name],
      },
      projectSideFilter(section.project.region),
    ],
    granularity: ANALYSIS_TIME_COLUMN,
    orderby: [[ANALYSIS_TIME_COLUMN, true]],
    time_range: `${section.start} : ${section.end}`,
    row_limit: PROJECT_COMPARE_DAILY_ROW_LIMIT,
  };
}

/** All comparison queries, aligned with the planned section list. */
export function buildProjectCompareQueries(
  topic: AnalysisTopic,
  filters: AnalysisFilters,
  sections: ProjectCompareSection[],
): QueryObject[] {
  return sections.map((section) =>
    buildProjectCompareQuery(topic, filters, section),
  );
}

function responseResultItems(response: unknown): unknown[] {
  if (!response || typeof response !== "object") return [];
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== "object") return [];
  const result = (data as { result?: unknown }).result;
  return Array.isArray(result) ? result : [];
}

/** ``result[i].data`` row arrays; malformed entries degrade to empty arrays. */
function responseRowLists(response: unknown): ChartDataRow[][] {
  return responseResultItems(response).map((item) => {
    if (!item || typeof item !== "object") return [];
    const rows = (item as { data?: unknown }).data;
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (row): row is ChartDataRow => Boolean(row) && typeof row === "object",
    );
  });
}

/**
 * Map the batched daily-row response onto the planned sections.  A missing
 * result or an empty ``data`` array becomes ``[]`` (rendered as ``–``), never a
 * whole-view error.
 */
export function parseProjectCompareResults(
  response: unknown,
  expectedCount: number,
): ProjectCompareSectionRows[] {
  const lists = responseRowLists(response);
  return Array.from(
    { length: expectedCount },
    (_, index) => lists[index] ?? [],
  );
}

/** Abort errors are expected when the selection changes mid-flight. */
export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "AbortError" || candidate.code === "ERR_CANCELED";
}

/**
 * Window totals for one section: additive metrics are summed; rate metrics are
 * re-aggregated as the ratio of the window's sums (weighted by their
 * denominator metric), so a 30-day CPA is not the mean of 30 daily CPAs.
 */
export function aggregateProjectCompareTotals(
  topic: AnalysisTopic,
  rows: ProjectCompareSectionRows,
  metricDefs: AnalysisMetric[] = projectCompareMetricDefs(topic),
): ProjectCompareTotals {
  const totals: ProjectCompareTotals = {};
  for (const metric of metricDefs) {
    totals[metric.key] = aggregateBucketMetric(
      metric,
      rows,
      projectCompareWeightKey(topic, metric),
    );
  }
  return totals;
}

/** Table rows for one anchor, ordered by 消耗 (largest first, missing last). */
export function sortProjectCompareRows(
  rows: ProjectCompareTableRow[],
  spendKey: string,
): ProjectCompareTableRow[] {
  return [...rows].sort((left, right) => {
    const leftSpend = toNumber(left.totals[spendKey]);
    const rightSpend = toNumber(right.totals[spendKey]);
    if (leftSpend === null && rightSpend === null) return 0;
    if (leftSpend === null) return 1;
    if (rightSpend === null) return -1;
    return rightSpend - leftSpend;
  });
}

/** Per-anchor table rows with the section/result arrays aggregated together. */
export function projectCompareRowsForAnchor(
  topic: AnalysisTopic,
  sections: ProjectCompareSection[],
  results: ProjectCompareSectionRows[],
  anchor: AnchorKey,
  spendKey: string,
  metricDefs: AnalysisMetric[] = projectCompareMetricDefs(topic),
): ProjectCompareTableRow[] {
  const rows: ProjectCompareTableRow[] = [];
  sections.forEach((section, index) => {
    if (section.anchor !== anchor) return;
    const sectionRows = results[index] ?? [];
    rows.push({
      section,
      rows: sectionRows,
      totals: aggregateProjectCompareTotals(topic, sectionRows, metricDefs),
    });
  });
  return sortProjectCompareRows(rows, spendKey);
}

/** Whether a table has any daily rows at all (missing rows render as `–`). */
export function hasProjectCompareTableData(
  rows: ProjectCompareTableRow[],
): boolean {
  return rows.some((item) => item.rows.length > 0);
}

/**
 * Best value per metric for one table.  Only metrics that declare
 * ``higherIsBetter`` participate: counts like 消耗 have no "better" direction,
 * so their column stays unhighlighted.  ``null`` means "no best value".
 */
export function bestProjectCompareValues(
  totalsList: ProjectCompareTotals[],
  metricDefs: AnalysisMetric[],
): Record<string, number | null> {
  const best: Record<string, number | null> = {};
  for (const metric of metricDefs) {
    if (metric.higherIsBetter === undefined) {
      best[metric.key] = null;
      continue;
    }
    let winner: number | null = null;
    for (const totals of totalsList) {
      const value = toNumber(totals[metric.key]);
      if (value === null) continue;
      if (
        winner === null ||
        (metric.higherIsBetter ? value > winner : value < winner)
      ) {
        winner = value;
      }
    }
    best[metric.key] = winner;
  }
  return best;
}

function rowDayValue(row: ChartDataRow): unknown {
  return row[ANALYSIS_TIME_COLUMN] ?? row.__timestamp;
}

/**
 * Anchor-relative bucket index of a date.
 *
 * - day: days since the window start (day 1 is index 0);
 * - week: floor(days / 7), so days 1-7 are week 1 and day 8 is week 2;
 * - month: calendar-month difference from the start month.
 */
export function bucketIndexForDate(
  start: string,
  date: unknown,
  grain: ProjectCompareGrain,
): number | null {
  const startDay = dayjs(start);
  const normalized =
    typeof date === "number" || typeof date === "string"
      ? formatFullDay(date)
      : "";
  const day = dayjs(normalized);
  if (!startDay.isValid() || !normalized || !day.isValid()) return null;
  if (grain === "month") {
    return day.startOf("month").diff(startDay.startOf("month"), "month");
  }
  const offset = day.startOf("day").diff(startDay.startOf("day"), "day");
  if (offset < 0) return null;
  return grain === "day" ? offset : Math.floor(offset / 7);
}

/** Axis label of a bucket index, e.g. 第1天 / 第1周 / 第1月. */
export function bucketLabel(index: number, grain: ProjectCompareGrain): string {
  if (grain === "day") return `第${index + 1}天`;
  if (grain === "week") return `第${index + 1}周`;
  return `第${index + 1}月`;
}

/**
 * Number of buckets a window spans.  Used to keep tail placeholders for
 * shorter windows so series stay aligned on a shared x axis.
 */
export function windowBucketCount(
  section: ProjectCompareSection,
  grain: ProjectCompareGrain,
): number {
  const start = dayjs(section.start).startOf("day");
  const end = dayjs(section.end).startOf("day");
  if (!start.isValid() || !end.isValid()) return 1;
  const days = Math.max(1, end.diff(start, "day"));
  if (grain === "day") return days;
  if (grain === "week") return Math.ceil(days / 7);
  const last = end.subtract(1, "day");
  return Math.max(
    1,
    last.startOf("month").diff(start.startOf("month"), "month") + 1,
  );
}

/** One x-axis bucket with the daily rows that fall into it. */
export interface ProjectCompareBucket {
  index: number;
  label: string;
  rows: ChartDataRow[];
}

/** Group an anchor-relative section's daily rows into grain buckets. */
export function groupSectionRowsByBucket(
  section: ProjectCompareSection,
  rows: ProjectCompareSectionRows,
  grain: ProjectCompareGrain,
): ProjectCompareBucket[] {
  const buckets = new Map<number, ChartDataRow[]>();
  for (const row of rows) {
    const index = bucketIndexForDate(section.start, rowDayValue(row), grain);
    if (index === null || index < 0) continue;
    const bucket = buckets.get(index);
    if (bucket) bucket.push(row);
    else buckets.set(index, [row]);
  }
  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([index, bucketRows]) => ({
      index,
      label: bucketLabel(index, grain),
      rows: bucketRows,
    }));
}

/** One expanded detail row: a time bucket of a project's window. */
export interface ProjectCompareBucketTotalsRow {
  /** Bucket index inside the window (0-based). */
  index: number;
  /** Axis label, e.g. 第3天 / 第2周 / 第1月. */
  label: string;
  /** Calendar range covered by the bucket (first/last included day or month). */
  windowLabel: string;
  /** Per-metric aggregate of the bucket, computed like the window total. */
  totals: ProjectCompareTotals;
}

/** Calendar label of one anchor-relative bucket. */
export function bucketWindowLabel(
  section: ProjectCompareSection,
  index: number,
  grain: ProjectCompareGrain,
): string {
  const start = dayjs(section.start);
  if (!start.isValid()) return section.windowLabel;
  if (grain === "day") {
    return start.add(index, "day").format("YYYY-MM-DD");
  }
  if (grain === "week") {
    const first = start.add(index * 7, "day");
    const last = first.add(6, "day");
    return `${first.format("YYYY-MM-DD")} ~ ${last.format("YYYY-MM-DD")}`;
  }
  return start.add(index, "month").format("YYYY-MM");
}

/**
 * Expanded detail rows for one project inside one anchor table: the window is
 * split into the same day/week/month buckets as the chart, and every metric is
 * re-aggregated per bucket (additive metrics summed, rates weighted by their
 * denominator).  Rows without data are kept so the sequence stays readable.
 */
export function projectCompareBucketRows(
  topic: AnalysisTopic,
  section: ProjectCompareSection,
  rows: ProjectCompareSectionRows,
  grain: ProjectCompareGrain,
  metricDefs: AnalysisMetric[] = projectCompareMetricDefs(topic),
): ProjectCompareBucketTotalsRow[] {
  const buckets = groupSectionRowsByBucket(section, rows, grain);
  const bucketCount = Math.max(
    windowBucketCount(section, grain),
    buckets.reduce((max, bucket) => Math.max(max, bucket.index + 1), 0),
  );
  const byIndex = new Map(buckets.map((bucket) => [bucket.index, bucket]));
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucket = byIndex.get(index);
    const totals: ProjectCompareTotals = {};
    for (const metric of metricDefs) {
      totals[metric.key] = bucket
        ? aggregateBucketMetric(
            metric,
            bucket.rows,
            projectCompareWeightKey(topic, metric),
          )
        : null;
    }
    return {
      index,
      label: bucketLabel(index, grain),
      windowLabel: bucketWindowLabel(section, index, grain),
      totals,
    };
  });
}

/**
 * Anchor-aligned multi-project trend model.  Each series is one project inside
 * one anchor window; the x axis is the union of bucket counts, with shorter
 * windows padded by ``null`` at the tail so projects never shift.
 */
export function buildProjectCompareChartModel(
  topic: AnalysisTopic,
  sections: ProjectCompareSection[],
  results: ProjectCompareSectionRows[],
  metric: AnalysisMetric,
  grain: ProjectCompareGrain,
): ProjectCompareChartModel {
  const weightKey = projectCompareWeightKey(topic, metric);
  const multiAnchor =
    new Set(sections.map((section) => section.anchor)).size > 1;
  let bucketCount = 0;
  sections.forEach((section, index) => {
    bucketCount = Math.max(bucketCount, windowBucketCount(section, grain));
    for (const row of results[index] ?? []) {
      const index = bucketIndexForDate(section.start, rowDayValue(row), grain);
      if (index !== null && index >= 0) {
        bucketCount = Math.max(bucketCount, index + 1);
      }
    }
  });
  if (bucketCount === 0 || sections.length === 0) {
    return { categories: [], series: [] };
  }
  const categories = Array.from({ length: bucketCount }, (_, index) =>
    bucketLabel(index, grain),
  );
  const series: ProjectCompareChartSeries[] = sections.map(
    (section, resultIndex) => {
      const values: (number | null)[] = Array.from(
        { length: bucketCount },
        () => null,
      );
      for (const bucket of groupSectionRowsByBucket(
        section,
        results[resultIndex] ?? [],
        grain,
      )) {
        if (bucket.index >= bucketCount) continue;
        values[bucket.index] = aggregateBucketMetric(
          metric,
          bucket.rows,
          weightKey,
        );
      }
      return {
        key: section.key,
        name: multiAnchor
          ? `${section.project.papp_name}（${ANCHOR_LABELS[section.anchor]}）`
          : section.project.papp_name,
        projectKey: projectKey(section.project),
        anchor: section.anchor,
        values,
      };
    },
  );
  return { categories, series };
}

/** Whether any series carries a value worth drawing. */
export function hasProjectCompareChartData(
  model: ProjectCompareChartModel,
): boolean {
  return model.series.some((item) =>
    item.values.some((value) => value !== null),
  );
}
