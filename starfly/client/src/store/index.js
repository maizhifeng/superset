// ============================================================
// Zustand Store 导出入口
// 所有状态存储的集中导出点
// ============================================================

/**
 * 各 Store 按领域组织：
 * - dbStore: 数据库连接状态
 * - metricStore: 指标管理
 * - datasetStore: 数据集管理
 * - dashboardStore: 仪表盘与组件
 * - dashboardLayoutStore: 布局网格状态（跨导航保持）
 * - operationLogStore: 统一的回收站 + 草稿（主要实现）
 * - trashStore: operationLogStore 的后向兼容适配器
 */

// 领域 Store
export { useDBStore } from './dbStore';
export { useMetricStore } from './metricStore';
export { useDatasetStore } from './datasetStore';
export { useDashboardStore } from './dashboardStore';
export { useDashboardLayoutStore } from './dashboardLayoutStore';

// 操作日志（回收站 + 草稿）
export { useOperationLogStore } from './operationLogStore';

// 后向兼容
export { useTrashStore } from './trashStore';

// 同组分析
export { useCohortStore } from './cohortStore';