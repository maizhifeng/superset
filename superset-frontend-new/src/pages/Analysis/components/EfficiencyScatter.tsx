import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import type { EChartsOption } from "echarts";
import EChart from "@/pages/Briefing/EChart";
import type { ChartDataRow } from "@/types/api";
import { formatNumber, formatPctValue } from "@/utils/formatNumber";
import { formatMetricValue, toNumber } from "../format";
import { topicMetric } from "../topics";
import type { AnalysisTopic } from "../types";

/** At most this many bubbles keep the scatter readable. */
const MAX_POINTS = 30;
/** ROI is hard-capped at 1000% unless the bulk of the data exceeds it. */
const ROI_CAP = 10;
/** Log axes cannot include zero; tiny positive floor keeps them valid. */
const AXIS_FLOOR = 0.0001;

interface ScatterPoint {
  name: string;
  value: [number, number, number];
}

interface AxisBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const lower = sorted[base];
  const upper = base + 1 < sorted.length ? sorted[base + 1] : lower;
  return lower + (upper - lower) * rest;
}

/**
 * Robust log bounds from the 1st/99th percentile plus padding, so a single
 * runaway channel cannot squash every other point onto the axis edge.
 *
 * The ROI axis is hard-capped at 1000%: a handful of tiny-spend channels can
 * otherwise push the percentile itself into six-figure percentages, which is
 * exactly the clumping this chart used to suffer from.  Only when the whole
 * bulk of the data sits above the cap does the axis grow to fit it; points
 * outside the final window are counted and reported below the chart.
 */
function computeBounds(points: ScatterPoint[]): AxisBounds {
  const cpas = points
    .map((point) => point.value[0])
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const rois = points
    .map((point) => point.value[1])
    .filter((value) => value > 0)
    .sort((a, b) => a - b);

  let xMin = Math.max(AXIS_FLOOR, quantile(cpas, 0.01) / 1.6);
  let xMax = Math.max(xMin * 10, quantile(cpas, 0.99) * 1.6);

  const roiP1 = quantile(rois, 0.01);
  const roiP99 = quantile(rois, 0.99);
  const yMin = Math.max(AXIS_FLOOR, roiP1 / 1.6);
  // Keep at least the break-even line (100%) in view.
  let yMax = Math.max(2, Math.min(ROI_CAP, roiP99 * 1.5));
  if (yMax <= yMin * 1.05) {
    // Every typical value is already above the hard cap; fit the observed
    // range instead of drawing an empty plot.
    yMax = Math.max(yMin * 3, roiP99 * 1.5);
  }

  // A log axis with collapsed bounds is invalid; widen the window instead.
  if (!(xMax > xMin * 1.5)) {
    xMin = Math.max(AXIS_FLOOR, xMin / 2);
    xMax = xMax * 2;
  }

  return { xMin, xMax, yMin, yMax };
}

function inBounds(point: ScatterPoint, bounds: AxisBounds): boolean {
  const [cpa, roi] = point.value;
  return (
    cpa >= bounds.xMin &&
    cpa <= bounds.xMax &&
    roi >= bounds.yMin &&
    roi <= bounds.yMax
  );
}

