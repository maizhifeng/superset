import { useState, useRef, useEffect } from 'react';

// ============================================================
// 图表缩放 Hook
// 根据容器的实际尺寸动态计算图表各元素的缩放比例
// ============================================================

/**
 * 根据容器宽度、高度和是否有维度自动选择图表类型
 */
export function getAutoChartType(width, height, hasDimensions) {
  if (!hasDimensions) return 'number';
  if (width < 200 || height < 150) return 'number';
  if (width >= 400 && height >= 300) return 'table';
  return 'bar';
}

// 各图表类型的基础尺寸配置
const BASE_SIZES = {
  number: { width: 100, height: 60, fontSize: 36 },
  auto: { width: 100, height: 60, fontSize: 36 },
  pie: { width: 180, height: 180, outerRadius: 60 },
  line: { width: 200, height: 180, strokeWidth: 2, dotRadius: 4 },
  bar: { width: 200, height: 180 },
  area: { width: 200, height: 180, strokeWidth: 2 },
  table: { width: 200, height: 180, fontSize: 12 },
};

// 缩放比例上下限
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;

/**
 * 图表缩放 Hook
 * 监听容器尺寸变化，动态计算适配的字体大小、刻度数量等参数
 * @param {string} chartType - 图表类型
 */
export function useChartScale(chartType) {
  const containerRef = useRef(null);
  const [scaledParams, setScaledParams] = useState(null);

  // 当图表类型或容器尺寸变化时重新计算缩放参数
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;

      const { width, height } = containerRef.current.getBoundingClientRect();
      const baseSize = BASE_SIZES[chartType] || BASE_SIZES.line;

      // 分别计算宽度和高度缩放比，取较小值并限制在允许范围内
      const widthScale = width / baseSize.width;
      const heightScale = height / baseSize.height;
      const scaleFactor = Math.max(
        MIN_SCALE,
        Math.min(Math.min(widthScale, heightScale), MAX_SCALE)
      );

      const params = { width, height, scaleFactor };

      // 根据缩放因子计算各字体大小
      params.tickFontSize = Math.max(10, Math.round(11 * scaleFactor));
      params.legendFontSize = Math.max(10, Math.round(10 * scaleFactor));
      params.tooltipFontSize = Math.max(10, Math.round(11 * scaleFactor));
      params.labelFontSize = Math.max(10, Math.round(11 * scaleFactor));

      // 计算 Y 轴和 X 轴的刻度数量
      const tickSpacing = params.tickFontSize * 2.5;
      params.yAxisTickCount = Math.max(3, Math.min(Math.floor(height / tickSpacing), 8));

      const xTickWidth = params.tickFontSize * 8;
      params.xAxisTickCount = Math.max(3, Math.min(Math.floor(width / xTickWidth), 12));

      // 根据图表类型设置特定参数
      switch (chartType) {
        case 'number':
        case 'auto':
          params.fontSize = Math.max(48, Math.round(baseSize.fontSize * scaleFactor));
          break;
        case 'pie':
          params.outerRadius = Math.round(baseSize.outerRadius * scaleFactor);
          break;
        case 'line':
          params.strokeWidth = Math.max(1, baseSize.strokeWidth * scaleFactor);
          params.dotRadius = Math.max(2, baseSize.dotRadius * scaleFactor);
          break;
        case 'area':
          params.strokeWidth = Math.max(1, baseSize.strokeWidth * scaleFactor);
          break;
        case 'table':
          params.fontSize = Math.round(baseSize.fontSize * scaleFactor);
          break;
      }

      // 计算图表实际高度
      params.chartHeight = Math.max(Math.min(height - 10, height), 80);

      setScaledParams(params);
    };

    updateScale();

    const resizeObserver = new ResizeObserver(updateScale);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [chartType]);

  return { containerRef, scaledParams };
}