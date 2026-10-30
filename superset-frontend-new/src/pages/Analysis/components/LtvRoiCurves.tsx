import { useMemo } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import type { EChartsOption } from "echarts";
import EChart from "@/pages/Briefing/EChart";
import { Grid2 } from "@/superset-ui-mui/components";
import type { ChartDataRow } from "@/types/api";
import { formatAxisValue, formatMetricValue, toNumber } from "../format";
import { LTV_ROI_DAYS, topicMetric } from "../topics";
import type { AnalysisMetric, AnalysisTopic } from "../types";

/** Theme-derived colours shared by both curve charts. */
interface CurveColors {
  line: string;
  axisLabel: string;
  axisName: string;
  splitLine: string;
  breakEven: string;
  breakEvenLabel: string;
  breakEvenLabelBackground: string;
}

function buildCurveOption(
  labels: string[],
  values: (number | null)[],
  metricLabel: string,
  metric: AnalysisMetric,
  yAxisName: string,
  showBreakEven: boolean,
  colors: CurveColors,
): EChartsOption {
  return {
    color: [colors.line],
    tooltip: {
      trigger: "axis",
      appendToBody: true,
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as {
          dataIndex?: number;
          seriesName?: string;
          value?: unknown;
        }[];
        if (list.length === 0) return "";
        const index = list[0]?.dataIndex ?? 0;
        const item = list[0];
        return `${labels[index]}<br/>${item?.seriesName ?? metricLabel}: ${formatMetricValue(
          metric,
          item?.value,
        )}`;
      },
    },
    grid: { left: 8, right: 18, top: 32, bottom: 26, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisLabel: { color: colors.axisLabel, fontSize: 11 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: colors.splitLine } },
    },
    yAxis: {
      type: "value",
      name: yAxisName,
      // A horizontal name above the axis stays readable; the rotated middle
      // placement was clipped by the card's left padding.
      nameLocation: "end",
      nameGap: 10,
      nameTextStyle: {
        color: colors.axisName,
        fontSize: 11,
        align: "left",
      },
      axisLabel: {
        color: colors.axisLabel,
        fontSize: 11,
        formatter: (value: number) => formatAxisValue(metric, value),
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: colors.splitLine } },
    },
    series: [
      {
        name: metricLabel,
        type: "line",
        data: values,
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2 },
        itemStyle: { color: colors.line },
        markLine: showBreakEven
          ? {
              silent: true,
              symbol: "none",
              data: [{ yAxis: 1 }],
              lineStyle: { type: "dashed", color: colors.breakEven },
              label: {
                // Show the numeric break-even point so the dashed line is not
                // just an unexplained rule.
                formatter: `回本线 ${formatMetricValue(metric, 1)}`,
                position: "insideEndTop",
                color: colors.breakEvenLabel,
                fontSize: 10,
                backgroundColor: colors.breakEvenLabelBackground,
                padding: [2, 4],
                borderRadius: 3,
              },
            }
          : undefined,
      },
    ],
  };
}

/**
 * Trim trailing zero/null points.  Milestones whose observation window has not
 * elapsed yet are reported as 0 by the dataset; plotting them would draw a
 * misleading drop to zero at the end of the curve.
 */
function trimCurve(
  labels: string[],
  values: (number | null)[],
): { labels: string[]; values: (number | null)[] } {
  let end = values.length;
  while (
    end > 1 &&
    (values[end - 1] === null || values[end - 1] === 0) &&
    values.slice(0, end - 1).some((value) => value !== null && value !== 0)
  ) {
    end -= 1;
  }
  return { labels: labels.slice(0, end), values: values.slice(0, end) };
}

export default function LtvRoiCurves({
  topic,
  totals,
  loading,
}: {
  topic: AnalysisTopic;
  totals: ChartDataRow | null;
  loading: boolean;
}) {
  const theme = useTheme();
  const labels = useMemo(() => LTV_ROI_DAYS.map((day) => `第${day}天`), []);

  const ltvMetric = topicMetric(topic, "ltv_1");
  const roiMetric = topicMetric(topic, "roi_1");
  const ltvCurve = useMemo(
    () =>
      trimCurve(
        labels,
        LTV_ROI_DAYS.map((day) => toNumber(totals?.[`ltv_${day}`])),
      ),
    [labels, totals],
  );
  const roiCurve = useMemo(
    () =>
      trimCurve(
        labels,
        LTV_ROI_DAYS.map((day) => toNumber(totals?.[`roi_${day}`])),
      ),
    [labels, totals],
  );

  const chartColors = theme.palette.chart;

  const ltvOption = useMemo(
    () =>
      buildCurveOption(
        ltvCurve.labels,
        ltvCurve.values,
        "LTV",
        ltvMetric,
        "金额",
        false,
        {
          line: chartColors[0],
          axisLabel: theme.palette.text.secondary,
          axisName: theme.palette.text.secondary,
          splitLine: theme.palette.divider,
          breakEven: theme.palette.success.main,
          breakEvenLabel: theme.palette.success.main,
          breakEvenLabelBackground: theme.palette.background.paper,
        },
      ),
    [chartColors, ltvCurve, ltvMetric, theme],
  );
  const roiOption = useMemo(
    () =>
      buildCurveOption(
        roiCurve.labels,
        roiCurve.values,
        "ROI",
        roiMetric,
        "ROI",
        true,
        {
          line: chartColors[1] ?? chartColors[0],
          axisLabel: theme.palette.text.secondary,
          axisName: theme.palette.text.secondary,
          splitLine: theme.palette.divider,
          breakEven: theme.palette.success.main,
          breakEvenLabel: theme.palette.success.main,
          breakEvenLabelBackground: theme.palette.background.paper,
        },
      ),
    [chartColors, roiCurve, roiMetric, theme],
  );

  if (!loading && !totals) {
    return (
      <Box
        sx={{
          height: 220,
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
          当前筛选条件下暂无 LTV / ROI 数据
        </Typography>
      </Box>
    );
  }

  return (
    <Grid2 container spacing={1.5}>
      <Grid2 size={{ xs: 12, lg: 6 }}>
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, height: "100%" }}>
          <Box
            sx={{ display: "flex", alignItems: "baseline", gap: 1, minWidth: 0, mb: 0.75 }}
          >
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, flexShrink: 0 }}
            >
              LTV 回收曲线
            </Typography>
            <Tooltip title="纵轴为金额（第 N 天累计充值 / 新增进入），横轴为回收天数。">
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                纵轴为金额（第 N 天累计充值 / 新增进入），横轴为回收天数。
              </Typography>
            </Tooltip>
          </Box>
          <EChart option={ltvOption} height={240} ariaLabel="LTV 回收曲线" />
        </Paper>
      </Grid2>
      <Grid2 size={{ xs: 12, lg: 6 }}>
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, height: "100%" }}>
          <Box
            sx={{ display: "flex", alignItems: "baseline", gap: 1, minWidth: 0, mb: 0.75 }}
          >
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700, flexShrink: 0 }}
            >
              ROI 回收曲线
            </Typography>
            <Tooltip title="纵轴为 ROI（第 N 天累计充值 / 返点后消耗），虚线为 100% 回本线。">
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                纵轴为 ROI（第 N 天累计充值 / 返点后消耗），虚线为 100% 回本线。
              </Typography>
            </Tooltip>
          </Box>
          <EChart option={roiOption} height={240} ariaLabel="ROI 回收曲线" />
        </Paper>
      </Grid2>
    </Grid2>
  );
}
