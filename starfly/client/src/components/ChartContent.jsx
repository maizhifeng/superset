// ============================================================
// ChartContent — ECharts 图表渲染组件
// 支持折线图、柱状图、面积图、饼图
// 根据容器尺寸和全屏状态自动缩放
// ============================================================

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { getCategoricalColors, getChartUIColors } from '../styles/chartColors';
import { formatDisplayValue, formatDateLabelCompact, formatWeekRange, formatMonthLabel } from '@/utils/formatters';
import { useThemeColor } from '../contexts/ThemeContext';

/**
 * 根据容器尺寸和全屏状态计算字号
 * 使用渐进缩放策略以在不同尺寸下获得更好的可读性
 */
function getFontSizeScale(dimensions, isFullscreen) {
  if (isFullscreen) {
    return {
      axis: 14,      // 坐标轴标签
      label: 12,     // 数据标签
      tooltip: 14,   // 提示框文本
      symbol: 8,     // 折线/面积图符号大小
      title: 16,     // 标题/错误文本
    };
  }

  // 基于容器宽度的渐进缩放
  const width = dimensions?.width || 200;
  // 从 200px 宽度的 10px 缩放到 400px 宽度的 12px
  const scale = Math.min(1, Math.max(0.8, width / 400));

  return {
    axis: Math.round(10 * scale + 2),   // 10-12px 范围
    label: Math.round(9 * scale + 1),   // 9-10px 范围
    tooltip: Math.round(10 * scale + 2),
    symbol: Math.round(4 + 4 * scale),  // 4-8px 范围
    title: Math.round(12 + 4 * scale),  // 12-16px 范围
  };
}

/**
 * 根据图表类型和数据构建 ECharts 配置项
 * 注意：ECharts 要求使用 hex/RGB 颜色格式，不支持 OKLCH
 * @param {string} primaryColor - 当前主题色，用于生成动态调色板
 */
