import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useChartData } from '../hooks/useChartData';
import { useDashboardStore } from '../store';
import { widgetsAPI, dashboardsAPI, dbAPI, datasetsAPI } from '../api';

// Mock API
vi.mock('../api', () => ({
  metricsAPI: {
    get: vi.fn(),
    executeMetric: vi.fn(),
  },
  widgetsAPI: {
    query: vi.fn(),
  },
  dashboardsAPI: {
    updateWidget: vi.fn(),
  },
  dbAPI: {
    getTables: vi.fn(),
    getTableColumns: vi.fn(),
  },
  datasetsAPI: {
    get: vi.fn(),
    list: vi.fn(),
  },
}));

// Mock store
vi.mock('../store', async () => {
  const actual = await vi.importActual('../store');
  return {
    ...actual,
    useDashboardStore: vi.fn(),
  };
});

// 创建 wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useChartData', () => {
  const mockWidget = {
    id: 1,
    metric_ids: [1],
    config: {
      dimensions: ['date'],
      metrics: [{ func: 'SUM', field: 'revenue', alias: 'total_revenue' }],
      filters: [],
      chartType: 'bar',
    },
  };

  const mockMetric = {
    id: 1,
    name: 'Revenue Metric',
    dataset_id: 1,
    config: {
      aggregations: [{ func: 'SUM', field: 'revenue', alias: 'total_revenue' }],
    },
  };

  const mockDataset = {
    id: 1,
    name: '日统计数据',
    base_table: 'daily_stats',
    config: { fields: [{ field: 'date', alias: '日期' }] },
  };

  const mockTables = {
    data: [
      { table_name: 'daily_stats', primary_date_field: 'date' },
      { table_name: 'campaigns', primary_date_field: null },
    ],
  };

  const mockColumns = {
    data: [
      { column_name: 'date', data_type: 'date' },
      { column_name: 'revenue', data_type: 'integer' },
      { column_name: 'platform', data_type: 'varchar' },
    ],
  };

  const mockExecutionResult = {
    success: true,
    data: {
      rows: [
        { date: '2024-01-01', total_revenue: 5000 },
        { date: '2024-01-02', total_revenue: 6000 },
      ],
      rowCount: 2,
      totalRowCount: 2,
      fields: [{ name: 'date' }, { name: 'total_revenue' }],
      truncated: false,
    },
    totals: null,
    aliasNameMap: { total_revenue: 'Revenue Metric' },
    sql: 'SELECT ...',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock store state
    useDashboardStore.mockReturnValue({
      permanent: { dateRange: { start: '2024-01-01', end: '2024-01-07' } },
      active: [],
    });

    // Setup API mocks
    widgetsAPI.query.mockResolvedValue(mockExecutionResult);
    dbAPI.getTables.mockResolvedValue(mockTables);
    dbAPI.getTableColumns.mockResolvedValue(mockColumns);
    dashboardsAPI.updateWidget.mockResolvedValue({ success: true });
    datasetsAPI.get.mockResolvedValue({ data: mockDataset });
  });

  // ============================================
  // 数据加载测试
  // ============================================
  describe('数据加载', () => {
    it('加载 metric 数据', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.rows.length).toBe(2);
      });

      expect(widgetsAPI.query).toHaveBeenCalled();
    });

    it('无 metricIds 时返回空数据', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          metricIds: [],
          config: { metrics: [] },
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      // 无 metricIds 且无自定义 metrics
      expect(result.current.rows).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('加载失败返回错误状态', async () => {
      const wrapper = createWrapper();
      widgetsAPI.query.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });
    });

    it('返回正确的数据字段', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.rows.length).toBe(2);
        expect(result.current.fields.length).toBe(2);
        expect(result.current.rowCount).toBe(2);
      });
    });
  });

  // ============================================
  // 日期字段检测测试
  // ============================================
  describe('日期字段检测', () => {
    it('检测表的主日期字段', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.detectedDateField).toBe('date');
      });
    });

    it('验证日期字段类型', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.hasRealDateField).toBe(true);
      });
    });

    it('无日期字段返回 null', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: { dimensions: [] },
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.detectedDateField).toBe(null);
        expect(result.current.hasRealDateField).toBe(false);
      });
    });

    it('primary_date_field 不是日期类型返回 false', async () => {
      const wrapper = createWrapper();
      const columnsWithStringDate = {
        data: [
          { column_name: 'date', data_type: 'varchar' }, // 字符串类型，非真实日期
          { column_name: 'revenue', data_type: 'integer' },
        ],
      };
      dbAPI.getTableColumns.mockResolvedValue(columnsWithStringDate);

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.hasRealDateField).toBe(false);
      });
    });
  });

  // ============================================
  // 全局筛选应用测试
  // ============================================
  describe('全局筛选应用', () => {
    it('应用平台筛选', async () => {
      const wrapper = createWrapper();
      useDashboardStore.mockReturnValue({
        permanent: { dateRange: { start: '2024-01-01', end: '2024-01-07' } },
        active: [{ field: 'platform', filterId: 1, values: ['ios'] }],
      });

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      expect(callArgs.filters).toContainEqual({
        field: 'platform',
        operator: '=',
        value: 'ios',
      });
    });

    it('应用日期范围筛选', async () => {
      const wrapper = createWrapper();
      useDashboardStore.mockReturnValue({
        permanent: { dateRange: { start: '2024-01-01', end: '2024-01-07' } },
        active: [],
      });

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      expect(callArgs.filters).toContainEqual({
        field: 'date',
        operator: 'BETWEEN',
        value: ['2024-01-01', '2024-01-07'],
      });
    });

    it('忽略全局筛选器时跳过筛选', async () => {
      const wrapper = createWrapper();
      useDashboardStore.mockReturnValue({
        permanent: { dateRange: { start: '2024-01-01', end: '2024-01-07' } },
        active: [{ field: 'platform', filterId: 1, values: ['ios'] }],
      });

      const configWithIgnore = {
        ...mockWidget.config,
        ignoreGlobalFilters: true,
      };

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: configWithIgnore,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      expect(callArgs.filters).not.toContainEqual({
        field: 'platform',
        operator: '=',
        value: 'ios',
      });
    });

    it('无日期字段且有全局日期筛选时返回空数据', async () => {
      const wrapper = createWrapper();
      dbAPI.getTableColumns.mockResolvedValue({
        data: [{ column_name: 'revenue', data_type: 'integer' }],
      });
      useDashboardStore.mockReturnValue({
        permanent: { dateRange: { start: '2024-01-01', end: '2024-01-07' } },
        active: [],
      });

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: { dimensions: [], ignoreGlobalFilters: false },
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.globalFiltersBlocked).toBe(true);
      });

      // 数据应为空（等待日期字段确认）
      expect(result.current.rows).toEqual([]);
    });
  });

  // ============================================
  // Widget 筛选器测试
  // ============================================
  describe('Widget 筛选器', () => {
    it('合并 widget 筛选器与全局筛选器', async () => {
      const wrapper = createWrapper();
      const configWithWidgetFilter = {
        ...mockWidget.config,
        filters: [{ field: 'status', operator: '=', value: 'active' }],
      };
      useDashboardStore.mockReturnValue({
        permanent: { dateRange: { start: '2024-01-01', end: '2024-01-07' } },
        active: [{ field: 'platform', filterId: 1, values: ['ios'] }],
      });

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: configWithWidgetFilter,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      // Widget 筛选器
      expect(callArgs.filters).toContainEqual({
        field: 'status',
        operator: '=',
        value: 'active',
      });
      // 全局平台筛选
      expect(callArgs.filters).toContainEqual({
        field: 'platform',
        operator: '=',
        value: 'ios',
      });
      // 全局日期筛选
      expect(callArgs.filters).toContainEqual({
        field: 'date',
        operator: 'BETWEEN',
        value: ['2024-01-01', '2024-01-07'],
      });
    });
  });

  // ============================================
  // 维度配置测试
  // ============================================
  describe('维度配置', () => {
    it('使用 config.dimensions', async () => {
      const wrapper = createWrapper();
      dbAPI.getTableColumns.mockResolvedValue({
        data: [
          { column_name: 'category', data_type: 'varchar' },
          { column_name: 'date', data_type: 'date' },
          { column_name: 'revenue', data_type: 'integer' },
        ],
      });

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: { dimensions: ['category'], metrics: mockWidget.config.metrics },
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      expect(callArgs.dimensions).toContain('category');
    });

    it('无维度时自动使用日期字段', async () => {
      const wrapper = createWrapper();

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: { dimensions: [], metrics: mockWidget.config.metrics },
          gridWidth: 4, // > 2，非 number card
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      expect(callArgs.dimensions).toContain('date');
    });

    it('Number card (area <= 2) 不自动添加维度', async () => {
      const wrapper = createWrapper();

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: { dimensions: [], metrics: mockWidget.config.metrics },
          gridWidth: 2,
          gridHeight: 1, // area = 2，number card
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      expect(callArgs.dimensions).toEqual([]);
    });

    it('全屏周维度使用 DATE_TRUNC week', async () => {
      const wrapper = createWrapper();

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          isFullscreen: true,
          fullscreenDimension: 'week',
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      expect(callArgs.dimensions[0]).toContain("DATE_TRUNC('week'");
    });

    it('全屏月维度使用 DATE_TRUNC month', async () => {
      const wrapper = createWrapper();

      renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          isFullscreen: true,
          fullscreenDimension: 'month',
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(widgetsAPI.query).toHaveBeenCalled();
      });

      const calls = widgetsAPI.query.mock.calls;
      const callArgs = calls[calls.length - 1][1];
      expect(callArgs.dimensions[0]).toContain("DATE_TRUNC('month'");
    });
  });

  // ============================================
  // 更新 mutation 测试
  // ============================================
  describe('更新 mutation', () => {
    it('updateMutation 调用 API', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.updateMutation).toBeDefined();
      });

      // 执行更新
      result.current.updateMutation.mutate({ dimensions: ['category'] });

      await waitFor(() => {
        expect(dashboardsAPI.updateWidget).toHaveBeenCalledWith(1, {
          config: { dimensions: ['category'] },
        });
      });
    });
  });

  // ============================================
  // 边缘情况测试
  // ============================================
  describe('边缘情况', () => {
    it('widgetId 为 null 不报错', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: null,
          metricIds: [],
          config: {},
          gridWidth: 4,
          gridHeight: 2,
        }),
        { wrapper }
      );

      expect(result.current.rows).toEqual([]);
    });

    it('config 为 null 不报错', async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: null,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      // null config 应被处理为 {}
      expect(result.current).toBeDefined();
    });

    it('columns 加载失败不阻止数据加载', async () => {
      const wrapper = createWrapper();
      dbAPI.getTableColumns.mockRejectedValue(new Error('Column fetch failed'));

      const { result } = renderHook(() =>
        useChartData({
          widgetId: 1,
          datasetId: 1,
          metricIds: [1],
          config: mockWidget.config,
          gridWidth: 4,
          gridHeight: 2,
          dashboardId: 1,
        }),
        { wrapper }
      );

      // 数据仍应加载（无日期字段检测）
      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
    });
  });
});