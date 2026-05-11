import React, { createContext, useContext, useState, useCallback } from 'react';

// ============================================================
// 组件批量数据上下文 - 管理仪表盘组件的批量数据加载与缓存
// ============================================================

const WidgetBatchContext = createContext(null);

export function WidgetBatchProvider({ children }) {
  const [batchData, setBatchData] = useState({});
  const [loadingWidgets, setLoadingWidgets] = useState(new Set());

  // 批量设置组件数据，只更新提供的组件 ID 对应的数据
  const setBatchResults = useCallback((data, widgetIds) => {
    setBatchData(prev => {
      const next = { ...prev };
      for (const id of widgetIds) {
        if (data[id]) {
          next[id] = data[id];
        }
      }
      return next;
    });
  }, []);

  // 将指定组件标记为加载中
  const markLoading = useCallback((widgetIds) => {
    setLoadingWidgets(prev => {
      const next = new Set(prev);
      for (const id of widgetIds) next.add(id);
      return next;
    });
  }, []);

  // 将指定组件标记为加载完成
  const markLoaded = useCallback((widgetIds) => {
    setLoadingWidgets(prev => {
      const next = new Set(prev);
      for (const id of widgetIds) next.delete(id);
      return next;
    });
  }, []);

  // 清空所有批量数据和加载状态
  const clearBatchData = useCallback(() => {
    setBatchData({});
    setLoadingWidgets(new Set());
  }, []);

  return (
    <WidgetBatchContext.Provider value={{ batchData, setBatchResults, loadingWidgets, markLoading, markLoaded, clearBatchData }}>
      {children}
    </WidgetBatchContext.Provider>
  );
}

export function useWidgetBatch() {
  const ctx = useContext(WidgetBatchContext);
  if (!ctx) throw new Error('useWidgetBatch must be used within WidgetBatchProvider');
  return ctx;
}
