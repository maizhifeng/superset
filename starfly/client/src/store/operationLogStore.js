import { create } from 'zustand';
import { getDefaultDateRange } from '@/utils/formatters';

// ============================================================
// 操作日志 Store（回收站 + 草稿）
// 统一管理已删除项和草稿项的存储、过期与检索
// ============================================================

// ============================================
// 存储键名与常量
// ============================================
const DELETED_STORAGE_KEY = 'starfly_deleted_items';
const DRAFT_STORAGE_KEY = 'starfly_draft_items';
const MAX_DELETED_ITEMS = 50;
const EXPIRY_DAYS = 7;

// ============================================
// 实体类型配置
// ============================================
const ENTITY_CONFIG = {
  widget: { icon: 'chart', name: '图表' },
  dashboard: { icon: 'dashboard', name: '仪表盘' },
  dataset: { icon: 'database', name: '数据集' },
  metric: { icon: 'barChart3', name: '指标' },
};

// ============================================
// 存储辅助函数
// ============================================
const loadDeletedFromStorage = () => {
  try {
    const stored = localStorage.getItem(DELETED_STORAGE_KEY);
    if (stored) {
      const items = JSON.parse(stored);
      const now = new Date();
      return items.filter(item => {
        if (!item.expiresAt) return true;
        return new Date(item.expiresAt) > now;
      });
    }
  } catch (e) {
    console.warn('Failed to load deleted items:', e);
  }
  return [];
};

const loadDraftsFromStorage = () => {
  try {
    const stored = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load drafts:', e);
  }
  return [];
};

const saveDeletedToStorage = (items) => {
  try {
    const trimmed = items.slice(-MAX_DELETED_ITEMS);
    localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Failed to save deleted items:', e);
  }
};

const saveDraftsToStorage = (items) => {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('Failed to save drafts:', e);
  }
};

/**
 * 操作日志 Store（回收站 + 草稿）
 *
 * 数据结构：
 * {
 *   id: `${entityType}-${entityId}-${timestamp}`,
 *   status: 'deleted' | 'draft',
 *   entityType: 'widget' | 'dashboard' | 'dataset' | 'metric',
 *   entityId: number | 'new',
 *   name: string,
 *   data: object,
 *   context: { dashboardId, dashboardName } | null,
 *   createdAt: ISO8601,
 *   expiresAt: ISO8601 | null
 * }
 */
