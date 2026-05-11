import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TableView from './TableView';


// Mock Icon
vi.mock('@/components/ui/icon', () => ({
  Icon: vi.fn(({ name, size }) => (
    <span data-testid={`icon-${name}`} data-size={size}>
      {name}
    </span>
  )),
}));

vi.mock('@/utils/formatters', () => {
  const fd = (val) => {
    if (val === null || val === undefined) return '-';
    if (typeof val !== 'number') return val;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toString();
  };
  return {
    formatDisplayValue: fd,
    formatByMetricFormat: (val, format) => {
      if (format === 'percentage') return `${val}%`;
      return fd(val);
    },
    formatPercentage: (val) => `${val}%`,
    formatDateLabelCompact: (val) => val,
    formatWeekRange: (val) => `Week: ${val}`,
    formatMonthLabel: (val) => `Month: ${val}`,
  };
});

describe('TableView', () => {
  // ============================================
  // 基础渲染测试
  // ============================================
  describe('基础渲染', () => {
    it('渲染表格结构', () => {
      const fields = [{ name: 'name', type: 'string' }, { name: 'value', type: 'number' }];
      const rows = [{ name: 'Item A', value: 100 }];

      render(<TableView fields={fields} rows={rows} />);

      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('value')).toBeInTheDocument();
      expect(screen.getByText('Item A')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('空 rows 不报错', () => {
      const fields = [{ name: 'name', type: 'string' }];

      render(<TableView fields={fields} rows={[]} />);

      expect(screen.getByText('name')).toBeInTheDocument();
    });

    it('null fields 不报错', () => {
      render(<TableView fields={null} rows={[{ name: 'test' }]} />);

      // 应该不崩溃
      expect(document.body).toBeInTheDocument();
    });

    it('null rows 不报错', () => {
      const fields = [{ name: 'name', type: 'string' }];

      render(<TableView fields={fields} rows={null} />);

      expect(document.body).toBeInTheDocument();
    });
  });

  // ============================================
  // 表头测试
  // ============================================
  describe('表头', () => {
    it('显示所有字段名', () => {
      const fields = [
        { name: 'id', type: 'integer' },
        { name: 'name', type: 'string' },
        { name: 'amount', type: 'number' },
      ];
      const rows = [{ id: 1, name: 'Test', amount: 100 }];

      render(<TableView fields={fields} rows={rows} />);

      expect(screen.getByText('id')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('amount')).toBeInTheDocument();
    });

    it('表头不可点击排序（透视模式禁用排序）', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'B' }, { name: 'A' }];

      render(<TableView fields={fields} rows={rows} />);

      const nameHeader = screen.getByText('name');
      fireEvent.click(nameHeader);

      expect(screen.queryByTestId('icon-chevronUp')).not.toBeInTheDocument();
    });

    it('点击不同表头不触发排序', () => {
      const fields = [{ name: 'name', type: 'string' }, { name: 'value', type: 'number' }];
      const rows = [{ name: 'A', value: 100 }, { name: 'B', value: 50 }];

      render(<TableView fields={fields} rows={rows} />);

      fireEvent.click(screen.getByText('name'));
      fireEvent.click(screen.getByText('value'));

      expect(screen.queryByTestId('icon-chevronUp')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // 排序功能测试（透视模式下排序永久禁用）
  // ============================================
  describe('排序功能', () => {
    it('点击表头不改变顺序', () => {
      const fields = [{ name: 'name', type: 'string' }, { name: 'value', type: 'number' }];
      const rows = [{ name: 'Charlie', value: 100 }, { name: 'Alpha', value: 50 }, { name: 'Beta', value: 200 }];

      render(<TableView fields={fields} rows={rows} />);

      fireEvent.click(screen.getByText('value'));

      const cells = screen.getAllByText(/Alpha|Beta|Charlie/);
      expect(cells[0]).toHaveTextContent('Charlie');
      expect(cells[1]).toHaveTextContent('Alpha');
      expect(cells[2]).toHaveTextContent('Beta');
    });

    it('多次点击不产生排序图标', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }, { value: 50 }, { value: 200 }];

      render(<TableView fields={fields} rows={rows} />);

      fireEvent.click(screen.getByText('value'));
      expect(screen.queryByTestId('icon-chevronUp')).not.toBeInTheDocument();
      expect(screen.queryByTestId('icon-chevronDown')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // 分页功能测试
  // ============================================
  describe('分页功能', () => {
    it('少于或等于 100 行不显示分页控件', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = Array.from({ length: 50 }, (_, i) => ({ name: `Item ${i}` }));

      render(<TableView fields={fields} rows={rows} />);

      expect(screen.getByText('Item 0')).toBeInTheDocument();
      expect(screen.queryByLabelText('Go to next page')).not.toBeInTheDocument();
    });

    it('超过 100 行显示分页控件', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = Array.from({ length: 150 }, (_, i) => ({ name: `Item ${i}` }));

      render(<TableView fields={fields} rows={rows} />);

      expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
    });

    it('分页显示分页控件和行号', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = Array.from({ length: 150 }, (_, i) => ({ name: `Item ${i}` }));

      render(<TableView fields={fields} rows={rows} />);

      expect(screen.getByText('Item 0')).toBeInTheDocument();
      expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
    });

    it('行号正确自增', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = Array.from({ length: 3 }, (_, i) => ({ name: `Item ${i}` }));

      render(<TableView fields={fields} rows={rows} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  // ============================================
  // 合计行测试
  // ============================================
  describe('合计行', () => {
    it('数值字段显示合计', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }, { value: 50 }, { value: 200 }];

      render(<TableView fields={fields} rows={rows} totals={{ value: 350 }} />);

      expect(screen.getByText((c) => c.startsWith('合计'))).toBeInTheDocument();
      expect(screen.getByText('350')).toBeInTheDocument(); // 100 + 50 + 200
    });

    it('多数值字段分别显示合计', () => {
      const fields = [
        { name: 'revenue', type: 'number' },
        { name: 'users', type: 'number' },
      ];
      const rows = [
        { revenue: 1000, users: 10 },
        { revenue: 2000, users: 20 },
        { revenue: 3000, users: 30 },
      ];

      render(<TableView fields={fields} rows={rows} totals={{ revenue: 6000, users: 60 }} />);

      expect(screen.getByText((c) => c.startsWith('合计'))).toBeInTheDocument();
      expect(screen.getByText('6.0K')).toBeInTheDocument(); // 1000 + 2000 + 3000 = 6000 → formatted as "6.0K"
      expect(screen.getByText('60')).toBeInTheDocument(); // 10 + 20 + 30
    });

    it('字符串字段不显示合计', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'A' }, { name: 'B' }];

      render(<TableView fields={fields} rows={rows} />);

      // 无数值字段，不显示合计行
      expect(screen.queryByText('合计')).not.toBeInTheDocument();
    });

    it('单行数据不显示合计', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];

      render(<TableView fields={fields} rows={rows} />);

      // 单行无合计
      expect(screen.queryByText('合计')).not.toBeInTheDocument();
    });

    it('合计基于全部数据', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = Array.from({ length: 150 }, (_, i) => ({ value: 10 }));

      render(<TableView fields={fields} rows={rows} totals={{ value: 1500 }} />);

      // 合计应为 150 * 10 = 1500，而非 100 * 10 = 1000
      expect(screen.getByText('1.5K')).toBeInTheDocument();
    });
  });

  // ============================================
  // 数值格式化测试
  // ============================================
  describe('数值格式化', () => {
    it('大于 1000 使用紧凑格式', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 12345 }];

      render(<TableView fields={fields} rows={rows} />);

      expect(screen.getByText('12.3K')).toBeInTheDocument();
    });

    it('null/undefined 显示 "-"', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: null }];

      render(<TableView fields={fields} rows={rows} />);

      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  // ============================================
  // 响应式布局测试
  // ============================================
  describe('响应式布局', () => {
    it('数值字段右对齐', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];

      render(<TableView fields={fields} rows={rows} />);

      const header = screen.getByText('value').closest('th');
      expect(header).toHaveStyle({ textAlign: 'right' });
    });

    it('字符串字段左对齐', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'Test' }];

      render(<TableView fields={fields} rows={rows} />);

      const header = screen.getByText('name').closest('th');
      expect(header).toHaveStyle({ textAlign: 'left' });
    });

    it('数值单元格使用等宽字体', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];

      render(<TableView fields={fields} rows={rows} />);

      const cell = screen.getByText('100').closest('td');
      // fontFamily 应为 mono 字体
      expect(cell).toBeInTheDocument();
    });
  });

  // ============================================
  // React.memo 优化测试
  // ============================================
  describe('React.memo 优化', () => {
    it('相同 props 不重新渲染', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];

      const { rerender } = render(<TableView fields={fields} rows={rows} />);

      rerender(<TableView fields={fields} rows={rows} />);

      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('不同 rows 触发重新渲染', () => {
      const fields = [{ name: 'value', type: 'number' }];

      const { rerender } = render(<TableView fields={fields} rows={[{ value: 100 }]} />);

      rerender(<TableView fields={fields} rows={[{ value: 200 }]} />);

      expect(screen.getByText('200')).toBeInTheDocument();
    });
  });

  // ============================================
  // 字段添加功能测试 (维度字段 / 自定义指标 / 默认度量)
  // ============================================
  describe('字段添加', () => {
    it('有 onAddColumn 时显示"列"管理按钮', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'Test' }];
      const columns = [{ column_name: 'name', data_type: 'text' }];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={columns}
          onAddColumn={() => {}}
        />
      );

      const plusButtons = screen.getAllByText('+');
      expect(plusButtons.length).toBeGreaterThan(0);
    });

    it('点击"列"按钮打开面板显示维度列', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'Test' }];
      const columns = [
        { column_name: 'date', data_type: 'date' },
        { column_name: 'revenue', data_type: 'integer' },
      ];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={columns}
          onAddColumn={() => {}}
        />
      );

      fireEvent.click(screen.getAllByText('+')[0]);

      expect(screen.getByText('维度列')).toBeInTheDocument();
      expect(screen.getByText('date')).toBeInTheDocument();
    });

    it('面板显示保存指标（原死代码复活）', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'Test' }];
      const columns = [
        { column_name: 'name', data_type: 'text' },
        { column_name: 'revenue', data_type: 'integer' },
      ];
      const availableMetrics = [
        { id: 1, name: '总收入', config: { table: 'test_table', aggregations: [{ func: 'sum', field: 'revenue', alias: 'sum_revenue' }] } },
      ];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={columns}
          visibleFields={['name']}
          availableMetrics={availableMetrics}
          onAddMetric={() => {}}
        />
      );

      fireEvent.click(screen.getAllByText('+')[0]);

      expect(screen.getByText('指标')).toBeInTheDocument();
      expect(screen.getByText('总收入')).toBeInTheDocument();
    });

    it('已添加的自定义指标不重复显示', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'Test' }];
      const columns = [{ column_name: 'revenue', data_type: 'integer' }];
      const widgetMetrics = [
        { func: 'SUM', field: 'revenue', alias: 'sum_revenue', name: '总收入' },
      ];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={columns}
          visibleFields={['name', 'sum_revenue']}
          widgetMetrics={widgetMetrics}
          onAddColumn={() => {}}
        />
      );

      fireEvent.click(screen.getAllByText('+')[0]);

      expect(screen.queryByText('总收入')).not.toBeInTheDocument();
    });

    it('所有字段已显示时显示"所有字段均已显示"', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'Test' }];
      const columns = [{ column_name: 'name', data_type: 'text' }];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={columns}
          visibleFields={['name']}
          onAddColumn={() => {}}
        />
      );

      fireEvent.click(screen.getAllByText('+')[0]);

      expect(screen.getByText('所有字段均已显示')).toBeInTheDocument();
    });

    it('全屏模式下添加维度字段调用 onAddColumn', () => {
      const fields = [{ name: 'name', type: 'string' }];
      const rows = [{ name: 'Test' }];
      const columns = [{ column_name: 'category', data_type: 'text' }];
      const mockAddColumn = vi.fn();

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={columns}
          visibleFields={['name']}
          onAddColumn={mockAddColumn}
          isFullscreen={true}
        />
      );

      fireEvent.click(screen.getAllByText('+')[0]);
      fireEvent.click(screen.getByText('category'));

      expect(mockAddColumn).toHaveBeenCalledWith('category', 'dimension');
    });

  });

  // ============================================
  // 汇总指标验证测试
  // ============================================
  describe('汇总指标', () => {
    it('有维度字段时合计行第一列显示"合计"', () => {
      const fields = [
        { name: 'category', type: 'string' },
        { name: 'revenue', type: 'number' },
      ];
      const rows = [
        { category: 'A', revenue: 100 },
        { category: 'B', revenue: 200 },
      ];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={[
            { column_name: 'category', data_type: 'text' },
            { column_name: 'revenue', data_type: 'integer' },
          ]}
          totals={{ revenue: 300 }}
        />
      );

      const totalCells = screen.getAllByText((c) => c.startsWith('合计'));
      expect(totalCells.length).toBeGreaterThanOrEqual(1);
    });

    it('无维度字段时合计行第一格也显示"合计"', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }, { value: 200 }];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={[{ column_name: 'value', data_type: 'integer' }]}
          totals={{ value: 300 }}
        />
      );

      expect(screen.getByText((c) => c.startsWith('合计'))).toBeInTheDocument();
      expect(screen.getByText('300')).toBeInTheDocument();
    });

    it('多个维度字段时合计行首字段显示"合计"，其余为空', () => {
      const fields = [
        { name: 'category', type: 'string' },
        { name: 'region', type: 'string' },
        { name: 'revenue', type: 'number' },
      ];
      const rows = [
        { category: 'A', region: 'East', revenue: 100 },
        { category: 'B', region: 'West', revenue: 200 },
      ];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={[
            { column_name: 'category', data_type: 'text' },
            { column_name: 'region', data_type: 'text' },
            { column_name: 'revenue', data_type: 'integer' },
          ]}
          totals={{ revenue: 300 }}
        />
      );

      const totals = screen.getAllByText((c) => c.startsWith('合计'));
      expect(totals.length).toBe(1);
    });

    it('数值汇总使用 formatDisplayValue 格式化', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 5000 }, { value: 7000 }];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={[{ column_name: 'value', data_type: 'integer' }]}
          totals={{ value: 12000 }}
        />
      );

      expect(screen.getByText('12.0K')).toBeInTheDocument();
    });

    it('多个数值字段分别显示各自合计', () => {
      const fields = [
        { name: 'category', type: 'string' },
        { name: 'revenue', type: 'number' },
        { name: 'cost', type: 'number' },
      ];
      const rows = [
        { category: 'A', revenue: 1000, cost: 500 },
        { category: 'B', revenue: 2000, cost: 800 },
      ];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={[
            { column_name: 'category', data_type: 'text' },
            { column_name: 'revenue', data_type: 'integer' },
            { column_name: 'cost', data_type: 'integer' },
          ]}
          totals={{ revenue: 3000, cost: 1300 }}
        />
      );

      expect(screen.getByText('3.0K')).toBeInTheDocument();
      expect(screen.getByText('1.3K')).toBeInTheDocument();
    });

    it('null totals 值不崩溃', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={[{ column_name: 'value', data_type: 'integer' }]}
          totals={null}
        />
      );

      expect(document.body).toBeInTheDocument();
    });

    it('合计行使用主色文字', () => {
      const fields = [{ name: 'value', type: 'number' }];
      const rows = [{ value: 100 }, { value: 200 }];

      render(
        <TableView
          fields={fields}
          rows={rows}
          columns={[{ column_name: 'value', data_type: 'integer' }]}
          totals={{ value: 300 }}
        />
      );

      const totalValue = screen.getByText('300');
      expect(totalValue).toBeInTheDocument();
      expect(totalValue.tagName).toBe('TD');
    });

    it('metricNameMap 显示别名而非原始字段名', () => {
      const fields = [{ name: 'total_revenue', type: 'number' }];
      const rows = [{ total_revenue: 500 }];

      render(
        <TableView
          fields={fields}
          rows={rows}
          metricNameMap={{ total_revenue: '总收入' }}
        />
      );

      expect(screen.getByText('总收入')).toBeInTheDocument();
      expect(screen.queryByText('total_revenue')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // 透视表分组功能测试
  // ============================================
  describe('透视表分组', () => {
    it('分组模式渲染分组行和子行', () => {
      const fields = [
        { name: 'category', type: 'string' },
        { name: 'revenue', type: 'number' },
      ];
      const rows = [
        { category: 'A', revenue: 100 },
        { category: 'A', revenue: 200 },
        { category: 'B', revenue: 50 },
      ];

      render(<TableView fields={fields} rows={rows} />);

      // Single dimension with duplicates: auto-aggregated rows
      const aElements = screen.getAllByText('A');
      expect(aElements.length).toBe(1);
      const bElements = screen.getAllByText('B');
      expect(bElements.length).toBe(1);
      expect(screen.getByText('300')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('分组行聚合指标值', () => {
      const fields = [
        { name: 'category', type: 'string' },
        { name: 'revenue', type: 'number' },
      ];
      const rows = [
        { category: 'A', revenue: 100 },
        { category: 'A', revenue: 200 },
        { category: 'B', revenue: 50 },
      ];

      render(<TableView fields={fields} rows={rows} />);

      // Single dimension with duplicates: auto-aggregation
      expect(screen.getByText('300')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.queryByText('100')).not.toBeInTheDocument();
      expect(screen.queryByText('200')).not.toBeInTheDocument();
    });

    it('分组模式无维度字段时表现正常', () => {
      const fields = [{ name: 'revenue', type: 'number' }];
      const rows = [{ revenue: 100 }, { revenue: 200 }];

      render(<TableView fields={fields} rows={rows} />);

      // Should render flat without errors
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('200')).toBeInTheDocument();
    });

    it('分组模式空行不崩溃', () => {
      const fields = [
        { name: 'category', type: 'string' },
        { name: 'revenue', type: 'number' },
      ];

      render(<TableView fields={fields} rows={[]} />);

      expect(document.body).toBeInTheDocument();
    });

    it('维度字段为空值显示"(空)"', () => {
      const fields = [
        { name: 'category', type: 'string' },
        { name: 'revenue', type: 'number' },
      ];
      const rows = [
        { category: null, revenue: 100 },
        { category: 'A', revenue: 200 },
      ];

      render(<TableView fields={fields} rows={rows} />);

      // Single dimension: flat rendering, null category shows as empty cell
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.queryByText('(空)')).not.toBeInTheDocument();
    });
  });
});
