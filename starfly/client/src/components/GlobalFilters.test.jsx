import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import GlobalFilters from './GlobalFilters';
import { PermanentDateFilter } from './GlobalFilters/PermanentDateFilter';
import { ActiveFilterZone } from './GlobalFilters/ActiveFilterZone';
import { CandidateFilterChip } from './GlobalFilters/CandidateFilterChip';
import { useDashboardStore } from '../store';

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});
const TestWrapper = ({ children }) => (
  <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
);

const renderWithProviders = (ui, options) =>
  render(ui, { wrapper: TestWrapper, ...options });

vi.mock('dayjs', () => ({
  default: vi.fn((date) => ({
    format: vi.fn((fmt) => {
      if (date instanceof Date) {
        return date.toISOString().split('T')[0];
      }
      if (typeof date === 'string') return date;
      return '2024-01-15';
    }),
    isSame: vi.fn(() => false),
  })),
}));

vi.mock('@mui/x-date-pickers/DateCalendar', () => ({
  DateCalendar: vi.fn(({ value, onChange }) => (
    <input data-testid="date-picker" type="date" defaultValue="2024-01-15" onChange={(e) => {
      onChange(e.target.value);
    }} />
  )),
}));

vi.mock('@/utils/formatters', () => ({
  DATE_RANGE_PRESETS: [
    {
      label: '今天',
      getValue: () => {
        const today = '2024-01-15';
        return { start: today, end: today };
      },
    },
    {
      label: '昨天',
      getValue: () => {
        return { start: '2024-01-14', end: '2024-01-14' };
      },
    },
    {
      label: '近7天',
      getValue: () => {
        return { start: '2024-01-08', end: '2024-01-14' };
      },
    },
    {
      label: '近30天',
      getValue: () => {
        return { start: '2023-12-16', end: '2024-01-14' };
      },
    },
    {
      label: '本月',
      getValue: () => {
        return { start: '2024-01-01', end: '2024-01-15' };
      },
    },
    {
      label: '上月',
      getValue: () => {
        return { start: '2023-12-01', end: '2023-12-31' };
      },
    },
  ],
}));

vi.mock('@/components/ui/icon', () => ({
  Icon: vi.fn(({ name }) => <span data-testid={`icon-${name}`}>{name}</span>),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual('@/api');
  return {
    ...actual,
    filtersAPI: {
      getValues: vi.fn().mockResolvedValue({ success: true, values: [] }),
    },
  };
});

describe('GlobalFilters', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      globalFilters: {
        permanent: {
          dateRange: { start: '2024-01-08', end: '2024-01-14', label: '近7天' },
        },
        active: [],
      },
    });
    vi.clearAllMocks();
  });

  describe('基础渲染', () => {
    it('渲染时间筛选下拉框', () => {
      renderWithProviders(<GlobalFilters />);
      expect(screen.getByLabelText('时间')).toBeInTheDocument();
    });

    it('渲染固定和重置按钮图标', () => {
      renderWithProviders(<GlobalFilters />);
      expect(screen.getByTestId('icon-pin')).toBeInTheDocument();
      expect(screen.getByTestId('icon-undo')).toBeInTheDocument();
    });
  });

  describe('常驻日期筛选', () => {
    it('默认显示近7天', () => {
      renderWithProviders(<GlobalFilters />);
      expect(screen.getByText('近7天')).toBeInTheDocument();
    });

    it('选择自定义显示日历', () => {
      renderWithProviders(<GlobalFilters />);
      const select = screen.getByLabelText('时间');
      fireEvent.mouseDown(select);
      const customOption = screen.getByText('自定义');
      fireEvent.click(customOption);
      const datePickers = screen.getAllByTestId('date-picker');
      expect(datePickers.length).toBe(2);
    });

    it('修改开始日期更新 store', () => {
      renderWithProviders(<GlobalFilters />);
      const select = screen.getByLabelText('时间');
      fireEvent.mouseDown(select);
      fireEvent.click(screen.getByText('自定义'));
      const datePickers = screen.getAllByTestId('date-picker');
      fireEvent.change(datePickers[0], { target: { value: '2024-01-01' } });
      const state = useDashboardStore.getState();
      expect(state.globalFilters.permanent.dateRange.start).toBe('2024-01-01');
    });

    it('修改结束日期更新 store', () => {
      renderWithProviders(<GlobalFilters />);
      const select = screen.getByLabelText('时间');
      fireEvent.mouseDown(select);
      fireEvent.click(screen.getByText('自定义'));
      const datePickers = screen.getAllByTestId('date-picker');
      fireEvent.change(datePickers[1], { target: { value: '2024-01-31' } });
      const state = useDashboardStore.getState();
      expect(state.globalFilters.permanent.dateRange.end).toBe('2024-01-31');
    });
  });

  describe('重置功能', () => {
    it('点击重置清空所有临时筛选器', () => {
      useDashboardStore.setState({
        globalFilters: {
          permanent: { dateRange: { start: '2024-01-08', end: '2024-01-14', label: '近7天' } },
          active: [{ filterId: 'platform', values: ['ios'], field: 'platform', operator: '=' }],
        },
      });
      renderWithProviders(<GlobalFilters />);
      const resetButton = screen.getByTestId('icon-undo');
      fireEvent.click(resetButton.closest('button'));
      const state = useDashboardStore.getState();
      expect(state.globalFilters.active.find(f => f.filterId === 'platform')?.values).toEqual([]);
    });

    it('重置后隐藏自定义日期选择器', () => {
      renderWithProviders(<GlobalFilters />);
      const select = screen.getByLabelText('时间');
      fireEvent.mouseDown(select);
      fireEvent.click(screen.getByText('自定义'));
      expect(screen.getAllByTestId('date-picker').length).toBe(2);
      const resetButton = screen.getByTestId('icon-undo');
      fireEvent.click(resetButton.closest('button'));
      expect(screen.queryByTestId('date-picker')).not.toBeInTheDocument();
    });
  });

  describe('边缘情况', () => {
    it('dateRange 为 null 不崩溃', () => {
      useDashboardStore.setState({
        globalFilters: {
          permanent: { dateRange: null },
          active: [],
        },
      });
      renderWithProviders(<GlobalFilters />);
      expect(screen.getByLabelText('时间')).toBeInTheDocument();
    });

    it('permanent.dateRange.start 为空不崩溃', () => {
      useDashboardStore.setState({
        globalFilters: {
          permanent: { dateRange: { start: null, end: '2024-01-14' } },
          active: [],
        },
      });
      renderWithProviders(<GlobalFilters />);
      expect(screen.getByLabelText('时间')).toBeInTheDocument();
    });
  });
});

