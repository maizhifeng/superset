// ============================================================
// TanStack Query Key 工厂 — 稳定 key 设计
// ============================================================
// 避免使用 JSON.stringify 作为对象 key 导致缓存不稳定。
// metricData 使用 configFingerprint 提取稳定字段生成 key。
// ============================================================

export const queryKeys = {
  // 仪表盘相关
  dashboards: () => ['dashboards'],
  dashboard: (id) => ['dashboard', id],
  dashboardWidgets: (dashboardId) => ['dashboard', dashboardId, 'widgets'],

  // 图表组件相关
  widget: (widgetId) => ['widget', widgetId],

  // 指标相关
  metrics: () => ['metrics'],
  metricsByTable: (table) => ['metrics', table],
  metricsGrouped: () => ['metricsGrouped'],
  metric: (id) => ['metric', id],

  // 数据集相关
  datasets: () => ['datasets'],

  // 指标数据查询 — 从 config 中提取稳定字段生成 key
  // 避免将完整 config 对象（含引用类型）作为 key
  metricData: (widgetId, config, globalFilters, dateField, fullscreenDimension = null, isFullscreen = false, metricIds = []) => {
    const configKey = {
      dimensions: config?.dimensions?.filter(Boolean) || [],
      dateTrunc: config?.dateTrunc || null,
      chartType: config?.chartType || 'auto',
      metrics: config?.metrics?.map(m => m.alias || `${m.func}_${m.field}`) || [],
      filters: config?.filters?.map(f => `${f.field}${f.operator}${f.value}`) || [],
      orderBy: config?.orderBy?.map(o => `${o.field}:${o.direction}`) || [],
      limit: config?.limit || 1000,
      ignoreGlobalFilters: config?.ignoreGlobalFilters || false,
      metricIds: metricIds.slice().sort((a, b) => a - b),
      datasource: config?.datasource || '',
    };

    const permanentDateRange = globalFilters?.permanent?.dateRange;
    const activeFilters = globalFilters?.active || [];

    const filtersKey = {
      dateRange: permanentDateRange?.start && permanentDateRange?.end
        ? `${permanentDateRange.start}_${permanentDateRange.end}`
        : null,
      activeFilters: activeFilters
        .filter(f => f.values?.length > 0)
        .map(f => `${f.filterId}:${[...f.values].sort().join(',')}`)
        .sort()
        .join('|') || null,
    };

    return ['metricData', widgetId, configKey, filtersKey, dateField, fullscreenDimension, isFullscreen];
  },

  /** 指标配置（聚合函数、操作符） */
  metricConfig: () => ['metricConfig'],

  // 数据库相关
  dbTables: () => ['dbTables'],
  dbTableColumns: (tableName, schema = 'public') => ['dbTableColumns', tableName, schema],

  // 筛选器相关
  filterValues: (fieldName) => ['filterValues', fieldName],

  // 图表查询
  widgetQuery: (widgetId, config, filters) => ['widgetQuery', widgetId, config, filters],

  // 图表的可选维度列
  widgetColumns: (metricIds) => ['widgetColumns', [...metricIds].sort((a, b) => a - b)],

  // 系统状态
  systemStatus: () => ['systemStatus'],

  // 同期群分析
  cohortAnalysis: (config) => ['cohort', 'analysis', config],
  cohortTemplates: () => ['cohort', 'templates'],
  cohortTemplate: (id) => ['cohort', 'templates', id],
};
