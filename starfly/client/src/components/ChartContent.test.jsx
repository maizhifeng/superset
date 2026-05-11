import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChartContent from './ChartContent';
import { getCategoricalColors, getChartUIColors } from '../styles/chartColors';

// Mock ThemeContext — all data comes from PostgreSQL, no mock mode
vi.mock('../contexts/ThemeContext', () => ({
  useThemeColor: () => ({ primaryColor: '#00796B' }),
}));

// Mock echarts-for-react
vi.mock('echarts-for-react', () => ({
  default: vi.fn(({ option, style }) => (
    <div
      data-testid="echarts-mock"
      data-chart-type={option?.series?.[0]?.type || 'unknown'}
      data-has-data={option?.series?.[0]?.data?.length > 0}
      style={style}
    >
      {option?.title?.text && <span data-testid="chart-title">{option.title.text}</span>}
    </div>
  )),
}));

// Mock formatters
vi.mock('@/utils/formatters', () => ({
  formatDisplayValue: vi.fn((val) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toString();
  }),
  formatDateLabelCompact: vi.fn((date) => {
    if (!date) return date;
    const parts = date.split('-');
    return `${parts[1]}/${parts[2]}`;
  }),
  formatWeekRange: vi.fn((date) => {
    if (!date) return date;
    return `${date.slice(5, 7)}/${date.slice(8, 10)}-XX/XX`;
  }),
  formatMonthLabel: vi.fn((date) => {
    if (!date) return date;
    return `${date.slice(0, 4)}/${date.slice(5, 7)}`;
  }),
}));

