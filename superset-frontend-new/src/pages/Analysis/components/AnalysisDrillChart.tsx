import { useMemo } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { EChartsOption } from "echarts";
import EChart from "@/pages/Briefing/EChart";
import DeltaArrow from "./DeltaArrow";
import type { ChartDataRow } from "@/types/api";
import type { AnomalySeverity, DrillAnomaly } from "../anomalies";
import { formatAxisValue, formatMetricValue, toNumber } from "../format";
import { topicMetric } from "../topics";
import type { AnalysisMetric, AnalysisTopic } from "../types";

/** Category bars stay readable only up to a handful of labels per chart. */
const MAX_CATEGORIES = 12;
/**
 * Axis labels keep only this many characters; the full dimension value is
 * always available through the tooltip.
 */
const MAX_AXIS_LABEL_CHARS = 8;
/** Scatter series name used for the rolling-baseline anomaly markers. */
const ANOMALY_MARKER_NAME = "异常归因点";
const VISIBLE_ANOMALY_COUNT = 3;
const SEVERITY_RANK: Record<AnomalySeverity, number> = {
  negative: 0,
  neutral: 1,
  positive: 2,
};

interface DrillSeries {
  metric: AnalysisMetric;
  type: "bar" | "line";
  axis: "left" | "right";
}

/** Metric definitions the drill chart renders, in the topic's trend order. */
function drillSeries(topic: AnalysisTopic): DrillSeries[] {
  const breakdownKeys = new Set(
    topic.breakdown.metrics.map((key) => topicMetric(topic, key).key),
  );
  const series = topic.trend.series
    .map((item) => ({
      metric: topicMetric(topic, item.metric),
      type: item.type,
      axis: item.axis ?? "left",
    }))
    .filter((item) => breakdownKeys.has(item.metric.key));
  if (series.length > 0) return series;
  // Fallback for topics whose trend metrics are not part of the table config:
  // show the table's sort metric so the drill still has a value to plot.
  return [
    {
      metric: topicMetric(topic, topic.breakdown.orderBy),
      type: "bar",
      axis: "left",
    },
  ];
}

function sortRows(topic: AnalysisTopic, rows: ChartDataRow[]): ChartDataRow[] {
  const orderKey = topicMetric(topic, topic.breakdown.orderBy).key;
  return [...rows].sort((left, right) => {
    const leftValue = toNumber(left[orderKey]);
    const rightValue = toNumber(right[orderKey]);
    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return rightValue - leftValue;
  });
}

function axisRange(metrics: AnalysisMetric[], rows: ChartDataRow[]) {
  const values = metrics.flatMap((metric) =>
    rows
      .map((row) => toNumber(row[metric.key]))
      .filter((value): value is number => value !== null),
  );
  if (values.length === 0) return {};
  const max = Math.max(...values, 0);
  if (max === 0) return { min: 0, max: 1 };
  return { min: 0, max: max * 1.12 };
}