export default function EfficiencyScatter({
  topic,
  rows,
  dimension,
  loading,
}: {
  topic: AnalysisTopic;
  rows: ChartDataRow[];
  dimension: string;
  loading: boolean;
}) {
  const theme = useTheme();
  const cpaMetric = topicMetric(topic, "cpa");
  const roiMetric = topicMetric(topic, "revenueRoi");
  const spendMetric = topicMetric(topic, "netSpend");
  const dimensionLabel =
    topic.dimensions.find((item) => item.key === dimension)?.label ?? dimension;

  const points = useMemo<ScatterPoint[]>(
    () =>
      rows
        .map((row) => {
          const cpa = toNumber(row[cpaMetric.key]);
          const roi = toNumber(row[roiMetric.key]);
          const spend = toNumber(row[spendMetric.key]);
          if (
            cpa === null ||
            roi === null ||
            spend === null ||
            cpa <= 0 ||
            roi <= 0
          ) {
            return null;
          }
          return {
            name: String(row[dimension] ?? "–"),
            value: [cpa, roi, spend] as [number, number, number],
          };
        })
        .filter((point): point is ScatterPoint => point !== null),
    [cpaMetric.key, dimension, roiMetric.key, rows, spendMetric.key],
  );

  const bounds = useMemo(() => computeBounds(points), [points]);

  const { shownPoints, hiddenExtremes, hiddenOverflow } = useMemo(() => {
    const inRange = points
      .filter((point) => inBounds(point, bounds))
      .sort((a, b) => b.value[2] - a.value[2]);
    return {
      shownPoints: inRange.slice(0, MAX_POINTS),
      hiddenExtremes: points.length - inRange.length,
      hiddenOverflow: Math.max(0, inRange.length - MAX_POINTS),
    };
  }, [bounds, points]);

  const maxSpend = useMemo(
    () =>
      shownPoints.reduce((max, point) => Math.max(max, point.value[2]), 0),
    [shownPoints],
  );

  const option = useMemo<EChartsOption>(() => {
    const pointColor = theme.palette.chart[0];
    const symbolSize = (value: unknown) => {
      const values = Array.isArray(value) ? value : [];
      const spend = Number(values[2] ?? 0);
      if (maxSpend <= 0) return 10;
      const ratio = Math.sqrt(Math.max(0, spend) / maxSpend);
      return Math.min(34, Math.max(8, 8 + ratio * 26));
    };
    return {
      tooltip: {
        trigger: "item",
        appendToBody: true,
        formatter: (params: unknown) => {
          const item = params as {
            data?: { name?: string; value?: [number, number, number] };
          };
          const value = item.data?.value;
          if (!value) return "";
          return [
            item.data?.name ?? "",
            `${cpaMetric.label}: ${formatMetricValue(cpaMetric, value[0])}`,
            `${roiMetric.label}: ${formatMetricValue(roiMetric, value[1])}`,
            `${spendMetric.label}: ${formatMetricValue(spendMetric, value[2])}`,
          ].join("<br/>");
        },
      },
      grid: { left: 12, right: 24, top: 40, bottom: 26, containLabel: true },
      xAxis: {
        type: "log",
        name: `${cpaMetric.label}（对数轴）`,
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: theme.palette.text.secondary, fontSize: 11 },
        min: bounds.xMin,
        max: bounds.xMax,
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          formatter: (value: number) => formatNumber(value),
        },
        axisLine: { lineStyle: { color: theme.palette.divider } },
        splitLine: { lineStyle: { color: theme.palette.divider } },
      },
      yAxis: {
        type: "log",
        name: `${roiMetric.label}（对数轴）`,
        // Horizontal name above the axis keeps it clear of the (wide) tick
        // labels on a log scale.
        nameLocation: "end",
        nameGap: 10,
        nameTextStyle: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          align: "left",
        },
        min: bounds.yMin,
        max: bounds.yMax,
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          formatter: (value: number) => formatPctValue(value, 1),
        },
        axisLine: { lineStyle: { color: theme.palette.divider } },
        splitLine: { lineStyle: { color: theme.palette.divider } },
      },
      series: [
        {
          type: "scatter",
          data: shownPoints,
          symbolSize,
          itemStyle: {
            // Categorical palette keeps the bubble colour in sync with the
            // other analysis charts and both MUI themes.
            color: pointColor,
            opacity: 0.72,
            borderColor: theme.palette.background.paper,
            borderWidth: 1,
          },
          label: {
            show: shownPoints.length <= 12,
            formatter: (params: unknown) => {
              const item = params as { data?: { name?: string } };
              return item.data?.name ?? "";
            },
            position: "top",
            fontSize: 10,
            color: theme.palette.text.secondary,
          },
          markLine: {
            silent: true,
            symbol: "none",
            data: [{ yAxis: 1 }],
            lineStyle: {
              type: "dashed",
              color: theme.palette.success.main,
            },
            label: {
              formatter: `回本线 ${formatMetricValue(roiMetric, 1)}`,
              position: "insideEndTop",
              color: theme.palette.success.main,
              fontSize: 10,
            },
          },
        },
      ],
    };
  }, [
    bounds,
    cpaMetric,
    maxSpend,
    roiMetric,
    shownPoints,
    spendMetric,
    theme.palette.background.paper,
    theme.palette.chart,
    theme.palette.divider,
    theme.palette.success.main,
    theme.palette.text.secondary,
  ]);

  if (!loading && points.length === 0) {
    return (
      <Box
        sx={{
          height: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">当前筛选条件下暂无效率数据</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <EChart option={option} height={340} ariaLabel="渠道投放效率散点图" />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          虚线为 100% 回本线；左上角为低 CPA、高 ROI 的高效区。
        </Typography>
        {hiddenExtremes > 0 && (
          <Typography
            variant="caption"
            sx={{ color: "warning.main", fontVariantNumeric: "tabular-nums" }}
          >
            {hiddenExtremes} 个极端值未显示（超出坐标范围）
          </Typography>
        )}
        {hiddenOverflow > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            仅展示{spendMetric.label}最高的 {MAX_POINTS} 个{dimensionLabel}（范围内共{" "}
            {hiddenOverflow + shownPoints.length} 个）
          </Typography>
        )}
      </Box>
    </Box>
  );
}
