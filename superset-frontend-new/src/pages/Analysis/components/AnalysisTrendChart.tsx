import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Popover from "@mui/material/Popover";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import DeltaArrow from "./DeltaArrow";
import dayjs from "dayjs";
import type { EChartsOption } from "echarts";
import EChart from "@/pages/Briefing/EChart";
import type { ChartDataRow } from "@/types/api";
import { formatPctValue } from "@/utils/formatNumber";
import {
  detectAnomalies,
  type AnalysisAnomaly,
  type AnomalySeverity,
} from "../anomalies";
import {
  formatAxisValue,
  formatFullDay,
  formatMetricValue,
  toNumber,
} from "../format";
import { metricDelta } from "../delta";
import { isImmature } from "../maturity";
import { aggregateBucketMetric, groupRowsByWeek } from "../weekly";
import { ANALYSIS_TIME_COLUMN, topicMetric } from "../topics";
import type { AnalysisMetric, AnalysisTopic } from "../types";

/** Legend/series name of the anomaly marker series. */
const ANOMALY_SERIES_NAME = "异常点";
/** Chips shown inline before the rest move into the "更多" popover. */
const VISIBLE_ANOMALY_COUNT = 3;

/** Highest/lowest/last points: the few values worth labelling on a line. */
function keyPointIndexes(values: (number | null)[]): Set<number> {
  const valid = values
    .map((value, index) => (value === null ? null : { value, index }))
    .filter((entry): entry is { value: number; index: number } => entry !== null);
  if (valid.length === 0) return new Set();
  if (valid.length <= 3) return new Set(valid.map((entry) => entry.index));
  const max = valid.reduce((best, entry) =>
    entry.value > best.value ? entry : best,
  );
  const min = valid.reduce((best, entry) =>
    entry.value < best.value ? entry : best,
  );
  const last = valid[valid.length - 1];
  return new Set([max.index, min.index, last.index]);
}

/**
 * Bar labels are readable inside the column, but a long weekly range would
 * label every one of 10+ columns; keep the extreme and latest columns only.
 */
function barLabelIndexes(values: (number | null)[]): Set<number> {
  const valid = values
    .map((value, index) => (value === null ? null : { value, index }))
    .filter((entry): entry is { value: number; index: number } => entry !== null);
  if (valid.length <= 6) return new Set(valid.map((entry) => entry.index));
  const max = valid.reduce((best, entry) =>
    entry.value > best.value ? entry : best,
  );
  return new Set([max.index, valid[valid.length - 1].index]);
}
/** Tick count shared by both value axes. */
const AXIS_SPLIT_NUMBER = 5;
/** Opacity of the previous-period line relative to its metric colour. */
const COMPARISON_ALPHA = 0.5;

/** "Nice" multipliers for a gridline step, from 1× to 10× a decade. */
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Round a raw step up to the next nice multiplier of its decade. */
function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const step = NICE_STEPS.find((candidate) => candidate >= fraction - 1e-9);
  return (step ?? 10) * magnitude;
}

/** A few points beyond this multiple of p95 are treated as axis outliers. */
const AXIS_OUTLIER_FACTOR = 3;
/** The axis upper bound is capped at this multiple of the p95. */
const AXIS_OUTLIER_CAP_FACTOR = 1.25;

function axisPercentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return (
    sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  );
}

/**
 * Upper bound for auto-scaling, ignoring a handful of extreme points.
 *
 * A newly launched game can spend normally on a comparison day while only
 * attracting 0–1 new users, which produces a CPA of tens of thousands and
 * would flatten the whole chart against the origin. Those points stay in the
 * tooltip/data; only the axis range ignores them.
 */
function axisUpperBound(sorted: number[]): number {
  const max = sorted[sorted.length - 1];
  const p95 = axisPercentile(sorted, 0.95);
  if (p95 > 0 && max > p95 * AXIS_OUTLIER_FACTOR) {
    return p95 * AXIS_OUTLIER_CAP_FACTOR;
  }
  return max;
}

function axisWasTrimmed(values: number[]): boolean {
  if (values.length === 0) return false;
  const sorted = [...values].sort((left, right) => left - right);
  const p95 = axisPercentile(sorted, 0.95);
  return p95 > 0 && sorted[sorted.length - 1] > p95 * AXIS_OUTLIER_FACTOR;
}

/**
 * Pad an axis range so the extreme points never sit on the grid border.
 * The lower bound stays at zero for non-negative series (bars need a zero
 * baseline), while the pad follows the observed span so a narrow range such as
 * a 1-2% pay-rate axis is not flattened by a fixed absolute pad.
 *
 * The upper bound is snapped to a whole number of gridline steps: pinning a
 * raw padded value (for example 528.26K) made ECharts draw an extra unaligned
 * label on top of the last tick, which then overlapped it.
 */
function paddedAxisRange(values: number[]): {
  min?: number;
  max?: number;
  interval?: number;
} {
  if (values.length === 0) return {};
  const sorted = [...values].sort((left, right) => left - right);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === 0 && max === 0) return { min: 0, max: 1, interval: 0.2 };
  const scaleMax = Math.max(axisUpperBound(sorted), min);
  const span = scaleMax - min;
  const pad = Math.max(span * 0.08, Math.abs(scaleMax) * 0.02);
  const rawMax = Math.max(0, scaleMax + pad);
  const axisMin =
    min < 0
      ? -niceStep((Math.abs(min) + pad) / AXIS_SPLIT_NUMBER) *
        AXIS_SPLIT_NUMBER
      : 0;
  const interval = niceStep((rawMax - axisMin) / AXIS_SPLIT_NUMBER);
  return {
    min: axisMin,
    max: axisMin + interval * AXIS_SPLIT_NUMBER,
    interval,
  };
}

