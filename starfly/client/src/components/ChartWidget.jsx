// ============================================================
// ChartWidget — 图表挂件容器组件
// 负责渲染图表、表格、数字卡片等可视化内容
// 支持全屏模式、维度选择、全局筛选、配置实时更新
// ============================================================

import React, { useMemo, useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { Box, Typography, IconButton, Select, MenuItem, FormControl, Tooltip, Card, Switch } from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { metricsAPI, dashboardsAPI } from '../api';
import { queryKeys } from '../api/queryKeys';
import { useChartData } from '../hooks/useChartData';
import NumberCard from './NumberCard';
import TableView from './TableView';
import ChartContent from './ChartContent';
const FullscreenModal = React.lazy(() => import('./FullscreenModal'));
import { Icon } from '@/components/ui/icon';

/**
 * 根据网格面积计算挂件内边距
 */
function getWidgetPadding(area) {
  if (area <= 2) return 0.5;
  if (area <= 6) return 1;
  return 1.5;
}

/**
 * 根据配置和网格尺寸确定图表类型
 */
function getChartType(config, gridWidth, gridHeight, overrideChartType = null) {
  const validChartTypes = ['line', 'bar', 'area', 'pie', 'table', 'number'];
  if (overrideChartType && validChartTypes.includes(overrideChartType)) return overrideChartType;
  if (config?.chartType && validChartTypes.includes(config.chartType)) return config.chartType;
  const area = gridWidth * gridHeight;
  if (area > 25) return 'table';
  if (area > 2) return 'bar';
  return 'number';
}

const ChartWidget = React.memo(function ChartWidget({
  widget,
  layoutSize,
  isResizing,
  isSelected,
  onSelect,
  onEdit,
  dashboardId,
  prefetchedData,
  onConfigUndo,
}) {
  const queryClient = useQueryClient();
  const widgetId = widget?.id;
  const metricId = widget?.metric_id;
  const metricIds = widget?.metric_ids || (metricId ? [metricId] : []);
  const config = widget?.config || {};

  const gridWidth = layoutSize?.w || widget?.position?.w || 2;
  const gridHeight = layoutSize?.h || widget?.position?.h || 1;

  const containerRef = useRef(null);
  const tableViewRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 200, height: 150 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenDimension, setFullscreenDimension] = useState(null);
  const [fullscreenChartType, setFullscreenChartType] = useState(null);

  // 全屏模式下的统一待保存状态对象
  const [pendingChanges, setPendingChanges] = useState(null);
  const [copied, setCopied] = useState(false);

  // ESC 键关闭全屏
  useEffect(() => {
    if (isFullscreen) {
      const handleEsc = (e) => { if (e.key === 'Escape') setIsFullscreen(false); };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isFullscreen]);

  // 关闭全屏时清除待保存状态
  useEffect(() => {
    if (!isFullscreen) {
      setFullscreenDimension(null);
      setFullscreenChartType(null);
      setPendingChanges(null);
    }
  }, [isFullscreen]);

  // 追踪容器尺寸变化
  useEffect(() => {
    let rafId = null;
    const debouncedUpdate = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setDimensions({ width: rect.width, height: rect.height });
        }
        rafId = null;
      });
    };
    debouncedUpdate();
    const resizeObserver = new ResizeObserver(debouncedUpdate);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => { resizeObserver.disconnect(); if (rafId) cancelAnimationFrame(rafId); };
  }, []);

  const widgetArea = gridWidth * gridHeight;
  const isNumberCard = widgetArea <= 2;
  // 追踪最新 visibleFields 以实现乐观更新（隐藏/重新添加的竞态条件）
  const latestVisibleFieldsRef = useRef(config?.visibleFields);
  const [latestVisibleFields, setLatestVisibleFields] = useState(config?.visibleFields);
  const hasDimensions = config?.dimensions?.length > 0;
  const shouldPromptDimension = useMemo(() => {
    if (isNumberCard || hasDimensions) return false;
    return dimensions.width >= 200 && dimensions.height >= 150;
  }, [isNumberCard, hasDimensions, dimensions]);

  // 全屏模式下的有效状态
  const effectiveMetricIds = useMemo(() => {
    if (isFullscreen && pendingChanges?.metricIds) return pendingChanges.metricIds;
    return metricIds;
  }, [isFullscreen, pendingChanges, metricIds]);

  const effectiveConfig = useMemo(() => {
    if (!isFullscreen || !pendingChanges) return config;
    const merged = { ...config };
    if (pendingChanges.visibleFields) merged.visibleFields = pendingChanges.visibleFields;
    if (pendingChanges.dimensions) merged.dimensions = pendingChanges.dimensions;
    return merged;
  }, [isFullscreen, pendingChanges, config]);

  // 获取图表数据
  const {
    rows,
    fields,
    aliasNameMap,
    totals,
    isLoading,
    error,
    columns,
    dimensionColumns,
    detectedDateField,
    hasRealDateField,
    globalFiltersBlocked,
    updateMutation,
    table,
    datasetColumnWhitelist,
  } = useChartData({
    widgetId,
    datasetId: widget?.dataset_id,
    metricIds: effectiveMetricIds,
    config: effectiveConfig,
    gridWidth,
    gridHeight,
    dateField: null,
    isFullscreen,
    fullscreenDimension,
    dashboardId,
    prefetchedData,
  });

  const handleCopyTable = useCallback(() => {
    tableViewRef.current?.copyTable?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // 进入全屏且未配置维度时自动应用日期维度
  useEffect(() => {
    if (isFullscreen && hasRealDateField && !config?.dimensions?.length && !fullscreenDimension) {
      setFullscreenDimension(detectedDateField);
    }
  }, [isFullscreen, hasRealDateField, config?.dimensions, fullscreenDimension, detectedDateField]);

  // 获取可用的已保存指标
  const { data: metricsData } = useQuery({
    queryKey: ['metrics'],
    queryFn: metricsAPI.list,
    staleTime: 60000,
  });

  const availableMetrics = useMemo(() => {
    const allMetrics = metricsData?.data || [];
    if (!table) return [];
    let filtered = allMetrics.filter(m =>
      m.config?.table === table ||
      m.dataset_base_table === table ||
      m.dataset_name === table ||
      (table.startsWith('dataset:') && m.dataset_name === table.slice(8))
    );
    if (datasetColumnWhitelist) {
      filtered = filtered.filter(m => {
        const fields = (m.config?.aggregations || []).map(a => a.field).filter(Boolean);
        if (fields.length === 0) return true;
        return fields.every(f => datasetColumnWhitelist.has(f));
      });
    }
    return filtered;
  }, [metricsData, table, datasetColumnWhitelist]);

  // 构建字段别名到数字格式的映射，用于显示格式化
  const metricNameFormatMap = useMemo(() => {
    const map = {};
    (availableMetrics || []).forEach(m => {
      const agg = m.config?.aggregations?.[0];
      if (agg) {
        const alias = (agg.alias || `${agg.func}_${agg.field}`).toLowerCase();
        map[alias] = m.config?.numberFormat || 'float';
      }
    });
    (config?.metrics || []).forEach(m => {
      const alias = (m.alias || `${m.func}_${m.field}`).toLowerCase();
      map[alias] = m.numberFormat || 'float';
    });
    return map;
  }, [availableMetrics, config?.metrics]);

  const dateField = hasRealDateField ? detectedDateField : null;

  const chartType = useMemo(() => getChartType(config, gridWidth, gridHeight, isFullscreen ? fullscreenChartType : null), [config, gridWidth, gridHeight, isFullscreen, fullscreenChartType]);

  // 全屏表格模式下未配置可见字段时的默认可见字段
  const fullscreenTableInitVisibleFields = useMemo(() => {
    if (!isFullscreen) return undefined;
    const isTable = fullscreenChartType === 'table' || config?.chartType === 'table';
    if (!isTable) return undefined;
    if (config?.visibleFields) return undefined;
    if (!fields || fields.length === 0) return undefined;
    const numericTypes = ['integer', 'numeric', 'decimal', 'bigint', 'smallint', 'real', 'double precision', 'float', 'money'];
    return fields
      .filter(f => {
        const col = columns?.find(c => c.column_name === f.name);
        if (col) return !numericTypes.includes(col.data_type?.toLowerCase());
        return f.type !== 'number' && f.type !== 'metric';
      })
      .map(f => f.name);
  }, [isFullscreen, fullscreenChartType, config?.chartType, config?.visibleFields, fields, columns]);

  const handleSelectDimension = (dimension) => {
    const newConfig = { ...config, dimensions: [dimension] };
    latestVisibleFieldsRef.current = newConfig.visibleFields || config?.visibleFields;
    setLatestVisibleFields(latestVisibleFieldsRef.current);
    updateMutation.mutate(newConfig);
  };

  // 统一的全屏变更保存处理函数
  const handleSaveFullscreenChanges = () => {
    const newConfig = { ...config };

    // 全屏维度选择器（周/月）
    if (fullscreenDimension) {
      if (fullscreenDimension === 'week' || fullscreenDimension === 'month') {
        newConfig.dimensions = [dateField];
        newConfig.dateTrunc = fullscreenDimension;
      } else {
        newConfig.dimensions = [fullscreenDimension];
        newConfig.dateTrunc = undefined;
      }
    }

    // 来自 TableView"+"按钮的待保存变更
    if (pendingChanges) {
      if (pendingChanges.dimensions && !fullscreenDimension) newConfig.dimensions = pendingChanges.dimensions;
      if (pendingChanges.visibleFields) newConfig.visibleFields = [...new Set(pendingChanges.visibleFields)];
      if (pendingChanges.pendingMetrics?.length > 0) {
        const existingMetrics = newConfig.metrics || [];
        const existingAliases = new Set(existingMetrics.map(m => m.alias?.toLowerCase()));
        const newMetrics = pendingChanges.pendingMetrics.filter(
          m => !existingAliases.has((m.alias || `${m.func}_${m.field}`).toLowerCase())
        );
        newConfig.metrics = [...existingMetrics, ...newMetrics];
      }
    }

    if (fullscreenChartType) newConfig.chartType = fullscreenChartType;

    const updates = { config: newConfig };
    if (pendingChanges?.metricIds) updates.metricIds = pendingChanges.metricIds;

    dashboardsAPI.updateWidget(widgetId, updates).then(() => {
      latestVisibleFieldsRef.current = newConfig.visibleFields;
      setLatestVisibleFields(newConfig.visibleFields);
      queryClient.invalidateQueries(['dashboard', dashboardId]);
      queryClient.invalidateQueries(['widgetBatch']);
      queryClient.invalidateQueries(['metricData']);
      setFullscreenDimension(null);
      setFullscreenChartType(null);
      setPendingChanges(null);
      setIsFullscreen(false);
    }).catch((err) => {
      console.warn('Failed to save fullscreen changes:', err?.message);
    });
  };

  const renderContent = () => {
    if (shouldPromptDimension && dimensionColumns.length > 0) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 1 }}>
          <Box sx={{ textAlign: 'center', mb: 1 }}>
            <Icon name="chart" size={20} sx={{ color: 'primary.main', display: 'block', mx: 'auto', mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">选择维度以显示图表</Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 150, maxWidth: 200 }}>
            <Select displayEmpty value="" onChange={(e) => handleSelectDimension(e.target.value)} disabled={updateMutation.isPending} onClose={() => document.activeElement?.blur()} sx={{ fontSize: '0.8125rem', backgroundColor: 'background.default' }}>
              <MenuItem value="" disabled>选择维度...</MenuItem>
              {dimensionColumns.map(c => <MenuItem key={c.column_name} value={c.column_name} sx={{ fontSize: '0.8125rem' }}>{c.column_name}</MenuItem>)}
            </Select>
          </FormControl>
          {updateMutation.isPending && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>保存中...</Typography>}
        </Box>
      );
    }

    if (isLoading && (!rows || rows.length === 0)) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Box component="span" sx={{ display: 'inline-block', animation: 'spin 1s linear infinite', borderRadius: '50%', width: 20, height: 20, border: '2px solid', borderColor: 'action.disabledBackground', borderTopColor: 'primary.main', mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>加载中...</Typography>
          </Box>
        </Box>
      );
    }

    if (error) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 1 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Icon name="warning" size={24} sx={{ color: 'error.main', display: 'block', mx: 'auto', mb: 0.5 }} />
            <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>数据加载失败</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
              {onConfigUndo && (
                <Box
                  onClick={() => onConfigUndo(widget?.id)}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                    px: 0.75, py: 0.35, borderRadius: 0.5,
                    fontSize: '0.625rem', fontWeight: 600, color: 'warning.main',
                    border: '1px solid', borderColor: 'warning.main',
                    '&:hover': { bgcolor: 'warning.main', color: 'warning.contrastText' },
                  }}
                >
                  撤回
                </Box>
              )}
              <Box
                onClick={() => {
                  const errMsg = error?.response?.data?.error || error?.message || error?.toString() || '(unknown)';
                  const details = [
                    `Widget: #${widget?.id} ${widget?.title || ''}`,
                    `Dashboard: ${dashboardId}`,
                    `Error: ${errMsg}`,
                    `Config: ${JSON.stringify(widget?.config || {})}`,
                    `Metric IDs: ${JSON.stringify(widget?.metric_ids || [])}`,
                    `Timestamp: ${new Date().toISOString()}`,
                    '',
                    `Status: ${error?.response?.status || '-'}`,
                    `URL: ${error?.response?.config?.url || '-'}`,
                  ].join('\n');
                  navigator.clipboard?.writeText(details);
                }}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                  px: 0.75, py: 0.35, borderRadius: 0.5,
                  fontSize: '0.625rem', fontWeight: 600, color: 'error.main',
                  border: '1px solid', borderColor: 'error.main',
                  '&:hover': { bgcolor: 'error.main', color: 'error.contrastText' },
                }}
              >
                Copy debug log
              </Box>
            </Box>
          </Box>
        </Box>
      );
    }

    if (globalFiltersBlocked) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Box sx={{ textAlign: 'center', px: 1 }}>
            <Icon name="filter" size={24} sx={{ color: 'warning.main', display: 'block', mx: 'auto', mb: 0.5 }} />
            <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>全局日期筛选生效</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>此图表无日期字段</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>无法应用筛选</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>编辑图表启用"忽略全局筛选器"</Typography>
          </Box>
        </Box>
      );
    }

    if (!rows || rows.length === 0) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Icon name="empty" size={24} sx={{ color: 'text.secondary', display: 'block', mx: 'auto', mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">暂无数据</Typography>
          </Box>
        </Box>
      );
    }

    if (chartType === 'number') {
      return <NumberCard fields={fields} rows={rows} containerSize={dimensions} config={config} metricNameMap={aliasNameMap} metricNameFormatMap={metricNameFormatMap} />;
    }

    if (chartType === 'table') {
      return (
          <TableView
            ref={tableViewRef}
            fields={fields}
            rows={rows}
            columns={columns}
            isLoading={isLoading}
            metricNameMap={aliasNameMap}
            metricNameFormatMap={metricNameFormatMap}
            totals={totals}
            visibleFields={config?.visibleFields}
          availableMetrics={availableMetrics}
          currentMetricIds={metricIds}
          currentDimensions={config?.dimensions}
          isFullscreen={isFullscreen}
          pendingVisibleFields={pendingChanges?.visibleFields || fullscreenTableInitVisibleFields}
          pendingMetricIds={pendingChanges?.metricIds}
          pendingDimensions={pendingChanges?.dimensions}
          onPendingChange={(changes) => setPendingChanges(prev => {
            const base = prev || {};
            const merged = { ...base, ...changes };
            if (changes.pendingMetrics) {
              const existing = base.pendingMetrics || [];
              const existingAliases = new Set(existing.map(m => (m.alias || `${m.func}_${m.field}`).toLowerCase()));
              const deduped = changes.pendingMetrics.filter(
                m => !existingAliases.has((m.alias || `${m.func}_${m.field}`).toLowerCase())
              );
              merged.pendingMetrics = [...existing, ...deduped];
            }
            return merged;
          })}
          onVisibleFieldsChange={(newVisibleFields, removedField) => {
            const newConfig = { ...config, visibleFields: newVisibleFields };
            latestVisibleFieldsRef.current = newVisibleFields;
            setLatestVisibleFields(newVisibleFields);
            updateMutation.mutate(newConfig);
          }}
          latestVisibleFields={latestVisibleFields}
          dateTrunc={isFullscreen && fullscreenDimension ? fullscreenDimension : config?.dateTrunc}
          dateField={dateField}
          widgetMetrics={config?.metrics}
          onAddDefaultMeasure={(field, func) => {
            const alias = field;
            const visibleList = latestVisibleFieldsRef.current || fields?.map(f => f.name) || [];
            if (visibleList.some(f => f.toLowerCase() === alias.toLowerCase())) return;
            // 从 dashboard cache 读取最新配置（支持连续添加多个指标）
            const dashData = queryClient.getQueryData(queryKeys.dashboard(dashboardId));
            const currentWidgetConfig = dashData?.data?.widgets?.find(w => w.id === widgetId)?.config || config;
            const existingMetrics = currentWidgetConfig?.metrics || [];
            if (existingMetrics.some(m => (m.name || m.alias || `${m.func}_${m.field}`).toLowerCase() === alias.toLowerCase())) return;
            const newMetric = { func, field, alias, name: field };
            const newConfig = {
              ...currentWidgetConfig,
              metrics: [...existingMetrics, newMetric],
              visibleFields: [...visibleList, alias],
            };
            latestVisibleFieldsRef.current = newConfig.visibleFields;
            setLatestVisibleFields(newConfig.visibleFields);
            updateMutation.mutate(newConfig);
          }}
          onAddMetric={(metricId, metricAlias) => {
            const currentMetricIds = (widget?.metric_ids || []).map(id => Number(id));
            const normalizedAlias = metricAlias.toLowerCase();
            const currentVisible = (latestVisibleFieldsRef.current || fields?.map(f => f.name) || [])
              .map(f => f.toLowerCase());
            const updates = {};
            if (!currentMetricIds.includes(Number(metricId))) updates.metricIds = [...currentMetricIds, Number(metricId)];
            if (!currentVisible.includes(normalizedAlias)) {
              updates.config = { ...config, visibleFields: [...(latestVisibleFieldsRef.current || fields?.map(f => f.name) || []), normalizedAlias] };
              latestVisibleFieldsRef.current = updates.config.visibleFields;
              setLatestVisibleFields(updates.config.visibleFields);
            }
            if (updates.metricIds || updates.config) {
              dashboardsAPI.updateWidget(widgetId, updates).then(() => {
                queryClient.invalidateQueries(['dashboard', dashboardId]);
                queryClient.invalidateQueries(['widgetBatch']);
                queryClient.invalidateQueries(['metricData']);
              }).catch((err) => {
                console.warn('Failed to add metric from widget:', err?.message);
              });
            }
          }}
          onAddColumn={(fieldName, fieldType, newVisibleFields) => {
            const newConfig = { ...config };
            if (newVisibleFields) {
              newConfig.visibleFields = newVisibleFields;
              latestVisibleFieldsRef.current = newVisibleFields;
              setLatestVisibleFields(newVisibleFields);
            } else if (fieldName) {
              if (fieldType === 'dimension') {
                const currentDimensions = config?.dimensions || [];
                if (!currentDimensions.includes(fieldName)) newConfig.dimensions = [...currentDimensions, fieldName];
              }
              const currentVisible = (latestVisibleFieldsRef.current || fields?.map(f => f.name) || [])
                .map(f => f.toLowerCase());
              if (!currentVisible.includes(fieldName.toLowerCase())) {
                newConfig.visibleFields = [...(latestVisibleFieldsRef.current || fields?.map(f => f.name) || []), fieldName];
              }
              latestVisibleFieldsRef.current = newConfig.visibleFields || latestVisibleFieldsRef.current;
              setLatestVisibleFields(latestVisibleFieldsRef.current);
            }
            updateMutation.mutate(newConfig);
          }}
        />
      );
    }

    return (
      <ChartContent
        rows={rows}
        fields={fields}
        chartType={chartType}
        dimensions={dimensions}
        isFullscreen={isFullscreen}
        dateTrunc={isFullscreen && fullscreenDimension ? fullscreenDimension : config?.dateTrunc}
      />
    );
  };

  return (
    <Card
      className="widget-card"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...(isSelected && {
          boxShadow: `0 0 0 2px var(--mui-palette-primary-main), var(--mui-palette-shadow-lg) !important`,
          '&:hover': { boxShadow: `0 0 0 2px var(--mui-palette-primary-main), var(--mui-palette-shadow-lg) !important` },
        }),
      }}
      onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
    >
      <Box
        className="widget-header group drag-handle"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.25,
          backgroundColor: 'bg.header',
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: '20px',
          cursor: 'move',
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit?.(); }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flex: 1, minWidth: 0 }}>
          <Tooltip title={config.ignoreGlobalFilters ? '已忽略全局筛选器' : '忽略全局筛选器'} placement="bottom" enterDelay={500}>
            <Switch
              size="small"
              checked={!!config.ignoreGlobalFilters}
              onChange={(e) => {
                e.stopPropagation();
                updateMutation.mutate({ ...config, ignoreGlobalFilters: e.target.checked });
              }}
              onClick={(e) => e.stopPropagation()}
              sx={{
                width: 28,
                height: 16,
                padding: 0,
                flexShrink: 0,
                opacity: config.ignoreGlobalFilters ? 1 : 0.4,
                transition: 'opacity 150ms',
                '.group:hover &': { opacity: 1 },
                '@media (hover: none)': { opacity: 1 },
                '& .MuiSwitch-switchBase': {
                  padding: 0.25,
                  '&.Mui-checked': { transform: 'translateX(12px)' },
                },
                '& .MuiSwitch-thumb': { width: 12, height: 12 },
                '& .MuiSwitch-track': { borderRadius: 8 },
              }}
            />
          </Tooltip>
          <Tooltip title="拖拽移动 · 双击编辑" placement="bottom" enterDelay={500}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
              {isResizing && (
                <Typography className="widget-resize-indicator" variant="caption" sx={{ backgroundColor: 'primary.main', color: 'primary.contrastText', px: 0.5, py: 0.25, borderRadius: 1, fontFamily: 'mono', flexShrink: 0, fontWeight: 600, lineHeight: 1.2 }}>
                  {gridWidth}&times;{gridHeight}
                </Typography>
              )}
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {widget?.title || 'Untitled'}
              </Typography>
            </Box>
          </Tooltip>
        </Box>
        <Box className="action-buttons" sx={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, opacity: 0.6, transition: 'opacity 150ms', '.group:hover &': { opacity: 1 }, '@media (hover: none)': { opacity: 1 } }}>
          <Tooltip title="全屏">
            <IconButton size="small" sx={{ p: 0.25, minWidth: 'auto' }} onClick={(e) => { e.stopPropagation(); setIsFullscreen(true); }}>
              <Icon name="fullscreen" size={14} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box ref={containerRef} sx={{ flex: 1, overflow: 'hidden', p: getWidgetPadding(widgetArea), backgroundColor: 'background.paper' }}>
        {renderContent()}
      </Box>

      <Suspense fallback={null}>
        <FullscreenModal
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          title={widget?.title || 'Untitled'}
          config={config}
          dateField={dateField}
          hasRealDateField={hasRealDateField}
          dimensionColumns={dimensionColumns}
          fullscreenDimension={fullscreenDimension}
          fullscreenChartType={fullscreenChartType}
          setFullscreenDimension={setFullscreenDimension}
          setFullscreenChartType={setFullscreenChartType}
          onSave={handleSaveFullscreenChanges}
          onReset={() => setPendingChanges(null)}
          pendingVisibleFields={pendingChanges?.visibleFields}
          pendingMetricIds={pendingChanges?.metricIds}
          originalVisibleFields={config?.visibleFields}
          originalMetricIds={metricIds}
          onCopyTable={handleCopyTable}
          copied={copied}
        >
          {renderContent()}
        </FullscreenModal>
      </Suspense>
    </Card>
  );
}, (prevProps, nextProps) => {
  return prevProps.widget?.id === nextProps.widget?.id
    && prevProps.layoutSize?.w === nextProps.layoutSize?.w
    && prevProps.layoutSize?.h === nextProps.layoutSize?.h
    && prevProps.isResizing === nextProps.isResizing
    && prevProps.isSelected === nextProps.isSelected
    && prevProps.dashboardId === nextProps.dashboardId
    && prevProps.prefetchedData === nextProps.prefetchedData
    && prevProps.widget?.config === nextProps.widget?.config
    && prevProps.widget?.metric_ids === nextProps.widget?.metric_ids;
});

export default ChartWidget;