import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatWithSeparator,
  formatCurrency,
  formatPercentage,
  formatSmart,
  formatDisplayValue,
  formatDateShort,
  formatDateWithTime,
  formatDateLabelCompact,
  formatWeekRange,
  formatMonthLabel,
  DATE_RANGE_PRESETS,
  getDefaultDateRange,
} from './formatters';

describe('formatters', () => {
  // ============================================
  // formatNumber 测试
  // ============================================
  describe('formatNumber', () => {
    it('格式化基本数值', () => {
      expect(formatNumber(1234.56)).toBe('1,234.56');
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(-1234.56)).toBe('-1,234.56');
    });

    it('紧凑格式 (K/M/B)', () => {
      expect(formatNumber(1500, { compact: true })).toBe('1.5K');
      expect(formatNumber(1500000, { compact: true })).toBe('1.5M');
      expect(formatNumber(1500000000, { compact: true })).toBe('1.5B');
      expect(formatNumber(-1500, { compact: true })).toBe('-1.5K');
    });

    it('紧凑格式小于 100', () => {
      // 小于 100 时 compact 格式会根据实际值处理
      expect(formatNumber(50, { compact: true })).toBe('50.0');
      expect(formatNumber(5.5, { compact: true })).toBe('5.5');
    });

    it('自定义小数位数', () => {
      expect(formatNumber(1234.5678, { minimumFractionDigits: 2, maximumFractionDigits: 4 })).toBe('1,234.5678');
      expect(formatNumber(1234, { minimumFractionDigits: 2 })).toBe('1,234.00');
    });

    it('null/undefined 返回 "-"', () => {
      expect(formatNumber(null)).toBe('-');
      expect(formatNumber(undefined)).toBe('-');
    });

    it('非数值返回原值', () => {
      expect(formatNumber('string')).toBe('string');
      expect(formatNumber({})).toEqual({});
    });
  });

  // ============================================
  // formatWithSeparator 测试
  // ============================================
  describe('formatWithSeparator', () => {
    it('添加千位分隔符', () => {
      expect(formatWithSeparator(1234567)).toBe('1,234,567');
      expect(formatWithSeparator(1234)).toBe('1,234');
      expect(formatWithSeparator(123)).toBe('123');
    });

    it('处理负数', () => {
      expect(formatWithSeparator(-1234567)).toBe('-1,234,567');
    });

    it('null/undefined 返回 "-"', () => {
      expect(formatWithSeparator(null)).toBe('-');
      expect(formatWithSeparator(undefined)).toBe('-');
    });

    it('非数值返回原值', () => {
      expect(formatWithSeparator('string')).toBe('string');
    });
  });

  // ============================================
  // formatCurrency 测试
  // ============================================
  describe('formatCurrency', () => {
    it('格式化货币（默认 CNY）', () => {
      expect(formatCurrency(1234.56)).toBe('¥1,234.56');
      expect(formatCurrency(0)).toBe('¥0.00');
      expect(formatCurrency(-1234.56)).toBe('-¥1,234.56');
    });

    it('自定义货币代码', () => {
      // zh-CN locale 显示 US$ 而非 $
      expect(formatCurrency(1234.56, 'USD')).toBe('US$1,234.56');
      expect(formatCurrency(1234.56, 'EUR')).toMatch(/€/);
    });

    it('null/undefined 返回 "-"', () => {
      expect(formatCurrency(null)).toBe('-');
      expect(formatCurrency(undefined)).toBe('-');
    });

    it('非数值返回原值', () => {
      expect(formatCurrency('string')).toBe('string');
    });
  });

  // ============================================
  // formatPercentage 测试
  // ============================================
  describe('formatPercentage', () => {
    it('格式化百分比（输入 0-100）', () => {
      expect(formatPercentage(12.5)).toBe('12.5%');
      expect(formatPercentage(0)).toBe('0.0%');
      expect(formatPercentage(100)).toBe('100.0%');
    });

    it('格式化百分比（输入 0-1 比例）', () => {
      expect(formatPercentage(0.125, true)).toBe('12.5%');
      expect(formatPercentage(0, true)).toBe('0.0%');
      expect(formatPercentage(1, true)).toBe('100.0%');
    });

    it('自定义小数位数', () => {
      expect(formatPercentage(12.5, false, 'zh-CN', 2)).toBe('12.50%');
      expect(formatPercentage(12.5, false, 'zh-CN', 0)).toBe('13%');
    });

    it('null/undefined 返回 "-"', () => {
      expect(formatPercentage(null)).toBe('-');
      expect(formatPercentage(undefined)).toBe('-');
    });

    it('非数值返回原值', () => {
      expect(formatPercentage('string')).toBe('string');
    });
  });

  // ============================================
  // formatSmart 测试
  // ============================================
  describe('formatSmart', () => {
    it('大数值使用紧凑格式', () => {
      expect(formatSmart(1500000)).toBe('1.5M');
      expect(formatSmart(1500)).toBe('1,500');
    });

    it('小数值保持精确', () => {
      // 50 >= 10 所以一位小数；5.5 >= 10 是 false，所以两位小数
      expect(formatSmart(50)).toBe('50.0');
      expect(formatSmart(5.5)).toBe('5.50');
      expect(formatSmart(0.123)).toBe('0.12');
    });

    it('null/undefined 返回 "-"', () => {
      expect(formatSmart(null)).toBe('-');
      expect(formatSmart(undefined)).toBe('-');
    });
  });

  // ============================================
  // formatDisplayValue 测试
  // ============================================
  describe('formatDisplayValue', () => {
    it('大于 1000 使用紧凑格式', () => {
      expect(formatDisplayValue(1500)).toBe('1.5K');
      expect(formatDisplayValue(1500000)).toBe('1.5M');
      expect(formatDisplayValue(1500000000)).toBe('1.5B');
    });

    it('100-999 整数格式', () => {
      expect(formatDisplayValue(500)).toBe('500');
      expect(formatDisplayValue(999)).toBe('999');
    });

    it('10-99 一位小数', () => {
      expect(formatDisplayValue(50)).toBe('50.0');
      expect(formatDisplayValue(12.34)).toBe('12.3');
    });

    it('小于 10 两位小数', () => {
      expect(formatDisplayValue(5)).toBe('5.00');
      expect(formatDisplayValue(0.123)).toBe('0.12');
    });

    it('负数处理', () => {
      expect(formatDisplayValue(-1500)).toBe('-1.5K');
      expect(formatDisplayValue(-50)).toBe('-50.0');
    });

    it('null/undefined 返回 "-"', () => {
      expect(formatDisplayValue(null)).toBe('-');
      expect(formatDisplayValue(undefined)).toBe('-');
    });

    it('非数值返回原值', () => {
      expect(formatDisplayValue('string')).toBe('string');
    });

    it('零值处理', () => {
      expect(formatDisplayValue(0)).toBe('0.00');
    });
  });

  // ============================================
  // formatDateShort 测试
  // ============================================
  describe('formatDateShort', () => {
    it('格式化日期字符串', () => {
      expect(formatDateShort('2024-01-15')).toBe('2024年1月15日');
    });

    it('格式化 Date 对象', () => {
      const date = new Date(2024, 0, 15);
      expect(formatDateShort(date)).toBe('2024年1月15日');
    });

    it('null/undefined 返回 "-"', () => {
      expect(formatDateShort(null)).toBe('-');
      expect(formatDateShort(undefined)).toBe('-');
      expect(formatDateShort('')).toBe('-');
    });
  });

  // ============================================
  // formatDateWithTime 测试
  // ============================================
  describe('formatDateWithTime', () => {
    it('格式化日期和时间', () => {
      const result = formatDateWithTime('2024-01-15T14:30:00');
      expect(result).toMatch(/01\/15/); // zh-CN 使用 / 分隔
      expect(result).toMatch(/14:30/);
    });

    it('格式化 Date 对象', () => {
      const date = new Date(2024, 0, 15, 14, 30);
      const result = formatDateWithTime(date);
      expect(result).toMatch(/01\/15/);
    });

    it('null/undefined 返回 "-"', () => {
      expect(formatDateWithTime(null)).toBe('-');
      expect(formatDateWithTime(undefined)).toBe('-');
    });
  });

  // ============================================
  // formatDateLabelCompact 测试
  // ============================================
  describe('formatDateLabelCompact', () => {
    it('格式化为 MM/DD', () => {
      expect(formatDateLabelCompact('2024-01-15')).toBe('01/15');
      expect(formatDateLabelCompact('2024-12-31')).toBe('12/31');
    });

    it('处理时间戳格式', () => {
      expect(formatDateLabelCompact('2024-01-15T10:30:00')).toBe('01/15');
      expect(formatDateLabelCompact('2024-01-15 10:30:00')).toBe('01/15');
    });

    it('无效日期返回原值', () => {
      expect(formatDateLabelCompact('invalid')).toBe('invalid');
      expect(formatDateLabelCompact('')).toBe('');
    });

    it('null/undefined 返回原值', () => {
      expect(formatDateLabelCompact(null)).toBe(null);
      expect(formatDateLabelCompact(undefined)).toBe(undefined);
    });
  });

  // ============================================
  // formatWeekRange 测试
  // ============================================
  describe('formatWeekRange', () => {
    it('格式化周范围', () => {
      // 2024-01-08 是周一
      const result = formatWeekRange('2024-01-08');
      expect(result).toBe('01/08-01/14'); // 周一到周日
    });

    it('处理时间戳格式', () => {
      const result = formatWeekRange('2024-01-08T00:00:00');
      expect(result).toMatch(/01\/08-/);
    });

    it('无效日期返回原值', () => {
      expect(formatWeekRange('invalid')).toBe('invalid');
      expect(formatWeekRange('')).toBe('');
    });

    it('null/undefined 返回原值', () => {
      expect(formatWeekRange(null)).toBe(null);
      expect(formatWeekRange(undefined)).toBe(undefined);
    });
  });

  // ============================================
  // formatMonthLabel 测试
  // ============================================
  describe('formatMonthLabel', () => {
    it('格式化为 YYYY/MM', () => {
      expect(formatMonthLabel('2024-01-01')).toBe('2024/01');
      expect(formatMonthLabel('2024-12-01')).toBe('2024/12');
    });

    it('处理时间戳格式', () => {
      expect(formatMonthLabel('2024-01-01T00:00:00')).toBe('2024/01');
    });

    it('无效日期返回原值', () => {
      expect(formatMonthLabel('invalid')).toBe('invalid');
    });

    it('null/undefined 返回原值', () => {
      expect(formatMonthLabel(null)).toBe(null);
      expect(formatMonthLabel(undefined)).toBe(undefined);
    });
  });

  // ============================================
  // DATE_RANGE_PRESETS 测试
  // ============================================
  describe('DATE_RANGE_PRESETS', () => {
    it('包含所有预设', () => {
      expect(DATE_RANGE_PRESETS.length).toBe(6);
      expect(DATE_RANGE_PRESETS.find(p => p.label === '今天')).toBeDefined();
      expect(DATE_RANGE_PRESETS.find(p => p.label === '昨天')).toBeDefined();
      expect(DATE_RANGE_PRESETS.find(p => p.label === '近7天')).toBeDefined();
      expect(DATE_RANGE_PRESETS.find(p => p.label === '近30天')).toBeDefined();
      expect(DATE_RANGE_PRESETS.find(p => p.label === '本月')).toBeDefined();
      expect(DATE_RANGE_PRESETS.find(p => p.label === '上月')).toBeDefined();
    });

    it('每个预设返回 { start, end }', () => {
      DATE_RANGE_PRESETS.forEach(preset => {
        const result = preset.getValue();
        expect(result.start).toBeDefined();
        expect(result.end).toBeDefined();
        expect(typeof result.start).toBe('string');
        expect(typeof result.end).toBe('string');
      });
    });

    it('今天预设返回相同日期', () => {
      const today = DATE_RANGE_PRESETS.find(p => p.label === '今天').getValue();
      expect(today.start).toBe(today.end);
    });

    it('近7天预设返回 7 天范围', () => {
      const near7Days = DATE_RANGE_PRESETS.find(p => p.label === '近7天').getValue();
      const start = new Date(near7Days.start);
      const end = new Date(near7Days.end);
      const diffDays = Math.floor((end - start) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(6); // 包含开始和结束共 7 天
    });

    it('近30天预设返回 30 天范围', () => {
      const near30Days = DATE_RANGE_PRESETS.find(p => p.label === '近30天').getValue();
      const start = new Date(near30Days.start);
      const end = new Date(near30Days.end);
      const diffDays = Math.floor((end - start) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(29); // 包含开始和结束共 30 天
    });

    it('本月预设返回当月范围', () => {
      const thisMonth = DATE_RANGE_PRESETS.find(p => p.label === '本月').getValue();

      // 验证日期格式为 YYYY-MM-DD
      expect(thisMonth.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(thisMonth.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // 开始日期应该是月初（如 2024-04-01）
      expect(thisMonth.start.slice(8, 10)).toBe('01');

      // 验证月份匹配（YYYY-MM 部分）
      expect(thisMonth.start.slice(0, 7)).toBe(thisMonth.end.slice(0, 7));
    });

    it('上月预设返回上月范围', () => {
      const lastMonth = DATE_RANGE_PRESETS.find(p => p.label === '上月').getValue();

      // 验证日期格式
      expect(lastMonth.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(lastMonth.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // 开始日期应该是月初
      expect(lastMonth.start.slice(8, 10)).toBe('01');

      // 验证月份匹配
      expect(lastMonth.start.slice(0, 7)).toBe(lastMonth.end.slice(0, 7));
    });
  });

  // ============================================
  // getDefaultDateRange 测试
  // ============================================
  describe('getDefaultDateRange', () => {
    it('返回近7天范围', () => {
      const result = getDefaultDateRange();
      expect(result.start).toBeDefined();
      expect(result.end).toBeDefined();

      // 验证是近7天
      const near7Days = DATE_RANGE_PRESETS.find(p => p.label === '近7天').getValue();
      expect(result.start).toBe(near7Days.start);
      expect(result.end).toBe(near7Days.end);
    });
  });
});