export default function AnalysisDrillChart({
  topic,
  rows,
  dimension,
  focusDate,
  focusWeek,
  nextDimensionLabel,
  drillHint,
  onDrill,
  anomalies,
  anomalyMetric,
  anomalyLoading = false,
  anomalyError = null,
  loading,
  height = 320,
}: {
  topic: AnalysisTopic;
  /** Breakdown rows already scoped to `focusDate` and the active drill path. */
  rows: ChartDataRow[];
  dimension: string;
  focusDate?: string;
  /** Sunday start of the drilled week; drives the empty-state wording. */
  focusWeek?: string;
  /** Next hierarchy level; when present a bar click drills one level deeper. */
  nextDimensionLabel?: string | null;
  /** Overrides the drill hint (e.g. a date drill opens the daily view). */
  drillHint?: string;
  onDrill?: (value: string) => void;
  /** Rolling-baseline scores for the drilled day, keyed by dimension value. */
  anomalies?: Map<string, DrillAnomaly>;
  /** Metric the rolling-baseline comparison is based on. */
  anomalyMetric?: AnalysisMetric | null;
  anomalyLoading?: boolean;
  anomalyError?: string | null;
  loading: boolean;
  height?: number;
}) {
  const theme = useTheme();
  const dimensionLabel =
    topic.dimensions.find((item) => item.key === dimension)?.label ?? dimension;

  const seriesDefs = useMemo(() => drillSeries(topic), [topic]);
  const ordered = useMemo(() => sortRows(topic, rows), [rows, topic]);
  const shown = ordered.slice(0, MAX_CATEGORIES);
  const hiddenCount = ordered.length - shown.length;

  const colors = useMemo<string[]>(() => {
    const palette = theme.palette.chart;
    if (palette && palette.length > 0) return [...palette];
    return [theme.palette.primary.main, theme.palette.warning.main];
  }, [theme]);

  const severityColor = useMemo<Record<AnomalySeverity, string>>(
    () => ({
      negative: theme.palette.error.main,
      positive: theme.palette.success.main,
      neutral: theme.palette.warning.main,
    }),
    [theme],
  );

  const shownCategories = useMemo(
    () => new Set(shown.map((row) => String(row[dimension] ?? ""))),
    [dimension, shown],
  );

  const anomalyEntries = useMemo(() => {
    if (!anomalies) return [];
    return [...anomalies.entries()].map(([category, hit]) => ({
      category,
      hit,
    }));
  }, [anomalies]);
  const significantEntries = useMemo(
    () =>
      anomalyEntries
        .filter(({ hit }) => hit.significant)
        .sort(
          (left, right) =>
            SEVERITY_RANK[left.hit.severity] -
              SEVERITY_RANK[right.hit.severity] ||
            right.hit.deltaValue - left.hit.deltaValue,
        ),
    [anomalyEntries],
  );
  const deviationEntries = useMemo(
    () =>
      [...anomalyEntries]
        .sort((left, right) => right.hit.deltaValue - left.hit.deltaValue)
        .slice(0, VISIBLE_ANOMALY_COUNT),
    [anomalyEntries],
  );
  const hiddenAnomalyCount = significantEntries.filter(
    ({ category }) => !shownCategories.has(category),
  ).length;
  const negativeAnomalyCount = significantEntries.filter(
    ({ hit }) => hit.severity === "negative",
  ).length;
  const anomalyAccent =
    negativeAnomalyCount > 0
      ? theme.palette.error.main
      : theme.palette.warning.main;

  const anomalySeries = useMemo(() => {
    if (!anomalyMetric || significantEntries.length === 0) return null;
    const definitionIndex = seriesDefs.findIndex(
      (series) => series.metric.key === anomalyMetric.key,
    );
    if (definitionIndex === -1) return null;
    const axisIndex = seriesDefs[definitionIndex].axis === "right" ? 1 : 0;
    const points: Record<string, unknown>[] = [];
    shown.forEach((row, index) => {
      const category = String(row[dimension] ?? "");
      const hit = anomalies?.get(category);
      if (!hit?.significant) return;
      points.push({
        value: [index, hit.value],
        symbol: "triangle",
        symbolRotate: hit.direction === "up" ? 0 : 180,
        symbolSize: hit.severity === "negative" ? 14 : 12,
        itemStyle: {
          color: severityColor[hit.severity],
          borderColor: theme.palette.background.paper,
          borderWidth: 2,
        },
      });
    });
    if (points.length === 0) return null;
    return {
      name: ANOMALY_MARKER_NAME,
      type: "scatter" as const,
      yAxisIndex: axisIndex,
      data: points,
      z: 20,
      silent: true,
      tooltip: { show: false },
    };
  }, [
    anomalies,
    anomalyMetric,
    dimension,
    seriesDefs,
    severityColor,
    shown,
    significantEntries.length,
    theme,
  ]);

  const leftMetrics = seriesDefs
    .filter((item) => item.axis === "left")
    .map((item) => item.metric);
  const rightMetrics = seriesDefs
    .filter((item) => item.axis === "right")
    .map((item) => item.metric);
  const hasRightAxis = rightMetrics.length > 0;

  const option = useMemo<EChartsOption>(() => {
    const categories = shown.map((row) => String(row[dimension] ?? "–"));
    // Long channel names are truncated on the axis (full name stays in the
    // tooltip) so the rotated label band does not eat half of the plot area.
    const truncated = categories.map((label) =>
      label.length > MAX_AXIS_LABEL_CHARS
        ? `${label.slice(0, MAX_AXIS_LABEL_CHARS - 1)}…`
        : label,
    );
    const longest = Math.max(...truncated.map((label) => label.length), 0);
    const rotate = longest > 6 ? 20 : 0;
    const leftRange = axisRange(leftMetrics, shown);
    const rightRange = axisRange(rightMetrics, shown);
    const tooltipFormatter = (params: unknown) => {
      const list = (Array.isArray(params) ? params : [params]) as {
        dataIndex?: number;
        seriesName?: string;
        value?: unknown;
      }[];
      if (list.length === 0) return "";
      const index = list[0]?.dataIndex ?? 0;
      const name = categories[index] ?? "";
      const lines = list.map((item) => {
        const definition = seriesDefs.find(
          (series) => series.metric.label === item.seriesName,
        );
        const value = definition
          ? formatMetricValue(definition.metric, item.value)
          : String(item.value ?? "–");
        return `${item.seriesName ?? ""}: ${value}`;
      });
      return [`<b>${name}</b>`, ...lines].join("<br/>");
    };

    return {
      color: colors,
      tooltip: {
        trigger: "axis",
        appendToBody: true,
        axisPointer: { type: "shadow" },
        formatter: tooltipFormatter,
      },
      legend: {
        type: "scroll",
        top: 0,
        left: "center",
        itemWidth: 14,
        itemHeight: 9,
        // The anomaly markers are an annotation layer, not a metric series.
        data: seriesDefs.map((series) => series.metric.label),
        textStyle: { fontSize: 11, color: theme.palette.text.secondary },
      },
      grid: {
        left: 8,
        right: 20,
        top: 28,
        // With ``containLabel`` the axis labels are already reserved inside the
        // canvas, so a large explicit bottom margin only adds dead space.
        bottom: 6,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: theme.palette.divider } },
        axisLabel: {
          fontSize: 10,
          color: theme.palette.text.secondary,
          interval: 0,
          rotate,
          margin: 4,
          hideOverlap: false,
          formatter: (value: string) =>
            value.length > MAX_AXIS_LABEL_CHARS
              ? `${value.slice(0, MAX_AXIS_LABEL_CHARS - 1)}…`
              : value,
        },
      },
      yAxis: [
        {
          ...leftRange,
          type: "value",
          name: leftMetrics[0]?.label,
          nameTextStyle: {
            fontSize: 11,
            color: theme.palette.text.secondary,
          },
          splitNumber: 4,
          axisLabel: {
            fontSize: 11,
            color: theme.palette.text.secondary,
            formatter: (value: number) =>
              leftMetrics[0]
                ? formatAxisValue(leftMetrics[0], value)
                : String(value),
          },
          splitLine: { lineStyle: { color: theme.palette.divider } },
        },
        ...(hasRightAxis
          ? [
              {
                ...rightRange,
                type: "value" as const,
                name: rightMetrics[0]?.label,
                nameTextStyle: {
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                },
                splitNumber: 4,
                axisLabel: {
                  fontSize: 11,
                  color: theme.palette.text.secondary,
                  formatter: (value: number) =>
                    rightMetrics[0]
                      ? formatAxisValue(rightMetrics[0], value)
                      : String(value),
                },
                splitLine: { show: false },
              },
            ]
          : []),
      ],
      series: [
        ...seriesDefs.map((series, index) => {
          const color = colors[index % colors.length];
          return {
            name: series.metric.label,
            type: series.type,
            yAxisIndex: series.axis === "right" ? 1 : 0,
            data: shown.map((row) => toNumber(row[series.metric.key])),
            barMaxWidth: 34,
            symbolSize: 6,
            smooth: false,
            connectNulls: false,
            itemStyle: {
              color,
              borderRadius: series.type === "bar" ? [4, 4, 0, 0] : 0,
              opacity: series.type === "bar" ? 0.9 : 1,
            },
            lineStyle: series.type === "line" ? { width: 2 } : undefined,
            emphasis: { focus: "series" as const },
          };
        }),
        ...(anomalySeries ? [anomalySeries] : []),
      ],
    };
  }, [
    anomalySeries,
    colors,
    dimension,
    hasRightAxis,
    leftMetrics,
    rightMetrics,
    seriesDefs,
    shown,
    theme,
  ]);

  const handleClick = (params: unknown) => {
    if (!onDrill) return;
    const clicked = params as { dataIndex?: number; seriesName?: string };
    if (clicked.seriesName === ANOMALY_MARKER_NAME) return;
    if (clicked.dataIndex == null) return;
    const row = shown[clicked.dataIndex];
    const value = row ? String(row[dimension] ?? "") : "";
    if (value && value !== "–") onDrill(value);
  };

  // While a new drill level loads the rows still belong to the previous
  // dimension, so showing them would print the wrong categories.
  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={height} />
        <Skeleton variant="text" width="40%" sx={{ mt: 1 }} />
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box
        sx={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">
          {focusDate
            ? `${focusDate} 当天暂无可下钻的${dimensionLabel}数据`
            : focusWeek
              ? `该周暂无可下钻的${dimensionLabel}数据`
              : `当前筛选条件下暂无可下钻的${dimensionLabel}数据`}
        </Typography>
      </Box>
    );
  }

  const drillable = Boolean(onDrill && (nextDimensionLabel || drillHint));
  const hasBarSeries = seriesDefs.some((series) => series.type === "bar");
  const drillTargets = hasBarSeries ? "柱体 / 折线点" : "折线点";

  return (
    <Box>
      {anomalyMetric && (
        <Box
          sx={{
            mb: 0.75,
            px: 1,
            py: 0.5,
            borderRadius: 1.5,
            border: "1px solid",
            borderColor: alpha(anomalyAccent, 0.28),
            bgcolor: alpha(anomalyAccent, 0.06),
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
            rowGap: 0.5,
          }}
        >
          <WarningAmberIcon
            sx={{ fontSize: 16, color: anomalyAccent, flexShrink: 0 }}
          />
          {anomalyLoading ? (
            <Typography variant="caption" color="text.secondary">
              正在计算异常归因（{anomalyMetric.label} 较 7 日移动平均）…
            </Typography>
          ) : anomalyError ? (
            <Typography variant="caption" color="text.secondary">
              异常归因加载失败：{anomalyError}
            </Typography>
          ) : anomalyEntries.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              历史样本不足，无法判断当日 {anomalyMetric.label}
              在各{dimensionLabel}上的归属
            </Typography>
          ) : significantEntries.length > 0 ? (
            <>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: "text.primary" }}
              >
                异常归因（{anomalyMetric.label} 较 7 日移动平均）：
              </Typography>
              {significantEntries
                .slice(0, VISIBLE_ANOMALY_COUNT)
                .map(({ category, hit }) => (
                  <Tooltip
                    key={`${category}-${hit.severity}`}
                    title={`${hit.text}（7 日移动平均 ${formatMetricValue(
                      anomalyMetric,
                      hit.baselineMean,
                    )}，${hit.baselineSamples} 天）`}
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      color={
                        hit.severity === "negative"
                          ? "error"
                          : hit.severity === "positive"
                            ? "success"
                            : "warning"
                      }
                      label={`${category} ${hit.deltaText}`}
                      icon={<DeltaArrow direction={hit.direction} />}
                      sx={{
                        height: 20,
                        "& .MuiChip-label": {
                          px: 0.75,
                          fontSize: "0.6875rem",
                          fontVariantNumeric: "tabular-nums",
                        },
                        "& .MuiChip-icon": {
                          color: "inherit",
                          ml: 0.5,
                          mr: -0.25,
                        },
                      }}
                    />
                  </Tooltip>
                ))}
              {significantEntries.length > VISIBLE_ANOMALY_COUNT && (
                <Tooltip
                  title={significantEntries
                    .slice(VISIBLE_ANOMALY_COUNT)
                    .map(({ hit }) => hit.text)
                    .join("；")}
                >
                  <Typography variant="caption" color="text.secondary">
                    等 {significantEntries.length} 个
                  </Typography>
                </Tooltip>
              )}
              {hiddenAnomalyCount > 0 && (
                <Typography variant="caption" color="text.disabled">
                  （{hiddenAnomalyCount} 个异常项不在图中，见明细表）
                </Typography>
              )}
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", ml: "auto" }}
              >
                颜色表示影响（红=负面，绿=正面）
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">
                未检出显著异常；偏离均线最大：
              </Typography>
              {deviationEntries.map(({ category, hit }) => (
                <Tooltip
                  key={`dev-${category}`}
                  title={`${hit.text}（7 日移动平均 ${formatMetricValue(
                    anomalyMetric,
                    hit.baselineMean,
                  )}，${hit.baselineSamples} 天；未达显著阈值）`}
                >
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${category} ${hit.deltaText}`}
                    icon={<DeltaArrow direction={hit.direction} />}
                    sx={{
                      height: 20,
                      color: "text.secondary",
                      borderColor: "divider",
                      "& .MuiChip-label": {
                        px: 0.75,
                        fontSize: "0.6875rem",
                        fontVariantNumeric: "tabular-nums",
                      },
                      "& .MuiChip-icon": {
                        color: "inherit",
                        ml: 0.5,
                        mr: -0.25,
                      },
                    }}
                  />
                </Tooltip>
              ))}
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", ml: "auto" }}
              >
                基于 {anomalyEntries.length} 个{dimensionLabel}的 7 日移动平均
              </Typography>
            </>
          )}
        </Box>
      )}
      <Box sx={{ cursor: drillable ? "pointer" : "default" }}>
        <EChart
          key={`${dimension}-${shown.length}`}
          option={option}
          height={height}
          onEvents={drillable ? { click: handleClick } : undefined}
          ariaLabel={`${topic.title}下钻图：按${dimensionLabel}拆解`}
        />
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          rowGap: 0.25,
          mt: 0.25,
        }}
      >
        <Typography variant="caption" color="text.disabled">
          共 {ordered.length} 个{dimensionLabel}
          {hiddenCount > 0
            ? `，按${topicMetric(topic, topic.breakdown.orderBy).label}展示前 ${MAX_CATEGORIES} 个`
            : ""}
        </Typography>
        {drillable && (
          <Typography variant="caption" color="text.disabled">
            · 点击{drillTargets}
            {drillHint ?? `下钻至 ${nextDimensionLabel}`}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
