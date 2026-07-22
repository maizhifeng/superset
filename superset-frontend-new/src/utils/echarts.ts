import type { ChartDataPayload } from "@/types/api";
import { formatNumber, formatPctValue, isRatioMetric, type MetricFormatMap } from "./formatNumber";

function formatEChartsValue(key: string, value: number, formatMap?: MetricFormatMap): string {
  if (isRatioMetric(key, formatMap)) return formatPctValue(value);
  return formatNumber(value);
}

type EChartsModule = typeof import("echarts/core");

let echartsModule: EChartsModule | null = null;
let loadPromise: Promise<void> | null = null;

export async function loadECharts(): Promise<void> {
  if (echartsModule) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const core = await import("echarts/core");
    const { GridComponent, TooltipComponent, LegendComponent, TitleComponent } =
      await import("echarts/components");
    const { CanvasRenderer } = await import("echarts/renderers");
    const { BarChart, LineChart, PieChart } = await import("echarts/charts");

    core.use([
      GridComponent,
      TooltipComponent,
      LegendComponent,
      TitleComponent,
      CanvasRenderer,
      BarChart,
      LineChart,
      PieChart,
    ]);

    echartsModule = core;
  })();

  return loadPromise;
}

export function getECharts(): EChartsModule | null {
  return echartsModule;
}

export const chartTypeToECharts: Record<string, string> = {
  line: "line",
  bar: "bar",
  pie: "pie",
  echarts_timeseries_line: "line",
};

export function buildEChartsOption(
  vizType: string,
  data: ChartDataPayload,
  formatMap?: MetricFormatMap,
  chartColors?: string[],
  compact?: boolean,
  cardSize?: "small" | "medium" | "full",
) {
  const echartsType = chartTypeToECharts[vizType] || "bar";

  if (vizType === "pie") {
    const rows = Array.isArray(data?.data) ? data.data : [];
    const pieData = rows.slice(0, 10);
    const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
    const metricKey = keys.length > 1 ? keys[1] : "";
    return {
      tooltip: {
        trigger: "item" as const,
        appendToBody: true,
        hideDelay: 500,
        transitionDuration: 0,
        formatter: (params: { name: string; value: number; percent: number }) =>
          `${params.name}<br/>${metricKey}: ${formatNumber(params.value)} (${params.percent}%)`,
      },
      title: {
        text: metricKey || "",
        left: "center",
        textStyle: { fontSize: compact ? 12 : 16 },
      },
      legend: cardSize === "small" ? undefined : {
        type: "scroll" as const,
        ...(cardSize === "full" ? { bottom: 0 } : { right: 0, top: "middle" as const, orient: "vertical" as const }),
      },
      animation: true,
      animationDuration: 300,
      series: [
        {
          type: "pie",
          radius: cardSize === "medium" ? ["25%", "50%"] : ["30%", "60%"],
          center: cardSize === "medium" ? ["35%", "50%"] : ["50%", "50%"],
          data: (() => {
            const items = pieData.map((d) => ({
              name: String(Object.values(d)[0] || ""),
              value: Number(Object.values(d)[1] || 0),
            }));
            const total = items.reduce((s, i) => s + i.value, 0);
            return items.map((i) => {
              const isSmall = total > 0 && i.value / total < 0.05;
              return {
                ...i,
                labelLine: isSmall ? { show: false } : undefined,
                emphasis: isSmall ? { label: { show: false }, labelLine: { show: false } } : undefined,
              };
            });
          })(),
          label: {
            formatter: (params: { name: string; percent: number }) =>
              params.percent < 5 ? "" : `${params.name}\n${Math.round(params.percent)}%`,
            fontSize: 11,
            fontWeight: "bold",
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0,0,0,0.5)",
            },
          },
        },
      ],
    };
  }

  const rows = Array.isArray(data?.data)
    ? data.data
    : [];
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const categoryKey = keys[0] || "category";
  const valueKeys = keys
    .slice(1)
    .filter((k) => typeof rows[0]?.[k] === "number" || k !== categoryKey);

  const slicedRows = rows.slice(0, 50);
  const isTimeAxis = /year|date|time/i.test(categoryKey);
  const xLabels = slicedRows.map((r) => {
    const v = r[categoryKey];
    if (isTimeAxis && typeof v === "number" && !isNaN(v)) {
      const d = new Date(v);
      const y = d.getFullYear();
      if (y > 1900 && y < 2100) return d.toLocaleDateString();
    }
    return String(v ?? "");
  });

  const maxXLen = Math.max(...xLabels.map((l) => l.length), 0);
  const rotatedExtent = Math.ceil(maxXLen * 7 * Math.sin(Math.PI / 4));

  const allYValues = valueKeys.flatMap((k) =>
    slicedRows
      .map((r) => Number(r[k] || 0))
      .filter((v) => Number.isFinite(v))
      .map(Math.abs),
  );
  const yMax = allYValues.length > 0 ? Math.max(...allYValues) : 0;
  const yLabelChars = Math.max(String(Math.round(yMax)).length, 1);
  const yLabelWidth = yLabelChars * 7;

  const palette = chartColors && chartColors.length > 0
    ? chartColors
    : [
        "#20a7c9",
        "#ff7f50",
        "#5ab1ef",
        "#ffb980",
        "#d87a80",
        "#8d98b3",
        "#e5cf0d",
        "#97b552",
      ];
  const series =
    valueKeys.length > 0
      ? valueKeys.map((key, i) => ({
          type: echartsType as "bar" | "line",
          name: key,
          data: slicedRows.map((r) => Number(r[key] || 0)),
          itemStyle: { color: palette[i % palette.length] },
        }))
      : [
          {
            type: echartsType as "bar" | "line",
            name: "value",
            data: slicedRows.map((r) => Number(r[categoryKey] || 0)),
            itemStyle: { color: palette[0] },
          },
        ];

  return {
    tooltip: {
      trigger: "axis" as const,
      appendToBody: true,
      hideDelay: 500,
      transitionDuration: 0,
      formatter: (params: { seriesName: string; name: string; value: number }[]) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const axisName = params[0].name;
        const lines = params.map(
          (p) => `${p.seriesName}: ${formatEChartsValue(p.seriesName, p.value, formatMap)}`
        );
        return `${axisName}<br/>${lines.join("<br/>")}`;
      },
    },
    legend:
      series.length > 1
        ? {
            type: "scroll" as const,
            bottom: 0,
            icon: "roundRect",
            itemWidth: 12,
            itemHeight: 8,
          }
        : undefined,
    grid: {
      left: Math.max(40, Math.min(yLabelWidth + 24, 120)),
      right: 20,
      top: 40,
      bottom:
        series.length > 1
          ? Math.max(60, Math.min(rotatedExtent + 24, 160))
          : Math.max(30, Math.min(rotatedExtent + 12, 100)),
    },
    animation: true,
    animationDuration: 300,
    xAxis: {
      type: "category" as const,
      data: xLabels,
      axisLabel: { rotate: 45, fontSize: 10, margin: 8 },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        formatter: (v: number) => formatNumber(v),
      },
    },
    series,
  };
}
