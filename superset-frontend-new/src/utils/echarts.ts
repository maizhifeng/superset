import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  CanvasRenderer,
]);

const registeredTypes = new Set<string>(['bar', 'line', 'pie']);

export function ensureChartType(type: string): void {
  if (registeredTypes.has(type)) return;
}

export const chartTypeToECharts: Record<string, string> = {
  line: 'line', bar: 'bar', pie: 'pie',
  echarts_timeseries_line: 'line',
};

export function buildEChartsOption(vizType: string, data: Record<string, unknown>) {
  const echartsType = chartTypeToECharts[vizType] || 'bar';

  if (vizType === 'pie') {
    return {
      tooltip: { trigger: 'item' as const },
      animation: true, animationDuration: 300,
      series: [{
        type: 'pie', radius: ['30%', '60%'], center: ['50%', '50%'],
        data: Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]).slice(0, 10).map(d => ({
          name: String(Object.values(d)[0] || ''), value: Number(Object.values(d)[1] || 0),
        })) : [],
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    };
  }

  const rows = Array.isArray(data?.data) ? (data.data as Record<string, unknown>[]) : [];
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const categoryKey = keys[0] || 'category';
  const valueKeys = keys.slice(1).filter(k => typeof rows[0]?.[k] === 'number' || k !== categoryKey);

  const slicedRows = rows.slice(0, 50);
  const isTimeAxis = /year|date|time/i.test(categoryKey);
  const xLabels = slicedRows.map(r => {
    const v = r[categoryKey];
    if (isTimeAxis && typeof v === 'number' && !isNaN(v)) {
      const d = new Date(v);
      const y = d.getFullYear();
      if (y > 1900 && y < 2100) return d.toLocaleDateString();
    }
    return String(v ?? '');
  });

  const maxXLen = Math.max(...xLabels.map(l => l.length), 0);
  const rotatedExtent = Math.ceil(maxXLen * 7 * Math.sin(Math.PI / 4));

  const allYValues = valueKeys.flatMap(k => slicedRows.map(r => Number(r[k] || 0)).filter(v => Number.isFinite(v)).map(Math.abs));
  const yMax = allYValues.length > 0 ? Math.max(...allYValues) : 0;
  const yLabelChars = Math.max(String(Math.round(yMax)).length, 1);
  const yLabelWidth = yLabelChars * 7;

  const palette = ['#20a7c9', '#ff7f50', '#5ab1ef', '#ffb980', '#d87a80', '#8d98b3', '#e5cf0d', '#97b552'];
  const series = valueKeys.length > 0 ? valueKeys.map((key, i) => ({
    type: echartsType as ('bar' | 'line'),
    name: key,
    data: slicedRows.map(r => Number(r[key] || 0)),
    itemStyle: { color: palette[i % palette.length] },
  })) : [{
    type: echartsType as ('bar' | 'line'),
    name: 'value',
    data: slicedRows.map(r => Number(r[categoryKey] || 0)),
    itemStyle: { color: '#20a7c9' },
  }];

  return {
    tooltip: { trigger: 'axis' as const },
    legend: series.length > 1 ? { type: 'scroll' as const, bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8 } : undefined,
    grid: {
      left: Math.max(40, Math.min(yLabelWidth + 24, 120)),
      right: 20,
      top: 40,
      bottom: series.length > 1 ? Math.max(60, Math.min(rotatedExtent + 24, 160)) : Math.max(30, Math.min(rotatedExtent + 12, 100)),
    },
    animation: true, animationDuration: 300,
    xAxis: {
      type: 'category' as const,
      data: xLabels,
      axisLabel: { rotate: 45, fontSize: 10, margin: 8 },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: {
        formatter: (v: number) => {
          if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
          if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
          if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
          return String(v);
        },
      },
    },
    series,
  };
}
