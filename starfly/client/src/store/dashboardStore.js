import { create } from 'zustand';
import { CANDIDATE_FILTERS } from '../config/filterConfig';

// ============================================================
// 仪表盘状态 Store
// 管理仪表盘列表、组件、编辑模式及全局过滤器
// ============================================================

/**
 * 默认日期范围——简单实现以避免测试中模块加载问题
 * 与 DATE_RANGE_PRESETS 中的"近 7 天"预设一致
 */
const getDefaultDateRangeSimple = () => {
  const format = (d) => d.toISOString().split('T')[0];
  const end = format(new Date());
  const start = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  return { start, end, label: '近7天' };
};

/**
 * 仪表盘状态 Store
 * 管理仪表盘列表、组件、编辑模式和全局过滤器
 *
 * 全局过滤器结构：
 * - permanent: { dateRange } —— 始终有效的固定过滤器
 * - active: [] —— 用户激活的动态临时过滤器
 */
export const useDashboardStore = create((set, get) => ({
  dashboards: [],
  selectedDashboard: null,
  widgets: [],
  editMode: false,

  // 新的全局过滤器结构
  globalFilters: {
    // 永久过滤器——始终生效（日期固定）
    permanent: {
      dateRange: getDefaultDateRangeSimple(),
    },
    // 活动临时过滤器——默认启用所有过滤器
    // 结构：{ filterId: string, values: string[], field: string, operator: string }
    active: CANDIDATE_FILTERS.map(f => ({
      filterId: f.id,
      values: [],
      field: f.field,
      operator: f.multiSelect ? 'IN' : '=',
    })),
  },

  setDashboards: (dashboards) => set({ dashboards }),
  setSelectedDashboard: (dashboard) => set({ selectedDashboard: dashboard, widgets: dashboard?.widgets || [] }),
  setWidgets: (widgets) => set({ widgets }),
  setEditMode: (mode) => set({ editMode: mode }),
  toggleEditMode: () => set((state) => ({ editMode: !state.editMode })),

  // ===== 永久过滤器方法 =====

  /**
   * 更新永久过滤器的日期范围
   * @param {object} dateRange - { start: string, end: string }
   */
  setDateRange: (dateRange) => set((state) => ({
    globalFilters: {
      ...state.globalFilters,
      permanent: {
        ...state.globalFilters.permanent,
        dateRange,
      },
    },
  })),

  // ===== 活动临时过滤器方法 =====

  /**
   * 激活一个候选过滤器——添加到活动列表最前面
   * @param {string} filterId - 来自 CANDIDATE_FILTERS 的过滤器 ID
   */
  activateFilter: (filterId) => {
    const config = CANDIDATE_FILTERS.find(f => f.id === filterId);
    if (!config) return;

    // 检查该过滤器是否已激活
    const existing = get().globalFilters.active.find(f => f.filterId === filterId);
    if (existing) return;

    set((state) => ({
      globalFilters: {
        ...state.globalFilters,
        active: [
          // 新过滤器加在最前面，已有过滤器依次右移
          {
            filterId,
            values: [],           // 初始为空，由用户选择
            field: config.field,
            operator: config.multiSelect ? 'IN' : '=',
          },
          ...state.globalFilters.active,
        ],
      },
    }));
  },

  /**
   * 更新过滤器值——支持多选数组
   * @param {string} filterId - 过滤器 ID
   * @param {string[]} values - 选中的值数组
   */
  updateFilterValues: (filterId, values) => {
    set((state) => ({
      globalFilters: {
        ...state.globalFilters,
        active: state.globalFilters.active.map(f =>
          f.filterId === filterId ? { ...f, values } : f
        ),
      },
    }));
  },

  /**
   * 从活动列表中移除过滤器
   * @param {string} filterId - 过滤器 ID
   */
  removeFilter: (filterId) => {
    set((state) => ({
      globalFilters: {
        ...state.globalFilters,
        active: state.globalFilters.active.filter(f => f.filterId !== filterId),
      },
    }));
  },

  // ===== 重置方法 =====

  /**
   * 重置所有过滤器——包括永久和活动过滤器
   */
  resetGlobalFilters: () => {
    set({
      globalFilters: {
        permanent: {
          dateRange: getDefaultDateRangeSimple(),
        },
        active: CANDIDATE_FILTERS.map(f => ({
          filterId: f.id,
          values: [],
          field: f.field,
          operator: f.multiSelect ? 'IN' : '=',
        })),
      },
    });
  },

  /**
   * 旧版方法——后向兼容
   * 映射到新结构以便逐步迁移
   */
  setGlobalFilters: (filters) => {
    set((state) => {
      const newState = { ...state.globalFilters };

      // 处理旧版平台过滤器
      if (filters.platform !== undefined) {
        const existingPlatform = newState.active.find(f => f.filterId === 'platform');
        if (filters.platform === '') {
          // 空平台值——从活动列表中移除
          newState.active = newState.active.filter(f => f.filterId !== 'platform');
        } else if (existingPlatform) {
          // 更新已有平台过滤器
          newState.active = newState.active.map(f =>
            f.filterId === 'platform' ? { ...f, values: [filters.platform] } : f
          );
        } else {
          // 新增平台过滤器
          newState.active.push({
            filterId: 'platform',
            values: [filters.platform],
            field: 'platform',
            operator: '=',
          });
        }
      }

      // 处理旧版日期范围过滤器
      if (filters.dateRange) {
        newState.permanent = {
          ...newState.permanent,
          dateRange: filters.dateRange,
        };
      }

      return { globalFilters: newState };
    });
  },
}));