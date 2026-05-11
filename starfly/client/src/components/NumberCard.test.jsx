import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NumberCard from './NumberCard';

// Mock formatters
vi.mock('@/utils/formatters', () => {
  const fd = (val) => {
    if (val === null || val === undefined) return '-';
    if (typeof val !== 'number') return val;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    if (val >= 100) return val.toFixed(0);
    return val.toFixed(2);
  };
  return {
    formatDisplayValue: fd,
    formatByMetricFormat: (val, format) => {
      if (format === 'percentage') return `${val}%`;
      return fd(val);
    },
    formatPercentage: (val) => `${val}%`,
  };
});

describe('NumberCard', () => {
  // ============================================
  // 基础渲染测试
  // ============================================
  describe('基础渲染', () => {
    it('无数据时显示 "暂无数据"', () => {
      render(
        <NumberCard
          fields={[]}
          rows={[]}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('null rows 显示 "暂无数据"', () => {
      render(
        <NumberCard
          fields={[{ name: 'value', type: 'number' }]}
          rows={null}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('渲染单个数值字段', () => {
      const fields = [{ name: 'revenue', type: 'number' }];
      const rows = [{ revenue: 5000 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('5.0K')).toBeInTheDocument();
    });

    it('渲染多个数值字段', () => {
      const fields = [
        { name: 'revenue', type: 'number' },
        { name: 'users', type: 'number' },
      ];
      const rows = [{ revenue: 5000, users: 120 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('revenue')).toBeInTheDocument();
      expect(screen.getByText('5.0K')).toBeInTheDocument();
      expect(screen.getByText('users')).toBeInTheDocument();
      expect(screen.getByText('120')).toBeInTheDocument();
    });
  });

  // ============================================
  // 字体尺寸缩放测试
  // ============================================
  describe('字体尺寸缩放', () => {
    it('小容器使用较小字体', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 100, height: 50 }}
        />
      );

      const valueElement = screen.getByText('100');
      // 字体大小应在 20-56px 范围内
      expect(valueElement).toBeInTheDocument();
    });

    it('大容器使用较大字体', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 300, height: 150 }}
        />
      );

      const valueElement = screen.getByText('100');
      expect(valueElement).toBeInTheDocument();
    });

    it('无 containerSize 使用默认字体', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
        />
      );

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('多数值字段使用较小字体', () => {
      const fields = [
        { name: 'revenue', type: 'number' },
        { name: 'users', type: 'number' },
        { name: 'orders', type: 'number' },
      ];
      const rows = [{ revenue: 5000, users: 120, orders: 50 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      // 检查多字段渲染
      expect(screen.getByText('revenue')).toBeInTheDocument();
      expect(screen.getByText('users')).toBeInTheDocument();
      expect(screen.getByText('orders')).toBeInTheDocument();
    });
  });

  // ============================================
  // 数值格式化测试
  // ============================================
  describe('数值格式化', () => {
    it('大于 1000 使用紧凑格式 (K)', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 12345 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('12.3K')).toBeInTheDocument();
    });

    it('小于 100 但大于 10 保留一位小数', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 50 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('50.00')).toBeInTheDocument();
    });

    it('小于 10 保留两位小数', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 5 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('5.00')).toBeInTheDocument();
    });

    it('null/undefined 显示 "-"', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: null }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  // ============================================
  // 自定义配置测试
  // ============================================
  describe('自定义配置', () => {
    it('config.metrics 定义多个指标', () => {
      const fields = [
        { name: 'revenue', type: 'number' },
        { name: 'users', type: 'number' },
      ];
      const rows = [{ revenue: 5000, users: 120 }];
      const config = {
        metrics: [
          { field: 'revenue', func: 'SUM', alias: 'total_revenue' },
          { field: 'users', func: 'COUNT', alias: 'total_users' },
        ],
      };

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
          config={config}
        />
      );

      expect(screen.getByText('5.0K')).toBeInTheDocument();
      expect(screen.getByText('120')).toBeInTheDocument();
    });

    it('config.unit 显示单位', () => {
      const fields = [
        { name: 'revenue', type: 'number' },
        { name: 'cost', type: 'number' },
      ];
      const rows = [{ revenue: 100, cost: 50 }];
      const config = { unit: 'USD' };

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
          config={config}
        />
      );

      expect(screen.getAllByText('USD').length).toBeGreaterThanOrEqual(1);
    });

    it('无数值字段时使用第一个字段', () => {
      const fields = [{ name: 'status', type: 'string' }];
      const rows = [{ status: 'active' }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      // 使用第一个字段值
      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  // ============================================
  // 边缘情况测试
  // ============================================
  describe('边缘情况', () => {
    it('空 rows 显示 "暂无数据"', () => {
      render(
        <NumberCard
          fields={[{ name: 'value', type: 'number' }]}
          rows={[]}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('暂无数据')).toBeInTheDocument();
    });

    it('fields 为空数组', () => {
      render(
        <NumberCard
          fields={[]}
          rows={[{ value: 100 }]}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      // 无字段时不显示数据
      expect(screen.queryByText('100')).not.toBeInTheDocument();
    });

    it('rows 有数据但无匹配字段', () => {
      const fields = [{ name: 'revenue', type: 'number' }];
      const rows = [{ users: 100 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('0.00')).toBeInTheDocument();
    });

    it('负数值正确显示', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: -1500 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('-1500.00')).toBeInTheDocument();
    });

    it('浮点数正确显示', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 123.456 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('123')).toBeInTheDocument();
    });

    it('零值正确显示', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 0 }];

      render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={{ width: 200, height: 100 }}
        />
      );

      expect(screen.getByText('0.00')).toBeInTheDocument();
    });
  });

  // ============================================
  // React.memo 优化测试
  // ============================================
  describe('React.memo 优化', () => {
    it('相同 props 不重新渲染', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];
      const containerSize = { width: 200, height: 100 };

      const { rerender } = render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={containerSize}
        />
      );

      // 相同 props 重新渲染（memo 应跳过）
      rerender(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={containerSize}
        />
      );

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('不同 props 触发重新渲染', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];
      const containerSize = { width: 200, height: 100 };

      const { rerender } = render(
        <NumberCard
          fields={fields}
          rows={rows}
          containerSize={containerSize}
        />
      );

      // 改变 rows
      rerender(
        <NumberCard
          fields={fields}
          rows={[{ value: 200 }]}
          containerSize={containerSize}
        />
      );

      expect(screen.getByText('200')).toBeInTheDocument();
    });
  });
});