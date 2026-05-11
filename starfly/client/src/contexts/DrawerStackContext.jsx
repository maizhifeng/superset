import React, { createContext, useContext, useState, useCallback } from 'react';

// ============================================================
// 抽屉堆叠上下文 - 管理多层级抽屉的堆叠顺序、偏移量与 z-index
// ============================================================

const DrawerStackContext = createContext(null);

// 各抽屉面板的宽度配置
export const DRAWER_WIDTHS = {
  MAIN: 'min(600px, 40vw)',
  TABLE_PICKER: { width: '25vw', min: 280, max: 400 },
  METRIC_PICKER: { width: '30vw', min: 320, max: 480 },
  DIMENSION_PICKER: { width: '25vw', min: 280, max: 400 },
  DATASET_PICKER: { width: '25vw', min: 280, max: 400 },
  SQL_PREVIEW: { width: '35vw', min: 400, max: 600 },
  FIELD_PICKER: { width: '30vw', min: 320, max: 480 },
  DATA_PREVIEW: { width: '40vw', min: 400, max: 600 },
};

// 各抽屉面板的默认 z-index 层级
const DEFAULT_Z_INDEXES = {
  'dataset-builder-main': 1300,
  'metric-builder-main': 1300,
  'widget-builder-main': 1300,
  'dataset-table-picker': 1302,
  'dataset-field-picker': 1304,
  'dataset-preview': 1306,
  'metric-dataset-picker': 1302,
  'metric-sql-preview': 1304,
  'widget-table-picker': 1302,
  'widget-metric-picker': 1304,
  'widget-dimension-picker': 1306,
};

// 从宽度配置中提取数值（px），用于偏移量计算
function getNumericWidth(widthConfig) {
  if (typeof widthConfig === 'string') {
    const minMatch = widthConfig.match(/min\((\d+)px/);
    return minMatch ? parseInt(minMatch[1]) : 600;
  }
  return widthConfig.min;
}

export function DrawerStackProvider({ children }) {
  const [stack, setStack] = useState([]);

  // 向堆栈推入一个新抽屉（避免重复添加）
  const push = useCallback((id, widthConfig) => {
    setStack(prev => {
      const existingIndex = prev.findIndex(item => item.id === id);
      if (existingIndex >= 0) return prev;
      return [...prev, { id, widthConfig: widthConfig || DRAWER_WIDTHS.MAIN }];
    });
  }, []);

  // 从堆栈中移除指定抽屉
  const pop = useCallback((id) => {
    setStack(prev => prev.filter(item => item.id !== id));
  }, []);

  // 计算指定抽屉的右偏移（子抽屉的宽度折半累加）
  const getOffset = useCallback((id) => {
    const index = stack.findIndex(item => item.id === id);
    if (index < 0) return 0;
    let offset = 0;
    for (let i = index + 1; i < stack.length; i++) {
      const childWidth = getNumericWidth(stack[i].widthConfig);
      offset += childWidth / 2;
    }
    return -offset;
  }, [stack]);

  // 计算指定抽屉的 z-index（根据堆栈深度递增）
  const getZIndex = useCallback((id) => {
    const index = stack.findIndex(item => item.id === id);
    if (index < 0) {
      return DEFAULT_Z_INDEXES[id] || 1300;
    }
    return 1300 + index * 2;
  }, [stack]);

  return (
    <DrawerStackContext.Provider value={{ push, pop, getOffset, getZIndex }}>
      {children}
    </DrawerStackContext.Provider>
  );
}

export function useDrawerStack() {
  const context = useContext(DrawerStackContext);
  if (!context) {
    return { push: () => {}, pop: () => {}, getOffset: () => 0, getZIndex: () => 1300 };
  }
  return context;
}

export default DrawerStackContext;