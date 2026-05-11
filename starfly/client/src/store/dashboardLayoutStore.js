import { create } from 'zustand';

// ============================================================
// 仪表盘布局 Store
// 类似 Superset 的 dashboardLayout 切片，将布局状态存储在全局 Store 中，
// 组件卸载后依然保持
// ============================================================

/**
 * 仪表盘布局 Store
 * 布局格式：{ dashboardId: LayoutItem[] }
 * LayoutItem: { i: string, x: number, y: number, w: number, h: number }
 */
export const useDashboardLayoutStore = create((set, get) => ({
  // 按 dashboardId 存储的布局
  layouts: {},

  // 每个仪表盘的初始化跟踪
  initialized: {},

  /**
   * 获取指定仪表盘的布局
   * @param {number|string} dashboardId
   */
  getLayout: (dashboardId) => get().layouts[dashboardId] || [],

  /**
   * 设置指定仪表盘的布局
   * @param {number|string} dashboardId
   * @param {Array} layout
   */
  setLayout: (dashboardId, layout) => set((state) => ({
    layouts: { ...state.layouts, [dashboardId]: layout }
  })),

  /**
   * 标记仪表盘布局为已初始化
   * @param {number|string} dashboardId
   * @param {boolean} value
   */
  setInitialized: (dashboardId, value) => set((state) => ({
    initialized: { ...state.initialized, [dashboardId]: value }
  })),

  /**
   * 检查是否已初始化
   * @param {number|string} dashboardId
   */
  isInitialized: (dashboardId) => get().initialized[dashboardId] || false,

  /**
   * 清除指定仪表盘的布局（强制刷新）
   * @param {number|string} dashboardId
   */
  clearLayout: (dashboardId) => set((state) => ({
    layouts: { ...state.layouts, [dashboardId]: [] },
    initialized: { ...state.initialized, [dashboardId]: false }
  })),

  /**
   * 更新单个组件的布局项
   * @param {number|string} dashboardId
   * @param {number|string} widgetId
   * @param {object} updates - 要更新的布局属性
   */
  updateLayoutItem: (dashboardId, widgetId, updates) => set((state) => {
    const currentLayout = state.layouts[dashboardId] || [];
    const newLayout = currentLayout.map(item =>
      item.i === String(widgetId) ? { ...item, ...updates } : item
    );
    return {
      layouts: { ...state.layouts, [dashboardId]: newLayout }
    };
  }),
}));