describe('PermanentDateFilter', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      globalFilters: {
        permanent: { dateRange: { start: '2024-01-08', end: '2024-01-14', label: '近7天' } },
        active: [],
      },
    });
  });

  it('渲染时间筛选标签', () => {
    renderWithProviders(<PermanentDateFilter />);
    expect(screen.getByLabelText('时间')).toBeInTheDocument();
  });

  it('默认选中近7天', () => {
    renderWithProviders(<PermanentDateFilter />);
    expect(screen.getByText('近7天')).toBeInTheDocument();
  });
});

describe('CandidateFilterChip', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      globalFilters: {
        permanent: { dateRange: { start: '2024-01-08', end: '2024-01-14' } },
        active: [],
      },
    });
  });

  it('渲染平台筛选器 chip', () => {
    renderWithProviders(<CandidateFilterChip filterId="platform" />);
    expect(screen.getByText('平台')).toBeInTheDocument();
  });

  it('点击激活筛选器', () => {
    renderWithProviders(<CandidateFilterChip filterId="platform" />);
    fireEvent.click(screen.getByText('平台'));
    const { active } = useDashboardStore.getState().globalFilters;
    expect(active.length).toBe(1);
    expect(active[0].filterId).toBe('platform');
  });

  it('激活后不渲染', () => {
    useDashboardStore.setState({
      globalFilters: {
        permanent: { dateRange: { start: '2024-01-08', end: '2024-01-14' } },
        active: [{ filterId: 'platform', values: [], field: 'platform', operator: 'IN' }],
      },
    });
    renderWithProviders(<CandidateFilterChip filterId="platform" />);
    expect(screen.queryByText('平台')).not.toBeInTheDocument();
  });
});

describe('ActiveFilterZone', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      globalFilters: {
        permanent: { dateRange: { start: '2024-01-08', end: '2024-01-14' } },
        active: [],
      },
    });
  });

  it('空时显示提示文字', () => {
    renderWithProviders(<ActiveFilterZone />);
    expect(screen.getByText('+筛选器')).toBeInTheDocument();
  });

  it('激活筛选器后显示筛选器', () => {
    useDashboardStore.setState({
      globalFilters: {
        permanent: { dateRange: { start: '2024-01-08', end: '2024-01-14' } },
        active: [{ filterId: 'platform', values: [], field: 'platform', operator: 'IN' }],
      },
    });
    renderWithProviders(<ActiveFilterZone />);
    expect(screen.getAllByText('平台').length).toBeGreaterThanOrEqual(1);
  });
});
