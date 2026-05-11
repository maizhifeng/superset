// ============================================================
// NumberCard — 数字卡片组件
// 用于小面积挂件（<=2 网格单位），显示数值指标
// 根据容器尺寸动态缩放字体
// ============================================================

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { formatDisplayValue, formatByMetricFormat } from '@/utils/formatters';

/**
 * NumberCard 组件 — 显示数值指标
 * 用于小面积挂件（<=2 网格单位）
 * 字号根据容器尺寸动态缩放
 */
const NumberCard = React.memo(function NumberCard({ fields, rows, containerSize, config, metricNameMap = {}, metricNameFormatMap = {} }) {
  const numericFields = fields?.filter((f) => typeof rows?.[0]?.[f.name] === 'number') || [];

  // 如有自定义指标配置，则分别显示各指标值
  const customMetrics = config?.metrics || [];
  const hasMultipleMetrics = customMetrics.length > 1 || numericFields.length > 1;

  // 根据容器尺寸计算字号
  const fontSize = useMemo(() => {
    if (!containerSize) return 32;
    const minDim = Math.min(containerSize.width, containerSize.height);
    // 较小容器使用较小字体，但保持可读性
    return Math.max(20, Math.min(minDim * 0.5, 56));
  }, [containerSize]);

  const multiFontSize = useMemo(() => {
    if (!containerSize) return 12;
    return Math.max(11, Math.min(containerSize.height * 0.1, 16));
  }, [containerSize]);

  if (!rows || rows.length === 0) {
    return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">暂无数据</Typography>
      </Box>
    );
  }

  const value = rows[0];

  // 单一指标 — 显示大号数字，动态调整尺寸
  if (!hasMultipleMetrics) {
    const fieldName = numericFields.length > 0
      ? numericFields[0].name
      : fields?.[0]?.name;
    const displayValue = fieldName && value[fieldName] !== undefined ? value[fieldName] : 0;
    const fmt = metricNameFormatMap[fieldName] || 'float';
    return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography
          className="number-card-value"
          sx={{
            fontSize: `${fontSize}px`,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1,
            color: 'text.primary',
          }}
        >
          {formatByMetricFormat(displayValue, fmt)}
        </Typography>
      </Box>
    );
  }

  // 多指标 — 以迷你表格形式显示，动态调整尺寸
  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.5, p: 0.5 }}>
      {numericFields.map((field) => {
        const fmt = metricNameFormatMap[field.name] || 'float';
        return (
          <Box
            key={field.name}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: `${multiFontSize}px` }}
          >
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 80,
                whiteSpace: 'nowrap',
              }}
            >
              {metricNameMap[field.name] || field.name}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'text.primary' }}
            >
              {formatByMetricFormat(value[field.name], fmt)}
            </Typography>
            {config?.unit && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: `${multiFontSize - 2}px` }}>
                {config.unit}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
});

NumberCard.displayName = 'NumberCard';

export default NumberCard;