export const useOperationLogStore = create((set, get) => ({
  // 合并已删除项和草稿项
  items: [...loadDeletedFromStorage(), ...loadDraftsFromStorage()],

  /**
   * 添加已删除项
   * @param {string} entityType - 实体类型
   * @param {number} entityId - 实体 ID
   * @param {string} name - 实体名称
   * @param {object} data - 实体数据
   * @param {object|null} context - 上下文信息（仪表盘 ID 和名称）
   * @returns {string} 新项 ID
   */
  addDeleted: (entityType, entityId, name, data, context = null) => {
    const item = {
      id: `${entityType}-${entityId}-${Date.now()}`,
      status: 'deleted',
      entityType,
      entityId,
      name,
      data,
      context,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };
    set(state => {
      const deletedItems = state.items.filter(i => i.status === 'deleted');
      const draftItems = state.items.filter(i => i.status === 'draft');
      const newDeletedItems = [...deletedItems, item];
      saveDeletedToStorage(newDeletedItems);
      return { items: [...newDeletedItems, ...draftItems] };
    });
    return item.id;
  },

  /**
   * 添加或更新草稿项
   * @param {string} entityType - 实体类型
   * @param {number|string} entityId - 实体 ID（'new' 表示新建）
   * @param {string} name - 草稿名称
   * @param {object} data - 草稿数据
   * @param {object|null} context - 上下文信息
   * @returns {string} 草稿项 ID
   */
  addDraft: (entityType, entityId, name, data, context = null) => {
    // 查找已有草稿
    const existingIndex = get().items.findIndex(
      item => item.status === 'draft' &&
              item.entityType === entityType &&
              item.entityId === entityId &&
              (context ? item.context?.dashboardId === context.dashboardId : true)
    );

    const item = {
      id: existingIndex >= 0
        ? get().items[existingIndex].id
        : `${entityType}-${entityId}-${Date.now()}`,
      status: 'draft',
      entityType,
      entityId,
      name: name || '未命名草稿',
      data,
      context,
      createdAt: existingIndex >= 0
        ? get().items[existingIndex].createdAt
        : new Date().toISOString(),
      expiresAt: null,
    };

    set(state => {
      const deletedItems = state.items.filter(i => i.status === 'deleted');
      let draftItems = state.items.filter(i => i.status === 'draft');

      if (existingIndex >= 0) {
        draftItems = draftItems.map(d => d.id === item.id ? item : d);
      } else {
        draftItems = [...draftItems, item];
      }

      saveDraftsToStorage(draftItems);
      return { items: [...deletedItems, ...draftItems] };
    });
    return item.id;
  },

  /**
   * 移除单个项
   * @param {string} itemId
   */
  remove: (itemId) => set(state => {
    const deletedItems = state.items.filter(i => i.status === 'deleted' && i.id !== itemId);
    const draftItems = state.items.filter(i => i.status === 'draft' && i.id !== itemId);
    saveDeletedToStorage(deletedItems);
    saveDraftsToStorage(draftItems);
    return { items: [...deletedItems, ...draftItems] };
  }),

  /**
   * 按类型清除项
   * @param {string} status - 'deleted' | 'draft'
   * @param {string|null} entityType
   */
  clearByType: (status, entityType = null) => set(state => {
    if (status === 'deleted') {
      const deletedItems = state.items.filter(i =>
        i.status === 'deleted' && (entityType ? i.entityType !== entityType : false)
      );
      const draftItems = state.items.filter(i => i.status === 'draft');
      if (!entityType) {
        saveDeletedToStorage([]);
        return { items: draftItems };
      }
      saveDeletedToStorage(deletedItems);
      return { items: [...deletedItems, ...draftItems] };
    } else if (status === 'draft') {
      const deletedItems = state.items.filter(i => i.status === 'deleted');
      const draftItems = state.items.filter(i =>
        i.status === 'draft' && (entityType ? i.entityType !== entityType : false)
      );
      if (!entityType) {
        saveDraftsToStorage([]);
        return { items: deletedItems };
      }
      saveDraftsToStorage(draftItems);
      return { items: [...deletedItems, ...draftItems] };
    }
    return state;
  }),

  /**
   * 清除所有项
   */
  clearAll: () => {
    localStorage.removeItem(DELETED_STORAGE_KEY);
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    set({ items: [] });
  },

  /**
   * 按状态筛选
   */
  getByStatus: (status) => get().items.filter(item => item.status === status),

  /**
   * 按实体类型筛选
   */
  getByType: (entityType) => get().items.filter(item => item.entityType === entityType),

  /**
   * 按仪表盘筛选
   */
  getByDashboard: (dashboardId) => get().items.filter(
    item => item.context?.dashboardId === dashboardId || !item.context
  ),

  /**
   * 获取项计数
   * @param {string|null} status
   * @param {string|null} entityType
   */
  getCount: (status = null, entityType = null) => {
    return get().items.filter(item => {
      if (status && item.status !== status) return false;
      if (entityType && item.entityType !== entityType) return false;
      return true;
    }).length;
  },

  /**
   * 获取实体类型配置
   * @param {string} entityType
   */
  getEntityConfig: (entityType) => ENTITY_CONFIG[entityType],

  /**
   * 获取指定实体的草稿
   * @param {string} entityType
   * @param {number|string} entityId
   * @param {object|null} context
   */
  getDraftFor: (entityType, entityId, context = null) => {
    return get().items.find(item =>
      item.status === 'draft' &&
      item.entityType === entityType &&
      (entityId === 'new' || item.entityId === entityId) &&
      (context ? item.context?.dashboardId === context.dashboardId : true)
    );
  },

  /**
   * 检查是否存在未保存的草稿
   */
  hasDrafts: () => get().items.some(item => item.status === 'draft'),
}));