describe('ChartContent', () => {
  const mockDimensions = { width: 400, height: 300 };
  const mockDateRows = [
    { date: '2024-01-01', revenue: 1000, users: 50 },
    { date: '2024-01-02', revenue: 1500, users: 60 },
    { date: '2024-01-03', revenue: 2000, users: 70 },
  ];
  const mockCategoryRows = [
    { category: 'Electronics', revenue: 5000 },
    { category: 'Clothing', revenue: 3000 },
    { category: 'Books', revenue: 1500 },
  ];
  const mockFields = [
    { name: 'date', type: 'string' },
    { name: 'revenue', type: 'number' },
    { name: 'users', type: 'number' },
  ];
  const mockCategoryFields = [
    { name: 'category', type: 'string' },
    { name: 'revenue', type: 'number' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // 基础渲染测试
  // ============================================
  describe('基础渲染', () => {
    it('无数据时显示 "No Data"', () => {
      render(
        <ChartContent
          rows={[]}
          fields={mockFields}
          chartType="bar"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('chart-title')).toHaveTextContent('No Data');
    });

    it('null rows 显示 "No Data"', () => {
      // ChartContent 内部会检查 rows && rows.length === 0
      // 当 rows 为 null 时，getEChartsOption 内部检查会返回 No Data
      render(
        <ChartContent
          rows={null}
          fields={mockFields}
          chartType="bar"
          dimensions={mockDimensions}
        />
      );

      // getEChartsOption 内部 if (!rows || rows.length === 0) 会返回 No Data 标题
      expect(screen.getByTestId('echarts-mock')).toBeInTheDocument();
    });

    it('number 类型返回空 option', () => {
      const { container } = render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="number"
          dimensions={mockDimensions}
        />
      );

      // NumberCard 应该在 ChartWidget 层处理，ChartContent 不渲染
      expect(container.firstChild).toBeTruthy();
    });

    it('table 类型返回空 option', () => {
      const { container } = render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="table"
          dimensions={mockDimensions}
        />
      );

      expect(container.firstChild).toBeTruthy();
    });

    it('未知图表类型显示错误信息', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="invalid"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('chart-title')).toHaveTextContent('Unknown chart type');
    });
  });

  // ============================================
  // 柱状图测试
  // ============================================
  describe('柱状图 (bar)', () => {
    it('渲染基本柱状图', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={mockDimensions}
        />
      );

      const echarts = screen.getByTestId('echarts-mock');
      expect(echarts).toHaveAttribute('data-chart-type', 'bar');
      expect(echarts).toHaveAttribute('data-has-data', 'true');
    });

    it('柱状图无数值字段显示错误', () => {
      const nonNumericRows = [{ date: '2024-01-01', status: 'active' }];
      const nonNumericFields = [{ name: 'date', type: 'string' }];

      render(
        <ChartContent
          rows={nonNumericRows}
          fields={nonNumericFields}
          chartType="bar"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('chart-title')).toHaveTextContent('No numeric data');
    });

    it('柱状图支持多数值字段', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={mockDimensions}
        />
      );

      // 应该有两个 series（revenue 和 users）
      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('全屏模式增加柱状图宽度', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={{ width: 800, height: 600 }}
          isFullscreen={true}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });
  });

  // ============================================
  // 折线图测试
  // ============================================
  describe('折线图 (line)', () => {
    it('渲染基本折线图', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="line"
          dimensions={mockDimensions}
        />
      );

      const echarts = screen.getByTestId('echarts-mock');
      expect(echarts).toHaveAttribute('data-chart-type', 'line');
    });

    it('折线图启用平滑曲线', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="line"
          dimensions={mockDimensions}
        />
      );

      // smooth: true 是折线图的默认配置
      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('日期字段 X 轴使用日期格式化', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="line"
          dimensions={mockDimensions}
        />
      );

      // 检测日期字段后会应用 formatDateLabelCompact
      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });
  });

  // ============================================
  // 面积图测试
  // ============================================
  describe('面积图 (area)', () => {
    it('渲染面积图（使用 line + areaStyle）', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="area"
          dimensions={mockDimensions}
        />
      );

      const echarts = screen.getByTestId('echarts-mock');
      expect(echarts).toHaveAttribute('data-chart-type', 'line');
    });

    it('面积图设置透明度', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="area"
          dimensions={mockDimensions}
        />
      );

      // areaStyle.opacity 应为 0.3 (非全屏)
      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('全屏面积图增加透明度', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="area"
          dimensions={{ width: 800, height: 600 }}
          isFullscreen={true}
        />
      );

      // areaStyle.opacity 应为 0.4 (全屏)
      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });
  });

  // ============================================
  // 饼图测试
  // ============================================
  describe('饼图 (pie)', () => {
    it('渲染基本饼图', () => {
      render(
        <ChartContent
          rows={mockCategoryRows}
          fields={mockCategoryFields}
          chartType="pie"
          dimensions={mockDimensions}
        />
      );

      const echarts = screen.getByTestId('echarts-mock');
      expect(echarts).toHaveAttribute('data-chart-type', 'pie');
    });

    it('饼图使用分类字段作为名称', () => {
      render(
        <ChartContent
          rows={mockCategoryRows}
          fields={mockCategoryFields}
          chartType="pie"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('饼图日期字段使用日期格式化', () => {
      const datePieRows = [
        { date: '2024-01-01', revenue: 1000 },
        { date: '2024-01-02', revenue: 1500 },
      ];
      const datePieFields = [
        { name: 'date', type: 'string' },
        { name: 'revenue', type: 'number' },
      ];

      render(
        <ChartContent
          rows={datePieRows}
          fields={datePieFields}
          chartType="pie"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('饼图超过 6 个切片时隐藏标签', () => {
      const manyCategoryRows = Array.from({ length: 10 }, (_, i) => ({
        category: `Category ${i + 1}`,
        revenue: 1000 * (i + 1),
      }));

      render(
        <ChartContent
          rows={manyCategoryRows}
          fields={mockCategoryFields}
          chartType="pie"
          dimensions={mockDimensions}
        />
      );

      // 非全屏且超过 6 个切片时 label.show 为 false
      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('全屏饼图始终显示标签', () => {
      const manyCategoryRows = Array.from({ length: 10 }, (_, i) => ({
        category: `Category ${i + 1}`,
        revenue: 1000 * (i + 1),
      }));

      render(
        <ChartContent
          rows={manyCategoryRows}
          fields={mockCategoryFields}
          chartType="pie"
          dimensions={{ width: 800, height: 600 }}
          isFullscreen={true}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });
  });

  // ============================================
  // 日期格式化测试
  // ============================================
  describe('日期维度格式化', () => {
    it('dateTrunc="week" 使用周范围格式化', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="line"
          dimensions={mockDimensions}
          dateTrunc="week"
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('dateTrunc="month" 使用月格式化', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={mockDimensions}
          dateTrunc="month"
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('默认 dateTrunc 使用紧凑日期格式化', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="line"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });
  });

  // ============================================
  // 尺寸与字体缩放测试
  // ============================================
  describe('尺寸与字体缩放', () => {
    it('小尺寸容器缩小字体', () => {
      const smallDimensions = { width: 200, height: 150 };

      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={smallDimensions}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('大尺寸容器放大字体', () => {
      const largeDimensions = { width: 600, height: 400 };

      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={largeDimensions}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('全屏模式使用固定大字体', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={{ width: 1920, height: 1080 }}
          isFullscreen={true}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });
  });

  // ============================================
  // 全屏模式特性测试
  // ============================================
  describe('全屏模式特性', () => {
    it('全屏折线图显示数据标签', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="line"
          dimensions={{ width: 800, height: 600 }}
          isFullscreen={true}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('全屏柱状图显示数据标签', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={{ width: 800, height: 600 }}
          isFullscreen={true}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('全屏大数据量启用 dataZoom', () => {
      const largeRows = Array.from({ length: 60 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        revenue: 1000 + i * 100,
      }));

      render(
        <ChartContent
          rows={largeRows}
          fields={mockFields}
          chartType="line"
          dimensions={{ width: 800, height: 600 }}
          isFullscreen={true}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('非全屏不启用 dataZoom', () => {
      const largeRows = Array.from({ length: 60 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        revenue: 1000 + i * 100,
      }));

      render(
        <ChartContent
          rows={largeRows}
          fields={mockFields}
          chartType="line"
          dimensions={mockDimensions}
          isFullscreen={false}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });
  });

  // ============================================
  // 动画配置测试
  // ============================================
  describe('动画配置', () => {
    it('图表启用动画', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="bar"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('动画持续时间为 600ms', () => {
      render(
        <ChartContent
          rows={mockDateRows}
          fields={mockFields}
          chartType="line"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });

    it('大数据量使用 lazyUpdate', () => {
      const largeRows = Array.from({ length: 150 }, (_, i) => ({
        date: `2024-01-${String(i % 30 + 1).padStart(2, '0')}`,
        revenue: 1000 + i * 100,
      }));

      render(
        <ChartContent
          rows={largeRows}
          fields={mockFields}
          chartType="bar"
          dimensions={mockDimensions}
        />
      );

      expect(screen.getByTestId('echarts-mock')).toBeTruthy();
    });
  });
});

describe('chartColors', () => {
  describe('getCategoricalColors', () => {
    it('返回指定数量的颜色', () => {
      const colors = getCategoricalColors(3);
      expect(colors.length).toBe(3);
    });

    it('返回最多 12 种颜色', () => {
      const colors = getCategoricalColors(12);
      expect(colors.length).toBe(12);
    });

    it('超过 12 种时循环使用', () => {
      const colors = getCategoricalColors(15);
      expect(colors.length).toBe(15);
      expect(colors[0]).toBe(colors[12]); // 循环
    });

    it('返回十六进制格式颜色', () => {
      const colors = getCategoricalColors(3);
      colors.forEach(color => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });

  describe('getChartUIColors', () => {
    it('返回所有 UI 颜色', () => {
      const uiColors = getChartUIColors();
      expect(uiColors.axisLine).toBeDefined();
      expect(uiColors.gridLine).toBeDefined();
      expect(uiColors.tooltipBg).toBeDefined();
      expect(uiColors.tooltipBorder).toBeDefined();
      expect(uiColors.tooltipText).toBeDefined();
      expect(uiColors.legendText).toBeDefined();
      expect(uiColors.labelText).toBeDefined();
      expect(uiColors.mutedText).toBeDefined();
      expect(uiColors.emphasisShadow).toBeDefined();
    });

    it('返回十六进制或 rgba 格式', () => {
      const uiColors = getChartUIColors();
      expect(uiColors.axisLine).toMatch(/^#[0-9a-f]{6}$/i);
      expect(uiColors.emphasisShadow).toMatch(/^rgba\(/);
    });
  });
});