function getEChartsOption({ rows, fields, chartType, dimensions, isFullscreen, dateTrunc, primaryColor }) {
  const fontScale = getFontSizeScale(dimensions, isFullscreen);
  const uiColors = getChartUIColors();

  // 根据 dateTrunc 选择日期格式化器
  const getDateFormatter = () => {
    if (dateTrunc === 'week') return formatWeekRange;
    if (dateTrunc === 'month') return formatMonthLabel;
    return formatDateLabelCompact;
  };
  const dateFormatter = getDateFormatter();

  if (!rows || rows.length === 0) {
    return {
      title: {
        text: 'No Data',
        left: 'center',
        top: 'center',
        textStyle: { color: uiColors.mutedText, fontSize: fontScale.title },
      },
    };
  }

  const xField = fields?.[0]?.name;
  const numericFields =
    fields?.filter((f) => typeof rows[0]?.[f.name] === 'number').map((f) => f.name) || [];

  if (chartType === 'number' || chartType === 'table') {
    return {};
  }

  // 获取颜色 - 使用主题色生成动态调色板
  const colors = getCategoricalColors(numericFields.length || 1, primaryColor);

  // 渐进式字体缩放
  const fontSize = fontScale.axis;
  const labelFontSize = fontScale.label;
  const symbolSize = fontScale.symbol;

  if (chartType === 'pie') {
    const yField = numericFields[0];
    // 饼图使用主题色生成调色板
    const pieColors = getCategoricalColors(rows.length, primaryColor);

    // 检测是否是日期字段
    const isPieDateField = typeof rows[0]?.[xField] === 'string' &&
      (/^\d{4}-\d{2}-\d{2}/.test(rows[0][xField]) || /^\d{4}-\d{2}-\d{2}T/.test(rows[0][xField]) || /^\d{4}-\d{2}-\d{2} /.test(rows[0][xField]));

    const pieData = rows.map((row, index) => ({
      name: isPieDateField
        ? dateFormatter(row[xField])
        : (row[xField] || 'Item ' + (index + 1)),
      value: parseFloat(row[yField]) || 0,
    }));

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params) => {
          return '' + params.name + ': ' + formatDisplayValue(params.value) + ' (' + params.percent.toFixed(1) + '%)';
        },
        backgroundColor: uiColors.tooltipBg,
        borderColor: uiColors.tooltipBorder,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: uiColors.tooltipText,
          fontSize: fontSize,
        },
      },
      legend: {
        type: 'scroll',
        orient: 'horizontal',
        bottom: 0,
        textStyle: { fontSize, color: uiColors.legendText },
      },
      series: [
        {
          type: 'pie',
          radius: isFullscreen ? ['40%', '70%'] : ['30%', '60%'],
          center: ['50%', '45%'],
          data: pieData,
          label: {
            show: isFullscreen || pieData.length <= 6,
            formatter: (params) => {
              if (isFullscreen) {
                return '' + params.name + '\n' + formatDisplayValue(params.value) + ' (' + params.percent.toFixed(1) + '%)';
              }
              return '' + params.name + ': ' + params.percent.toFixed(1) + '%';
            },
            fontSize: labelFontSize,
            color: uiColors.labelText,
          },
          labelLine: {
            show: isFullscreen || pieData.length <= 6,
            length: isFullscreen ? 15 : 10,
            length2: isFullscreen ? 10 : 5,
          },
          emphasis: {
            scale: true,
            scaleSize: isFullscreen ? 10 : 5,
          },
        },
      ],
      color: pieColors,
    };
  }

  const isDateField =
    typeof rows[0]?.[xField] === 'string' &&
    (/^\d{4}-\d{2}-\d{2}/.test(rows[0][xField]) || /^\d{4}-\d{2}-\d{2}T/.test(rows[0][xField]) || /^\d{4}-\d{2}-\d{2} /.test(rows[0][xField]));
  const xDataForCategory = rows.map((row) => row[xField]);

  const baseOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: chartType === 'bar' ? 'shadow' : 'line' },
      formatter: (params) => {
        if (!params || params.length === 0) return '';
        const p = params[0];
        const rawDateStr = isDateField ? rows[p.dataIndex]?.[xField] : p.name;
        const displayDateStr = isDateField ? dateFormatter(rawDateStr) : rawDateStr;
        const lines = ['<strong>' + displayDateStr + '</strong>'];
        params.forEach((param) => {
          lines.push('' + param.seriesName + ': ' + formatDisplayValue(param.value));
        });
        return lines.join('<br/>');
      },
      backgroundColor: uiColors.tooltipBg,
      borderColor: uiColors.tooltipBorder,
      borderWidth: 1,
      padding: isFullscreen ? [10, 15] : [8, 12],
      textStyle: {
        color: '#f9fafb',       // 接近白色的高对比度颜色
        fontSize: fontSize,
      },
    },
    legend: {
      show: numericFields.length > 1,
      type: 'scroll',
      orient: 'horizontal',
      bottom: 0,
      textStyle: { fontSize, color: uiColors.legendText },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: numericFields.length > 1 ? '15%' : '3%',
      top: isFullscreen ? '5%' : '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: xDataForCategory,
      boundaryGap: chartType === 'bar',
      axisLabel: {
        fontSize,
        color: uiColors.labelText,
        rotate: isDateField && !isFullscreen && dimensions.width < 400 ? 30 : 0,
        interval: 'auto',
        formatter: isDateField ? dateFormatter : undefined,
      },
      axisLine: {
        lineStyle: { color: uiColors.axisLine, width: isFullscreen ? 2 : 1 },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize,
        color: uiColors.labelText,
        formatter: (value) => formatDisplayValue(value),
      },
      axisLine: {
        lineStyle: { color: uiColors.axisLine, width: isFullscreen ? 2 : 1 },
      },
      splitLine: { lineStyle: { color: uiColors.gridLine } },
    },
    dataZoom:
      isFullscreen && rows.length > 50
        ? [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', show: true, bottom: 30, start: 0, end: 100 },
          ]
        : undefined,
  };

  if (chartType === 'line') {
    const series = numericFields.map((field, index) => ({
      type: 'line',
      name: field,
      data: rows.map((row) => row[field]),
      smooth: true,
      symbol: 'circle',
      symbolSize: symbolSize,
      lineStyle: { width: isFullscreen ? 3 : 2 },
      itemStyle: { color: colors[index % colors.length] },
      label:
        isFullscreen
          ? {
              show: true,
              position: 'top',
              formatter: (params) => formatDisplayValue(params.value),
              fontSize: labelFontSize,
              color: uiColors.labelText,
              distance: 5,
            }
          : undefined,
      emphasis: { focus: 'series', itemStyle: { borderWidth: 2 } },
    }));
    return { ...baseOption, series, color: colors };
  }

  if (chartType === 'bar') {
    if (numericFields.length === 0) {
      return {
        title: {
          text: 'No numeric data',
          left: 'center',
          top: 'center',
          textStyle: { color: uiColors.mutedText, fontSize: fontScale.title },
        },
      };
    }
    const series = numericFields.map((field, index) => ({
      type: 'bar',
      name: field,
      data: rows.map((row) => row[field]),
      barMaxWidth: isFullscreen ? 80 : 60,
      itemStyle: {
        color: colors[index % colors.length],
        borderRadius: isFullscreen ? [6, 6, 0, 0] : [4, 4, 0, 0],
      },
      label:
        isFullscreen
          ? {
              show: true,
              position: 'top',
              formatter: (params) => formatDisplayValue(params.value),
              fontSize: labelFontSize,
              color: uiColors.labelText,
              distance: 3,
            }
          : undefined,
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: uiColors.emphasisShadow } },
    }));
    return { ...baseOption, series, color: colors };
  }

  if (chartType === 'area') {
    const series = numericFields.map((field, index) => ({
      type: 'line',
      name: field,
      data: rows.map((row) => row[field]),
      smooth: true,
      symbol: isFullscreen ? 'circle' : 'none',
      symbolSize: symbolSize,
      lineStyle: { width: isFullscreen ? 3 : 2 },
      areaStyle: { opacity: isFullscreen ? 0.4 : 0.3 },
      itemStyle: { color: colors[index % colors.length] },
      label:
        isFullscreen
          ? {
              show: true,
              position: 'top',
              formatter: (params) => formatDisplayValue(params.value),
              fontSize: labelFontSize,
              color: uiColors.labelText,
              distance: 5,
            }
          : undefined,
    }));
    return { ...baseOption, series, color: colors };
  }

  return {
    title: {
      text: 'Unknown chart type',
      left: 'center',
      top: 'center',
      textStyle: { color: uiColors.mutedText, fontSize: fontScale.title },
    },
  };
}

/**
 * ChartContent 组件 — 渲染 ECharts 可视化图表
 * 使用 React.memo 防止不必要的重复渲染
 * 全屏模式下提供更丰富的标签和交互
 */
const ChartContent = React.memo(function ChartContent({
  rows,
  fields,
  chartType,
  dimensions,
  isFullscreen,
  dateTrunc,
}) {
  // 获取当前主题色
  const { primaryColor } = useThemeColor();

  const option = getEChartsOption({
    rows,
    fields,
    chartType,
    dimensions,
    isFullscreen,
    dateTrunc,
    primaryColor
  });

  // 动画配置：确保图表有平滑的入场和过渡动画
  const animationOption = {
    animation: true,
    animationDuration: 600,
    animationEasing: 'cubicOut',
    animationDelay: (idx) => idx * 50, // 每个数据项延迟 50ms，形成渐进效果
  };

  return (
    <ReactECharts
      option={{ ...option, ...animationOption }}
      style={{ width: '100%', height: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge={true}
      lazyUpdate={rows?.length > 100}
    />
  );
});

ChartContent.displayName = 'ChartContent';

export default ChartContent;