/**
 * Percent tick precision follows the distance between ticks: a 0-1.5% axis
 * cannot use integer labels without collapsing neighbouring ticks.
 */
function percentTickFormatter(
  span: number,
  splitNumber: number,
): (value: number) => string {
  const stepInPercentagePoints =
    (Math.abs(span) * 100) / Math.max(splitNumber, 1);
  const decimals =
    stepInPercentagePoints < 0.2 ? 2 : stepInPercentagePoints < 2 ? 1 : 0;
  return (value: number) => formatPctValue(value, decimals);
}

/** Axis label formatter that preserves each metric's format. */
function axisLabelFormatter(
  metric: AnalysisMetric | undefined,
  range: { min?: number; max?: number },
): (value: number) => string {
  if (!metric) return (value: number) => String(value);
  if (metric.format !== "percent") {
    return (value: number) => formatAxisValue(metric, value);
  }
  const span = (range.max ?? 0) - (range.min ?? 0);
  return percentTickFormatter(span, AXIS_SPLIT_NUMBER);
}

export default function AnalysisTrendChart({
  topic,
  rows,
  previousRows = [],
  showComparison = false,
  comparisonOffsetDays = 0,
  onDateClick,
  onDateHover,
  onWeekClick,
  onAnomalyClick,
  onAnomalyHover,
  hiddenSeriesKeys,
  dataQualityNote,
  showRollingBaseline = false,
  weeklyView = false,
  loading,
  height = 320,
}: {
  topic: AnalysisTopic;
  rows: ChartDataRow[];
  previousRows?: ChartDataRow[];
  showComparison?: boolean;
  comparisonOffsetDays?: number;
  onDateClick?: (date: string) => void;
  /** Fired when a series point is hovered; used to warm the drill request. */
  onDateHover?: (date: string) => void;
  /** Fired when a weekly bucket is clicked; opens that week's drill view. */
  onWeekClick?: (weekStart: string) => void;
  /** Fired when an anomaly chip is clicked; opens the dimension breakdown. */
  onAnomalyClick?: (
    anomaly: AnalysisAnomaly,
    date: string,
    anchor: HTMLElement,
  ) => void;
  /** Fired when an anomaly chip is hovered; warms the attribution request. */
  onAnomalyHover?: (anomaly: AnalysisAnomaly, date: string) => void;
  /** Series field keys hidden because their source data is unavailable. */
  hiddenSeriesKeys?: string[];
  /** Extra data-quality note rendered under the chart. */
  dataQualityNote?: string;
  /** Overlay the 7-day trailing mean of the comparison metric. */
  showRollingBaseline?: boolean;
  /** Aggregate the x axis into Sunday–Saturday weeks. */
  weeklyView?: boolean;
  loading: boolean;
  height?: number;
}) {
  const theme = useTheme();
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);

  // Categorical chart palette first; semantic colours only act as a fallback
  // for consumers that mount the chart with a bare MUI theme.  Colours are
  // assigned by series position, so a metric keeps its colour across renders.
  const chartColors = useMemo<string[]>(() => {
    const palette = theme.palette.chart;
    if (palette && palette.length > 0) return [...palette];
    return [
      theme.palette.primary.main,
      theme.palette.warning.main,
      theme.palette.success.main,
      theme.palette.info.main,
      theme.palette.secondary.main,
    ];
  }, [theme]);

  const severityColor = useMemo<Record<AnomalySeverity, string>>(
    () => ({
      negative: theme.palette.error.main,
      positive: theme.palette.success.main,
      neutral: theme.palette.warning.main,
    }),
    [theme],
  );

  const trendSeries = useMemo(
    () =>
      topic.trend.series.filter(
        (series) =>
          !(hiddenSeriesKeys ?? []).includes(
            topicMetric(topic, series.metric).key,
          ),
      ),
    [hiddenSeriesKeys, topic],
  );
  const seriesDefs = useMemo(
    () => trendSeries.map((series) => topicMetric(topic, series.metric)),
    [topic, trendSeries],
  );
  const seriesColors = useMemo(
    () =>
      seriesDefs.map(
        (_, index) => chartColors[index % chartColors.length],
      ),
    [chartColors, seriesDefs],
  );
  const hasRightAxis = trendSeries.some(
    (series) => series.axis === "right",
  );
  const comparisonMetric = useMemo(
    () =>
      topic.comparisonMetric
        ? topicMetric(topic, topic.comparisonMetric)
        : seriesDefs[0],
    [seriesDefs, topic],
  );
  // The previous-period line inherits the colour and the axis of the metric it
  // compares, so the pairing is readable without a legend lookup.
  const comparisonSeriesIndex = useMemo(() => {
    if (!topic.comparisonMetric) return 0;
    const index = trendSeries.findIndex(
      (series) => series.metric === topic.comparisonMetric,
    );
    return index >= 0 ? index : 0;
  }, [topic.comparisonMetric, trendSeries]);
  const comparisonColor =
    seriesColors[comparisonSeriesIndex] ?? theme.palette.primary.main;
  const comparisonAxisIndex =
    trendSeries[comparisonSeriesIndex]?.axis === "right" ? 1 : 0;
  // Calendar buckets for the weekly view; empty while the daily view is active.
  const weeklyBuckets = useMemo(
    () => (weeklyView ? groupRowsByWeek(rows) : []),
    [rows, weeklyView],
  );
  /** Rows the chart plots (daily rows, or one aggregated row per week). */
  const displayRows = useMemo<ChartDataRow[]>(() => {
    if (!weeklyView) return rows;
    return weeklyBuckets.map((bucket) => {
      const aggregated: ChartDataRow = {
        [ANALYSIS_TIME_COLUMN]: bucket.start,
      };
      trendSeries.forEach((series) => {
        const definition = topicMetric(topic, series.metric);
        const weightKey = series.weightBy
          ? topicMetric(topic, series.weightBy).key
          : null;
        const value = aggregateBucketMetric(
          definition,
          bucket.rows,
          weightKey,
        );
        if (value !== null) aggregated[definition.key] = value;
      });
      return aggregated;
    });
  }, [rows, topic, trendSeries, weeklyBuckets, weeklyView]);
  const displayLabels = useMemo(
    () =>
      weeklyView
        ? weeklyBuckets.map((bucket) => bucket.label)
        : rows.map((row) =>
            formatFullDay(row.__timestamp ?? row[ANALYSIS_TIME_COLUMN]),
          ),
    [rows, weeklyBuckets, weeklyView],
  );

  const comparisonSeriesEntry = trendSeries[comparisonSeriesIndex];
  const comparisonWeightKey = comparisonSeriesEntry?.weightBy
    ? topicMetric(topic, comparisonSeriesEntry.weightBy).key
    : null;

  const comparisonSeries = useMemo(() => {
    const metricDef = comparisonMetric;
    if (!metricDef || comparisonOffsetDays <= 0 || previousRows.length === 0) {
      return null;
    }

    if (weeklyView) {
      // Week over week inside the displayed range: each bucket is compared with
      // the bucket one week earlier (the first visible bucket has no prior week).
      const byStart = new Map(
        weeklyBuckets.map((bucket) => [bucket.start, bucket]),
      );
      return {
        name: `${metricDef.label}（上一周）`,
        data: weeklyBuckets.map((bucket) => {
          const previousStart = dayjs(bucket.start)
            .subtract(7, "day")
            .format("YYYY-MM-DD");
          const previousBucket = byStart.get(previousStart);
          if (!previousBucket) return null;
          return aggregateBucketMetric(
            metricDef,
            previousBucket.rows,
            comparisonWeightKey,
          );
        }),
      };
    }

    const previousByDate = new Map<string, ChartDataRow>();
    for (const row of previousRows) {
      const date = dayjs(row[ANALYSIS_TIME_COLUMN] ?? row.__timestamp);
      if (date.isValid()) {
        previousByDate.set(date.format("YYYY-MM-DD"), row);
      }
    }
    return {
      name: `${metricDef.label}（上期）`,
      data: rows.map((row) => {
        const date = dayjs(row[ANALYSIS_TIME_COLUMN] ?? row.__timestamp);
        if (!date.isValid()) return null;
        const previousDate = date
          .subtract(comparisonOffsetDays, "day")
          .format("YYYY-MM-DD");
        const previousRow = previousByDate.get(previousDate);
        return previousRow ? toNumber(previousRow[metricDef.key]) : null;
      }),
    };
  }, [
    comparisonMetric,
    comparisonOffsetDays,
    comparisonWeightKey,
    previousRows,
    rows,
    weeklyBuckets,
    weeklyView,
  ]);
  const comparisonVisible = Boolean(showComparison && comparisonSeries);

  /**
   * Week-over-week change for the comparison metric, rendered as a compact bar
   * panel inside the same chart canvas (instead of a second chart below).
   */
  const weeklyDeltaPoints = useMemo(() => {
    if (!weeklyView) return [];
    const byStart = new Map(
      weeklyBuckets.map((bucket) => [bucket.start, bucket]),
    );
    return weeklyBuckets.map((bucket) => {
      const previousStart = dayjs(bucket.start)
        .subtract(7, "day")
        .format("YYYY-MM-DD");
      const previousBucket = byStart.get(previousStart);
      if (!previousBucket) return null;
      const current = aggregateBucketMetric(
        comparisonMetric,
        bucket.rows,
        comparisonWeightKey,
      );
      const previous = aggregateBucketMetric(
        comparisonMetric,
        previousBucket.rows,
        comparisonWeightKey,
      );
      const delta = metricDelta(comparisonMetric, current, previous);
      if (
        !delta ||
        delta.direction === "flat" ||
        current === null ||
        previous === null
      ) {
        return null;
      }
      let value: number | null;
      if (comparisonMetric.format === "percent") {
        value = (current - previous) * 100;
      } else if (previous === 0) {
        value = null;
      } else {
        value = ((current - previous) / Math.abs(previous)) * 100;
      }
      if (value === null || !Number.isFinite(value)) return null;
      return {
        value,
        direction: delta.direction,
        deltaText: delta.text,
        weekLabel: bucket.label,
      };
    });
  }, [
    comparisonMetric,
    comparisonWeightKey,
    weeklyBuckets,
    weeklyView,
  ]);
  const weeklyDeltaVisible =
    weeklyView &&
    !comparisonVisible &&
    weeklyDeltaPoints.some((point) => point !== null);
  const deltaAxisIndex = hasRightAxis ? 2 : 1;
  const deltaAxisExtent = useMemo(() => {
    const magnitudes = weeklyDeltaPoints
      .filter((point): point is NonNullable<typeof point> => point !== null)
      .map((point) => Math.abs(point.value));
    const max = magnitudes.length > 0 ? Math.max(...magnitudes) : 0;
    const padded = Math.max(10, Math.ceil(max / 10) * 10);
    return { min: -padded, max: padded };
  }, [weeklyDeltaPoints]);
  /**
   * Anomaly detection compares each day with its own 7-day rolling baseline, so
   * it does not depend on the previous-period comparison line being visible.
   * The weekly roll-up is still a daily concept, so it disables detection.
   */
  const anomalies = useMemo(() => {
    if (!comparisonMetric || weeklyView) return [];
    return detectAnomalies(comparisonMetric, rows);
  }, [comparisonMetric, rows, weeklyView]);

  /** Trailing 7-day mean of the comparison metric (daily view only). */
  const rollingBaseline = useMemo<(number | null)[] | null>(() => {
    if (!showRollingBaseline || weeklyView || !comparisonMetric) return null;
    const values = rows.map((row) =>
      isImmature(comparisonMetric, row)
        ? null
        : toNumber(row[comparisonMetric.key]),
    );
    const points = values.map((_, index) => {
      const window = values
        .slice(Math.max(0, index - 7), index)
        .filter((value): value is number => value !== null);
      if (window.length < 4) return null;
      return window.reduce((sum, value) => sum + value, 0) / window.length;
    });
    return points.some((value) => value !== null) ? points : null;
  }, [comparisonMetric, rows, showRollingBaseline, weeklyView]);
  const sortedAnomalies = useMemo(
    () =>
      [...anomalies].sort((left, right) => {
        const rank = { negative: 0, neutral: 1, positive: 2 };
        return (
          rank[left.severity] - rank[right.severity] || left.index - right.index
        );
      }),
    [anomalies],
  );
  const negativeAnomalyCount = sortedAnomalies.filter(
    (anomaly) => anomaly.severity === "negative",
  ).length;
  const anomalyAccent =
    negativeAnomalyCount > 0
      ? theme.palette.error.main
      : theme.palette.warning.main;

  // Include the previous period in the range even when it is hidden, so
  // toggling the comparison does not rescale the axis and make the current
  // curve jump.
  // The auto-range is driven by the current period; a previous period with
  // wild values (e.g. a game that spent normally while attracting 0–1 users)
  // is only followed up to 2x the current range, so it cannot flatten the
  // current curve against the origin.
  const comparisonRangeFactor = 2;
  const axisRanges = useMemo(() => {
    const primary = { left: [] as number[], right: [] as number[] };
    const comparisonValues = { left: [] as number[], right: [] as number[] };
    trendSeries.forEach((series, index) => {
      const definition = seriesDefs[index];
      const bucket = primary[series.axis === "right" ? "right" : "left"];
      for (const row of displayRows) {
        if (!weeklyView && isImmature(definition, row)) continue;
        const value = toNumber(row[definition.key]);
        if (value !== null) bucket.push(value);
      }
    });
    for (const value of rollingBaseline ?? []) {
      if (value !== null) {
        primary[comparisonAxisIndex === 1 ? "right" : "left"].push(value);
      }
    }
    if (comparisonSeries) {
      comparisonValues[comparisonAxisIndex === 1 ? "right" : "left"].push(
        ...comparisonSeries.data.filter(
          (value): value is number => value !== null,
        ),
      );
    }

    const buildRange = (values: number[], compared: number[]) => {
      const sorted = [...values].sort((left, right) => left - right);
      const primaryUpper =
        sorted.length > 0 ? Math.max(axisUpperBound(sorted), 0) : 0;
      const fallbackUpper =
        compared.length > 0
          ? Math.max(
              axisUpperBound(
                [...compared].sort((left, right) => left - right),
              ),
              0,
            )
          : 0;
      const limit =
        primaryUpper > 0 ? primaryUpper * comparisonRangeFactor : fallbackUpper;
      const kept = compared.filter((value) => Math.abs(value) <= limit);
      return {
        range: paddedAxisRange([...values, ...kept]),
        trimmed:
          (sorted.length > 0 && axisWasTrimmed(sorted)) ||
          kept.length < compared.length,
      };
    };

    const left = buildRange(primary.left, comparisonValues.left);
    const right = buildRange(primary.right, comparisonValues.right);
    return {
      left: left.range,
      right: right.range,
      trimmed: { left: left.trimmed, right: right.trimmed },
    };
  }, [
    comparisonAxisIndex,
    comparisonSeries,
    displayRows,
    rollingBaseline,
    seriesDefs,
    trendSeries,
    weeklyView,
  ]);

  const option = useMemo<EChartsOption>(() => {
    const labels = displayLabels;
    const leftMetric =
      seriesDefs[
        trendSeries.findIndex((series) => series.axis !== "right")
      ] ?? seriesDefs[0];
    const rightMetric =
      seriesDefs[
        trendSeries.findIndex((series) => series.axis === "right")
      ] ?? seriesDefs[0];
    const leftFormatter = axisLabelFormatter(
      leftMetric,
      axisRanges.left,
    );
    const rightFormatter = axisLabelFormatter(
      rightMetric,
      axisRanges.right,
    );
    // Tooltip lines are rebuilt from the row data instead of the ECharts
    // payload so left-axis metrics always read first and the previous-period
    // value sits directly under the metric it belongs to.
    const orderedDefinitions = trendSeries
      .map((series, index) => ({
        series,
        definition: seriesDefs[index],
        index,
      }))
      .sort((left, right) => {
        const axisDelta =
          (left.series.axis === "right" ? 1 : 0) -
          (right.series.axis === "right" ? 1 : 0);
        return axisDelta !== 0 ? axisDelta : left.index - right.index;
      });
    const tooltipRows = (index: number): string[] => {
      const lines: string[] = [];
      for (const entry of orderedDefinitions) {
        const definition = entry.definition;
        lines.push(
          `${definition.label}: ${formatMetricValue(
            definition,
            displayRows[index]?.[definition.key],
          )}`,
        );
        if (
          rollingBaseline &&
          comparisonMetric &&
          definition.key === comparisonMetric.key
        ) {
          lines.push(
            `${definition.label}（7日移动平均）: ${formatMetricValue(
              comparisonMetric,
              rollingBaseline[index] ?? null,
            )}`,
          );
        }
        if (
          comparisonSeries &&
          comparisonMetric &&
          definition.key === comparisonMetric.key
        ) {
          // The weekly roll-up compares each bucket with the bucket one week
          // earlier, so label it accordingly and surface the week-over-week
          // change even when the comparison line itself is hidden.
          lines.push(
            `${definition.label}（${weeklyView ? "上一周" : "上期"}）: ${formatMetricValue(
              comparisonMetric,
              comparisonSeries.data[index],
            )}`,
          );
          if (weeklyView) {
            const delta = metricDelta(
              comparisonMetric,
              displayRows[index]?.[definition.key],
              comparisonSeries.data[index],
            );
            if (delta) lines.push(`周环比: ${delta.text}`);
          }
        }
      }
      return lines;
    };

    return {
      color: chartColors,
      tooltip: {
        trigger: "axis",
        appendToBody: true,
        formatter: (params: unknown) => {
          const list = (Array.isArray(params) ? params : [params]) as {
            dataIndex?: number;
          }[];
          if (list.length === 0) return "";
          const index = list[0]?.dataIndex ?? 0;
          return [labels[index] ?? "", ...tooltipRows(index)].join("<br/>");
        },
      },
      legend: {
        type: "scroll",
        bottom: 0,
        left: "center",
        data: [
          ...seriesDefs.map((metricDef) => metricDef.label),
          ...(rollingBaseline && comparisonMetric
            ? [`${comparisonMetric.label}（7日移动平均）`]
            : []),
          ...(comparisonVisible && comparisonSeries
            ? [comparisonSeries.name]
            : []),
          ...(weeklyDeltaVisible
            ? [`${comparisonMetric.label} 周环比`]
            : []),
        ],
      },
      grid: {
        left: 8,
        // Weekly point labels sit on the last category; leave a little room so
        // they are not clipped by the right edge.
        right: weeklyView ? 30 : 20,
        top: 36,
        bottom: 44,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        boundaryGap: trendSeries.some((series) => series.type === "bar"),
        data: labels,
        axisLabel: {
          fontSize: 11,
          color: theme.palette.text.secondary,
          hideOverlap: true,
          // Weekly ticks already read "10-05 ~ 10-11"; daily ticks only need MM-DD.
          formatter: (value: string) =>
            weeklyView ? value : value.slice(5),
        },
        axisLine: { lineStyle: { color: theme.palette.divider } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          ...axisRanges.left,
          type: "value",
          name: leftMetric?.label,
          nameTextStyle: {
            fontSize: 11,
            color: theme.palette.text.secondary,
          },
          scale: false,
          splitNumber: AXIS_SPLIT_NUMBER,
          axisLabel: {
            fontSize: 11,
            color: theme.palette.text.secondary,
            formatter: leftFormatter,
          },
          splitLine: { lineStyle: { color: theme.palette.divider } },
        },
        ...(hasRightAxis
          ? [
              {
                ...axisRanges.right,
                type: "value" as const,
                name: rightMetric?.label,
                nameTextStyle: {
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                },
                scale: false,
                splitNumber: AXIS_SPLIT_NUMBER,
                axisLabel: {
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                  formatter: rightFormatter,
                },
                splitLine: { show: false },
              },
            ]
          : []),
        ...(weeklyDeltaVisible
          ? [
              {
                type: "value" as const,
                min: deltaAxisExtent.min,
                max: deltaAxisExtent.max,
                position: "right" as const,
                offset: hasRightAxis ? 48 : 0,
                // The delta values are readable from the in-chart labels; the
                // extra axis itself is noise in the weekly view.
                show: false,
              },
            ]
          : []),
      ],
      series: [
        ...trendSeries.map((series, index) => {
          const definition = seriesDefs[index];
          const color = seriesColors[index % seriesColors.length];
          return {
            name: definition.label,
            type: series.type,
            yAxisIndex: series.axis === "right" ? 1 : 0,
            data: (() => {
              const values = displayRows.map((row) =>
                !weeklyView && isImmature(definition, row)
                  ? null
                  : toNumber(row[definition.key]),
              );
              if (!weeklyView) return values;
              const indexes =
                series.type === "bar"
                  ? barLabelIndexes(values)
                  : keyPointIndexes(values);
              return values.map((value, index) => {
                if (value === null) return null;
                if (!indexes.has(index)) return value;
                const isBar = series.type === "bar";
                return {
                  value,
                  label: {
                    show: true,
                    position: isBar ? ("insideTop" as const) : ("top" as const),
                    offset: isBar ? [0, 4] : [0, -2],
                    color: isBar ? "#fff" : color,
                    fontSize: 9,
                    fontWeight: 600,
                    formatter: formatMetricValue(definition, value),
                  },
                };
              });
            })(),
            smooth: series.type === "line",
            // Visible symbols double as the click target for date drill-down:
            // a 2px line alone is too hard to hit with a mouse.
            showSymbol: series.type === "line",
            symbol: "circle",
            symbolSize: 5,
            // Line charts should react to clicks on the stroke, not only on
            // the (small) symbols.
            triggerLineEvent: series.type === "line",
            connectNulls: false,
            barMaxWidth: 28,
            labelLayout: weeklyView ? { hideOverlap: true } : undefined,
            itemStyle: {
              color,
              borderRadius: series.type === "bar" ? [4, 4, 0, 0] : 0,
              // Bars sit behind the lines; a little transparency keeps the
              // overlapping comparison line readable.
              opacity: series.type === "bar" ? 0.9 : 1,
            },
            lineStyle: series.type === "line" ? { width: 2 } : undefined,
            emphasis: { focus: "series" },
          };
        }),
        ...(rollingBaseline && comparisonMetric
          ? [
              {
                name: `${comparisonMetric.label}（7日移动平均）`,
                type: "line" as const,
                yAxisIndex: comparisonAxisIndex,
                data: rollingBaseline,
                smooth: true,
                showSymbol: false,
                connectNulls: false,
                silent: true,
                itemStyle: {
                  color: alpha(theme.palette.text.secondary, 0.65),
                },
                lineStyle: {
                  width: 1.5,
                  type: "dashed" as const,
                  color: alpha(theme.palette.text.secondary, 0.65),
                },
                z: 2,
              },
            ]
          : []),
        ...(comparisonVisible && comparisonSeries
          ? [
              {
                name: comparisonSeries.name,
                type: "line" as const,
                yAxisIndex: comparisonAxisIndex,
                data: comparisonSeries.data,
                smooth: true,
                showSymbol: false,
                connectNulls: false,
                itemStyle: {
                  color: alpha(comparisonColor, COMPARISON_ALPHA),
                },
                lineStyle: {
                  width: 1.5,
                  type: "dashed" as const,
                  color: alpha(comparisonColor, COMPARISON_ALPHA),
                },
                z: 3,
                emphasis: { focus: "series" as const },
              },
            ]
          : []),
        ...(!weeklyView && anomalies.length > 0
          ? [
              {
                name: ANOMALY_SERIES_NAME,
                type: "scatter" as const,
                yAxisIndex: comparisonAxisIndex,
                data: anomalies.map((anomaly) => ({
                  value: [anomaly.index, anomaly.value],
                  // Direction is encoded by the triangle rotation, while the
                  // fill colour carries the impact (negative/positive/neutral).
                  symbol: "triangle",
                  symbolRotate: anomaly.direction === "up" ? 0 : 180,
                  symbolSize: anomaly.severity === "negative" ? 15 : 13,
                  itemStyle: {
                    color: severityColor[anomaly.severity],
                    // A paper-coloured ring keeps the marker legible on top of
                    // both bars and lines in either theme.
                    borderColor: theme.palette.background.paper,
                    borderWidth: 2,
                  },
                })),
                z: 20,
                tooltip: {
                  trigger: "item" as const,
                  formatter: (params: unknown) => {
                    const point = params as { dataIndex?: number };
                    const anomaly = anomalies[point.dataIndex ?? -1];
                    if (!anomaly || !comparisonMetric) return "";
                    const row = displayRows[anomaly.index];
                    const fullDate =
                      formatFullDay(
                        row?.[ANALYSIS_TIME_COLUMN] ?? row?.__timestamp,
                      ) || anomaly.date;
                    const impact =
                      anomaly.severity === "negative"
                        ? "负面"
                        : anomaly.severity === "positive"
                          ? "正面"
                          : "中性";
                    return [
                      `${fullDate} ${comparisonMetric.label}`,
                      `数值：${formatMetricValue(
                        comparisonMetric,
                        anomaly.value,
                      )}`,
                      `较7日移动平均${
                        anomaly.direction === "up" ? "上升" : "下降"
                      } ${anomaly.deltaText}`,
                      `影响：${impact}`,
                    ].join("<br/>");
                  },
                },
                // A faint dashed rule ties each marker to its x position; the
                // triangle alone can be hard to align with a dense x axis.
                markLine:
                  anomalies.length > 0
                    ? {
                        silent: true,
                        symbol: "none" as const,
                        animation: false,
                        label: { show: false },
                        data: anomalies.map((anomaly) => ({
                          xAxis: labels[anomaly.index],
                          lineStyle: {
                            color: alpha(
                              severityColor[anomaly.severity],
                              0.4,
                            ),
                            type: "dashed" as const,
                            width: 1,
                          },
                        })),
                      }
                    : undefined,
              },
            ]
          : []),
        ...(weeklyDeltaVisible
          ? [
              {
                name: `${comparisonMetric.label} 周环比`,
                type: "bar" as const,
                xAxisIndex: 0,
                yAxisIndex: deltaAxisIndex,
                barWidth: 10,
                barGap: "20%",
                // Legend uses a neutral swatch; each bar still carries its own
                // red/green semantics in itemStyle below.
                itemStyle: { color: theme.palette.text.secondary },
                labelLayout: { hideOverlap: true },
                data: (() => {
                  const deltaLabelIndexes = barLabelIndexes(
                    weeklyDeltaPoints.map((point) =>
                      point ? point.value : null,
                    ),
                  );
                  return weeklyDeltaPoints.map((point, index) => {
                    if (!point) return null;
                    const positive =
                      comparisonMetric.higherIsBetter === false
                        ? point.direction === "down"
                        : point.direction === "up";
                    const color = positive
                      ? theme.palette.success.main
                      : theme.palette.error.main;
                    return {
                      value: point.value,
                      itemStyle: { color },
                      label: {
                        show: deltaLabelIndexes.has(index),
                        position:
                          point.value >= 0
                            ? ("top" as const)
                            : ("bottom" as const),
                        color,
                        fontSize: 10,
                        fontWeight: 600,
                        formatter: point.deltaText,
                      },
                    };
                  });
                })(),
              },
            ]
          : []),
      ] as EChartsOption["series"],
    };
  }, [
    anomalies,
    axisRanges,
    chartColors,
    comparisonAxisIndex,
    comparisonColor,
    comparisonMetric,
    comparisonSeries,
    comparisonVisible,
    deltaAxisExtent,
    deltaAxisIndex,
    displayLabels,
    displayRows,
    hasRightAxis,
    rollingBaseline,
    seriesColors,
    seriesDefs,
    severityColor,
    theme,
    trendSeries,
    weeklyDeltaPoints,
    weeklyDeltaVisible,
    weeklyView,
  ]);

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ height, display: "flex", alignItems: "center" }}>
        <Skeleton
          variant="rounded"
          width="100%"
          height={Math.max(height - 16, 120)}
        />
      </Box>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <Box
        sx={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">当前筛选条件下暂无趋势数据</Typography>
      </Box>
    );
  }

  /** Resolve the row date behind an ECharts series event, if any. */
  const dateFromChartEvent = (params: unknown): string | null => {
    const event = params as {
      componentType?: string;
      dataIndex?: number;
      seriesName?: string;
      data?: { value?: unknown };
    };
    if (event.componentType !== "series") return null;
    // Marker data is indexed by anomaly, not by date, so its payload carries
    // the row index in the first value slot.
    let rowIndex = event.dataIndex;
    if (event.seriesName === ANOMALY_SERIES_NAME) {
      const markerValue = event.data?.value;
      rowIndex = Array.isArray(markerValue) ? Number(markerValue[0]) : undefined;
    }
    if (rowIndex == null || !Number.isFinite(rowIndex)) return null;
    const row = displayRows[rowIndex];
    if (!row) return null;
    const date = dayjs(row[ANALYSIS_TIME_COLUMN] ?? row.__timestamp);
    return date.isValid() ? date.format("YYYY-MM-DD") : null;
  };

  const handleChartClick = (params: unknown) => {
    if (!onDateClick) return;
    const date = dateFromChartEvent(params);
    if (date) onDateClick(date);
  };

  const handleWeekClick = (params: unknown) => {
    if (!onWeekClick) return;
    const event = params as { componentType?: string; dataIndex?: number };
    if (event.componentType !== "series") return;
    const bucket = weeklyBuckets[event.dataIndex ?? -1];
    if (bucket) onWeekClick(bucket.start);
  };

  const handleChartHover = (params: unknown) => {
    if (!onDateHover) return;
    const date = dateFromChartEvent(params);
    if (date) onDateHover(date);
  };

  const chartEvents: Record<string, (params: unknown) => void> = {};
  if (weeklyView) {
    if (onWeekClick) chartEvents.click = handleWeekClick;
  } else if (onDateClick) {
    chartEvents.click = handleChartClick;
  }
  if (onDateHover && !weeklyView) chartEvents.mouseover = handleChartHover;

  const visibleAnomalies = sortedAnomalies.slice(0, VISIBLE_ANOMALY_COUNT);
  const overflowAnomalies = sortedAnomalies.slice(VISIBLE_ANOMALY_COUNT);
  const anomalyChipLabel = (anomaly: (typeof sortedAnomalies)[number]) =>
    `${anomaly.date} ${comparisonMetric?.label ?? ""} ${anomaly.deltaText}`;
  /** The chip label only carries MM-DD; the query needs the full ISO date. */
  const anomalyFullDate = (
    anomaly: (typeof sortedAnomalies)[number],
  ): string | null => {
    const row = displayRows[anomaly.index];
    const date = dayjs(row?.[ANALYSIS_TIME_COLUMN] ?? row?.__timestamp);
    return date.isValid() ? date.format("YYYY-MM-DD") : null;
  };

  return (
    <Box>
      {!weeklyView && sortedAnomalies.length > 0 && (
        <Box
          sx={{
            mb: 1.5,
            px: 1.25,
            py: 0.75,
            borderRadius: 1.5,
            border: "1px solid",
            borderColor: alpha(anomalyAccent, 0.28),
            bgcolor: alpha(anomalyAccent, 0.06),
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 0.75,
          }}
        >
          <Tooltip title="异常判定：与「7 日移动平均（不含当天）」比较，偏离需同时超过 2.5σ 和最小幅度阈值；高于/低于均线本身并不等于异常">
            <WarningAmberIcon
              sx={{ fontSize: 16, color: anomalyAccent, flexShrink: 0 }}
            />
          </Tooltip>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: "text.primary" }}
          >
            检测到 {sortedAnomalies.length} 个异常波动
            {negativeAnomalyCount > 0
              ? `（${negativeAnomalyCount} 个负面）`
              : ""}
          </Typography>
          {visibleAnomalies.map((anomaly) => {
            const fullDate = anomalyFullDate(anomaly);
            const clickable = Boolean(onAnomalyClick && fullDate);
            const chip = (
              <Chip
                key={`${anomaly.index}-${anomaly.severity}`}
                size="small"
                variant="outlined"
                label={anomalyChipLabel(anomaly)}
                icon={<DeltaArrow direction={anomaly.direction} />}
                clickable={clickable}
                onClick={
                  onAnomalyClick && fullDate
                    ? (event) =>
                        onAnomalyClick(anomaly, fullDate, event.currentTarget)
                    : undefined
                }
                onMouseEnter={
                  onAnomalyHover && fullDate
                    ? () => onAnomalyHover(anomaly, fullDate)
                    : undefined
                }
                sx={{
                  height: 22,
                  fontWeight: 600,
                  color: severityColor[anomaly.severity],
                  borderColor: alpha(severityColor[anomaly.severity], 0.35),
                  bgcolor: alpha(severityColor[anomaly.severity], 0.08),
                  cursor: clickable ? "pointer" : "default",
                  transition: theme.transitions.create(
                    ["background-color", "border-color", "box-shadow"],
                    { duration: 120 },
                  ),
                  "&:hover": clickable
                    ? {
                        bgcolor: alpha(severityColor[anomaly.severity], 0.18),
                        borderColor: severityColor[anomaly.severity],
                        boxShadow: `0 0 0 1px ${alpha(
                          severityColor[anomaly.severity],
                          0.22,
                        )}`,
                      }
                    : undefined,
                  "&.Mui-focusVisible": {
                    outline: "2px solid",
                    outlineColor: alpha(
                      severityColor[anomaly.severity],
                      0.7,
                    ),
                    outlineOffset: 1,
                  },
                  "& .MuiChip-label": {
                    px: 0.75,
                    fontSize: 12,
                    display: "inline-flex",
                    alignItems: "center",
                  },
                  ...(clickable
                    ? {
                        "& .MuiChip-label::after": {
                          content: '"↗"',
                          marginLeft: "3px",
                          fontSize: 10,
                          opacity: 0.55,
                        },
                      }
                    : {}),
                  "& .MuiChip-icon": { color: "inherit", ml: 0.5, mr: -0.25 },
                }}
              />
            );
            return onAnomalyClick && fullDate ? (
              <Tooltip
                key={`${anomaly.index}-tip`}
                title="点击查看异常构成明细与维度归因"
              >
                {chip}
              </Tooltip>
            ) : (
              chip
            );
          })}
          {overflowAnomalies.length > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`更多 ${overflowAnomalies.length} 条`}
              onClick={(event) => setMoreAnchor(event.currentTarget)}
              sx={{
                height: 22,
                "& .MuiChip-label": { px: 0.75, fontSize: 12 },
              }}
            />
          )}
          <Box
            sx={{
              ml: "auto",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              颜色表示影响（红=负面，绿=正面）
            </Typography>
            {onAnomalyClick && (
              <Typography
                variant="caption"
                sx={{ color: "text.disabled" }}
              >
                · 点击标签查看构成明细
              </Typography>
            )}
          </Box>
          <Popover
            open={Boolean(moreAnchor)}
            anchorEl={moreAnchor}
            onClose={() => setMoreAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          >
            <Box
              sx={{
                p: 1.25,
                maxWidth: 380,
                display: "flex",
                flexDirection: "column",
                gap: 0.75,
              }}
            >
              {overflowAnomalies.map((anomaly) => (
                <Box
                  key={`more-${anomaly.index}-${anomaly.severity}`}
                  sx={{ display: "flex", alignItems: "flex-start", gap: 0.75 }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      mt: "5px",
                      borderRadius: "50%",
                      bgcolor: severityColor[anomaly.severity],
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="caption" sx={{ lineHeight: 1.6 }}>
                    {anomaly.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Popover>
        </Box>
      )}
      <EChart
        // ECharts merges series by default, so removing the comparison series
        // from the option would leave the old dashed line on the canvas.  A new
        // key remounts the chart whenever the series composition changes.
        key={[
          comparisonVisible ? "cmp" : "plain",
          weeklyView ? "week" : "day",
          weeklyDeltaVisible ? "delta" : "nodelta",
          rollingBaseline ? "baseline" : "nobaseline",
          anomalies.length > 0 ? "anomalies" : "clean",
        ].join("-")}
        option={option}
        height={height}
        onEvents={Object.keys(chartEvents).length > 0 ? chartEvents : undefined}
        ariaLabel={`${topic.title}趋势图`}
      />
      {dataQualityNote && (
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 0.25, color: "text.disabled" }}
        >
          {dataQualityNote}
        </Typography>
      )}
      {(axisRanges.trimmed.left || axisRanges.trimmed.right) && (
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 0.25, color: "text.disabled" }}
        >
          坐标轴已忽略个别极端值以避免压缩主趋势（如新增用户极少时的单日
          CPA）；这些点可能超出图表范围，指标数值与异常判定不受影响
        </Typography>
      )}
    </Box>
  );
}
