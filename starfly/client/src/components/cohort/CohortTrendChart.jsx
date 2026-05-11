import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import Box from '@mui/material/Box';

echarts.use([LineChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer]);

const COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#7f7f7f',
];

export default function CohortTrendChart({ data }) {
  const option = useMemo(() => {
    if (!data || !data.cohorts || !data.matrix) return {};

    const { cohorts, periods, matrix, metric, metricLabel, metricUnit, dimensions } = data;

    const series = cohorts.map((cohort, idx) => ({
      name: dimensions?.length > 0
        ? dimensions.map(d => cohort[d]).filter(Boolean).join(' / ') + ' ' + cohort.label
        : cohort.label,
      type: 'line',
      data: matrix[idx],
      smooth: true,
      lineStyle: { width: 2 },
      symbol: 'circle',
      symbolSize: 4,
      itemStyle: { color: COLORS[idx % COLORS.length] },
    }));

    const yUnit = metricUnit ? ` (${metricUnit})` : '';
    const formatter = metric === 'retention_rate' || metric === 'conversion_rate'
      ? (v) => `${v}%`
      : metric === 'arpu' || metric === 'revenue'
        ? (v) => `¥${v}`
        : String;

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const periodLabel = periods[params[0]?.dataIndex]?.label || '';
          return params.map((p) =>
            `<div><strong>${p.seriesName}</strong> ${periodLabel}: ${formatter(p.value)}</div>`
          ).join('');
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 50, right: 20, bottom: 50, top: 20, containLabel: true },
      xAxis: {
        type: 'category',
        data: periods.map((p) => p.label),
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: metricLabel + yUnit,
        nameTextStyle: { fontSize: 11 },
        axisLabel: {
          fontSize: 11,
          formatter,
        },
      },
      series,
    };
  }, [data]);

  if (!data || !data.cohorts || data.cohorts.length === 0) {
    return <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>无数据可展示</Box>;
  }

  return (
    <Box sx={{ width: '100%', height: 400 }}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ height: '100%', width: '100%' }}
      />
    </Box>
  );
}
