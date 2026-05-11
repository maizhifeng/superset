import { useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardsAPI, dbAPI, datasetsAPI, widgetsAPI } from '../api';
import { queryKeys } from '../api/queryKeys';
import { useDashboardStore } from '../store';
import { detectDateField, getAllDateFields, isDateDataType } from '../utils/dateFieldDetection';

// ============================================================
// 图表数据获取 Hook
// 负责获取图表组件数据、表列信息和日期字段检测
// 优化：移除冗余的 firstMetricData 查询，使用单一 metricData 来源
// ============================================================

// 默认 staleTime 在 main.jsx 中配置（5 分钟）
// 单个查询可根据特殊需要覆盖此值
export function useChartData({
  widgetId,
  datasetId,
  metricIds,
  config,
  gridWidth,
  gridHeight,
  dateField,
  isFullscreen,
  fullscreenDimension,
  dashboardId,
  prefetchedData,
}) {
  const queryClient = useQueryClient();
  const globalFilters = useDashboardStore(state => state.globalFilters);

  // 同时支持来自 widget.metric_ids 和 config.metricIds 的指标 ID
  const targetMetricIds = useMemo(() => {
    const fromWidget = metricIds.length > 0 ? metricIds.map(Number) : [];
    const fromConfig = config?.metricIds?.length > 0 ? config.metricIds.map(Number) : [];
    return fromWidget.length > 0 ? fromWidget : fromConfig;
  }, [metricIds, config?.metricIds]);
  const widgetArea = gridWidth * gridHeight;
  const isNumberCard = widgetArea <= 2;

  const limit = config?.limit || 1000;

  const datasourceTable = config?.datasource || '';

  // 从 dataset_id（主要）或组件数据源（自定义）解析表名
  const { data: datasetData } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => datasetsAPI.get(datasetId),
    enabled: !!datasetId,
  });

  // 如果数据源是 "dataset:xxx" 格式，则加载数据集
  const { data: datasourceDatasetData } = useQuery({
    queryKey: ['datasetByName', datasourceTable],
    queryFn: async () => {
      if (!datasourceTable.startsWith('dataset:')) return null;
      const datasetName = datasourceTable.slice(8);
      const datasets = await datasetsAPI.list();
      return datasets?.data?.find(d => d.name === datasetName);
    },
    enabled: datasourceTable.startsWith('dataset:') && targetMetricIds.length === 0,
  });

  // 最终解析表名：通过 dataset_id、自定义数据源或组件数据源
  const table = useMemo(() => {
    if (datasetData?.data?.base_table) return datasetData.data.base_table;
    if (datasourceDatasetData?.base_table) return datasourceDatasetData.base_table;
    if (datasourceTable && !datasourceTable.startsWith('dataset:')) return datasourceTable;
    return null;
  }, [datasetData, datasourceDatasetData, datasourceTable]);

  // 预加载表信息以便进行日期检测
  const { data: tablesData } = useQuery({
    queryKey: queryKeys.dbTables(),
    queryFn: dbAPI.getTables,
  });

  // 加载当前表的列信息（解析 schema 前缀）
  const tableSchema = table?.includes('.') ? table.split('.')[0] : '';
  const bareTable = table?.includes('.') ? table.split('.').slice(1).join('.') : table;
  const { data: tableColumnsData } = useQuery({
    queryKey: queryKeys.dbTableColumns(bareTable, tableSchema),
    queryFn: () => dbAPI.getTableColumns(bareTable, tableSchema || 'public'),
    enabled: !!table,
  });

  const columns = tableColumnsData?.data || [];
  const numericTypes = ['integer', 'numeric', 'decimal', 'bigint', 'smallint', 'real', 'double precision', 'float', 'money'];

  // 当组件引用数据集时，仅暴露在数据集 config.fields 或 config.filters 中定义的列
  const datasetColumnWhitelist = useMemo(() => {
    const ds = datasetData?.data;
    if (!ds?.config) return null;
    const cols = new Set();
    if (ds.config.fields) ds.config.fields.forEach(f => cols.add(f.field));
    if (ds.config.filters) ds.config.filters.forEach(f => cols.add(f.field));
    return cols.size > 0 ? cols : null;
  }, [datasetData]);

  const filteredColumns = useMemo(() => {
    if (!datasetColumnWhitelist) return columns;
    let result = columns.filter(c => datasetColumnWhitelist.has(c.column_name));
    const existing = new Set(result.map(c => c.column_name));
    // 包含组件维度中引用的列（即使不在数据集白名单中）
    const dims = config?.dimensions || [];
    for (const dim of dims) {
      if (!existing.has(dim)) {
        const col = columns.find(c => c.column_name === dim);
        if (col) { result = [...result, col]; existing.add(dim); }
      }
    }
    // 包含组件自定义指标字段中引用的列
    const metricFields = (config?.metrics || []).map(m => m.field).filter(Boolean);
    for (const field of metricFields) {
      if (!existing.has(field)) {
        const col = columns.find(c => c.column_name === field);
        if (col) { result = [...result, col]; existing.add(field); }
      }
    }
    return result;
  }, [columns, datasetColumnWhitelist, config?.dimensions, config?.metrics]);

  const dimensionColumns = filteredColumns.filter(c => !numericTypes.includes(c.data_type?.toLowerCase()));

  // 智能日期字段检测 - 使用模式匹配
  // 1. 首先检查表元数据中的显式 primary_date_field
  // 2. 若未设置，则根据字段名称模式与数据类型进行智能检测
  // 3. 排除 start_date、end_date、birth_date 等不适合时间序列的字段
  const detectedDateField = useMemo(() => {
    if (!table || columns.length === 0) return null;

    const tableInfo = tablesData?.data?.find(t => t.table_name === table);

    // 使用智能检测，结合：
    // - 显式 primary_date_field（最高优先级）
    // - 字段名称模式匹配
    // - 数据类型验证
    const detectionResult = detectDateField(columns, tableInfo?.primary_date_field);

    return detectionResult?.name || null;
  }, [table, columns, tablesData]);

  // 检查 detectedDateField 是否为真正的日期/时间戳列（或手动标记为日期）
  const hasRealDateField = useMemo(() => {
    if (!table || !detectedDateField) return false;
    const dateColumn = columns.find(c => c.column_name === detectedDateField);
    if (!dateColumn) return false;
    if (dateColumn.is_date) return true;
    const dataType = dateColumn.data_type?.toLowerCase();
    return dataType?.includes('date') || dataType?.includes('timestamp');
  }, [table, detectedDateField, columns]);

  // 获取所有适合时间序列的日期字段（供维度选择下拉框使用）
  const allDateFields = useMemo(() => {
    if (!table || columns.length === 0) return [];
    return getAllDateFields(columns);
  }, [table, columns]);

  // 配置的稳定指纹，避免当仪表盘重新获取产生相同内容的新配置对象引用时不必要的 queryFn 重建
  const configFingerprint = useMemo(() => JSON.stringify({
    dimensions: config?.dimensions?.filter(Boolean) || [],
    dateTrunc: config?.dateTrunc || null,
    chartType: config?.chartType || 'auto',
    metrics: config?.metrics?.map(m => m.alias || `${m.func}_${m.field}`) || [],
    filters: config?.filters?.filter(f => f.field) || [],
    orderBy: config?.orderBy?.filter(o => o.field) || [],
    limit: config?.limit || 1000,
    ignoreGlobalFilters: config?.ignoreGlobalFilters || false,
    datasource: config?.datasource || '',
  }), [config]);

  // 跟踪是否有配置变更正在进行，避免在该期间使用过期的预获取数据
  const mutationPendingRef = useRef(false);

  // 主数据查询——调用后端 POST /api/widgets/:id/query
  // 可用时使用预获取的批量数据（避免单个组件查询）
  // 变更进行中被绕过，确保总是获取最新配置的结果
  const queryFn = useMemo(() => async () => {
    if (!mutationPendingRef.current && prefetchedData && widgetId && prefetchedData[widgetId]) {
      const ignoreGlobal = config?.ignoreGlobalFilters || false;
      const hasGlobalDateFilter = !!(globalFilters?.permanent?.dateRange?.start && globalFilters?.permanent?.dateRange?.end);
      const hasGlobalDimFilters = globalFilters?.active?.some(f => f.values?.length > 0);
      if (ignoreGlobal || (!hasGlobalDateFilter && !hasGlobalDimFilters)) {
        return prefetchedData[widgetId];
      }
    }

    if (targetMetricIds.length === 0 && !config?.metrics?.some(m => m.field)) {
      return null;
    }

    const widgetFilters = config?.filters?.filter(f => f.field) || [];
    const allFilters = [...widgetFilters];
    const ignoreGlobalFilters = config?.ignoreGlobalFilters || false;
    const effectiveDateField = dateField || detectedDateField;
    const emptyResult = { data: { rows: [], rowCount: 0, totalRowCount: 0, fields: [], truncated: false }, totals: null, aliasNameMap: {} };

    if (!ignoreGlobalFilters) {
      const permanentDateRange = globalFilters?.permanent?.dateRange;
      const hasGlobalDateFilter = permanentDateRange?.start && permanentDateRange?.end;
      if (hasGlobalDateFilter) {
        if (!hasRealDateField || !effectiveDateField) {
          return emptyResult;
        }
        const dateCol = columns.find(c => c.column_name === effectiveDateField);
        const isNumericDate = dateCol?.is_date && !isDateDataType(dateCol?.data_type);
        const fmtDate = (d) => {
          if (!isNumericDate) return d;
          const dt = typeof d === 'string' ? new Date(d) : d;
          const pad = (n) => String(n).padStart(2, '0');
          return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
        };
        allFilters.push({
          field: effectiveDateField,
          operator: 'BETWEEN',
          value: [fmtDate(permanentDateRange.start), fmtDate(permanentDateRange.end)]
        });
      }

      const activeFilters = globalFilters?.active || [];
      for (const filter of activeFilters) {
        if (filter.values?.length > 0) {
          if (filter.values.length === 1) {
            allFilters.push({ field: filter.field, operator: '=', value: filter.values[0] });
          } else {
            allFilters.push({ field: filter.field, operator: 'IN', value: filter.values });
          }
        }
      }
    }

    let dimensions = (config?.dimensions?.filter(Boolean) || []);
    // 过滤掉在表列中不存在的维度
    // 防止出现类似 'column "xxx" does not exist' 的 SQL 错误
    if (columns.length > 0) {
      const columnNames = new Set(columns.map(c => c.column_name));
      dimensions = dimensions.filter(d => columnNames.has(d));
    }

    if (isFullscreen && fullscreenDimension) {
      const isDateTrunc = fullscreenDimension === 'week' || fullscreenDimension === 'month';
      if (isDateTrunc && hasRealDateField) {
        const otherDims = dimensions.filter(d => d !== effectiveDateField);
        dimensions = [`DATE_TRUNC('${fullscreenDimension}', ${effectiveDateField})`, ...otherDims];
      } else if (dimensions.length === 0) {
        dimensions = [fullscreenDimension];
      }
    } else if (config?.dateTrunc && hasRealDateField) {
      const otherDims = dimensions.filter(d => d !== effectiveDateField);
      dimensions = [`DATE_TRUNC('${config.dateTrunc}', ${effectiveDateField})`, ...otherDims];
    } else if (!isNumberCard && dimensions.length === 0 && hasRealDateField) {
      dimensions = [effectiveDateField];
    }

    const queryConfig = {
      dimensions,
      metrics: config?.metrics?.filter(m => m.field) || [],
      filters: allFilters,
      orderBy: config?.orderBy?.filter(o => o.field) || [],
      limit,
    };

    const result = await widgetsAPI.query(widgetId, queryConfig);
    return result || emptyResult;
  }, [targetMetricIds, datasetId, configFingerprint, globalFilters, isNumberCard, dateField, detectedDateField, fullscreenDimension, hasRealDateField, isFullscreen, columns, prefetchedData, widgetId, limit]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.metricData(widgetId, config, globalFilters, dateField || detectedDateField, fullscreenDimension, isFullscreen, targetMetricIds),
    queryFn,
    placeholderData: (previousData) => mutationPendingRef.current ? undefined : previousData,
    enabled: (!!table || !!datasetId) && (targetMetricIds.length > 0 || config?.metrics?.some(m => m.field)),
    select: (response) => {
      if (response?.data) {
        return {
          ...response.data,
          aliasNameMap: response.aliasNameMap || {},
          totals: response.totals || null,
        };
      }
      return response || { rows: [], rowCount: 0, totalRowCount: 0, fields: [], truncated: false };
    },
  });

  // 更新变更，用于保存配置更改并启用乐观更新
  const updateMutation = useMutation({
    mutationFn: (newConfig) => dashboardsAPI.updateWidget(widgetId, { config: newConfig }),
    onMutate: async (newConfig) => {
      mutationPendingRef.current = true;
      await queryClient.cancelQueries(queryKeys.dashboard(dashboardId));
      const previousData = queryClient.getQueryData(queryKeys.dashboard(dashboardId));
      if (previousData?.data?.widgets) {
        queryClient.setQueryData(queryKeys.dashboard(dashboardId), {
          ...previousData,
          data: {
            ...previousData.data,
            widgets: previousData.data.widgets.map(w =>
              w.id === widgetId ? { ...w, config: newConfig } : w
            ),
          },
        });
      }
      return { previousData };
    },
    onError: (_err, _newConfig, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.dashboard(dashboardId), context.previousData);
      }
    },
    onSettled: () => {
      mutationPendingRef.current = false;
      if (dashboardId) {
        queryClient.invalidateQueries(queryKeys.dashboard(dashboardId));
      }
      queryClient.invalidateQueries(['widgetBatch']);
      queryClient.invalidateQueries(['metricData']);
    },
  });

    return {
    // 数据
    rows: data?.rows || [],
    rowCount: data?.rowCount || 0,
    totalRowCount: data?.totalRowCount || 0,
    truncated: data?.truncated || false,
    limitUsed: data?.limitUsed || 10000,
    memoryWarning: data?.memoryWarning || null,
    fields: data?.fields || [],
    aliasNameMap: data?.aliasNameMap || {},
    totals: data?.totals || null,
    isLoading,
    error,

    // 元数据
    table,
    datasetColumnWhitelist,
    columns: filteredColumns,
    dimensionColumns,
    detectedDateField,
    hasRealDateField,
    allDateFields,
    ignoreGlobalFilters: config?.ignoreGlobalFilters || false,

    // 全局过滤器阻塞状态
    globalFiltersBlocked: !!(
      !(config?.ignoreGlobalFilters || false) && !hasRealDateField &&
      globalFilters?.permanent?.dateRange?.start && globalFilters?.permanent?.dateRange?.end
    ),

    // 截断信息（用于指示器）
    truncationInfo: data?.truncated ? {
      truncated: data?.truncated,
      totalRowCount: data?.totalRowCount || 0,
      rowCount: data?.rowCount || 0,
      limitUsed: data?.limitUsed || 10000,
      warning: data?.memoryWarning || null,
    } : null,

    // 变更
    updateMutation,

    // 辅助属性
    hasData: data?.rows?.length > 0,
  };
}
