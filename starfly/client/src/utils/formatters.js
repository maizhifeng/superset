// ============================================================
// 数值与日期格式化工具库
// 支持千位分隔符、货币、百分比、紧凑格式、日期格式化等多种格式化方式
// ============================================================

/**
 * 数值与日期格式化工具库
 * 支持千位分隔符、货币、百分比、紧凑格式、日期格式化等多种格式化方式
 */

// 默认区域设置 - UI 界面为中文
const DEFAULT_LOCALE = 'zh-CN';
const DEFAULT_CURRENCY = 'CNY';

/**
 * 通用数值格式化
 * @param {number} value - 要格式化的数值
 * @param {Object} options - 格式化选项
 * @param {string} options.locale - 地区设置，默认 'zh-CN'
 * @param {boolean} options.compact - 是否使用紧凑格式 (K/M)，默认 false
 * @param {number} options.minimumFractionDigits - 最少小数位数
 * @param {number} options.maximumFractionDigits - 最多小数位数
 * @returns {string} 格式化后的字符串
 */
export function formatNumber(value, options = {}) {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'number') return value;

  const {
    locale = DEFAULT_LOCALE,
    compact = false,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options;

  // 紧凑格式 (K, M, B)
  if (compact) {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (absValue >= 1e9) {
      return sign + (absValue / 1e9).toFixed(1) + 'B';
    }
    if (absValue >= 1e6) {
      return sign + (absValue / 1e6).toFixed(1) + 'M';
    }
    if (absValue >= 1e3) {
      return sign + (absValue / 1e3).toFixed(1) + 'K';
    }
    // 小数值直接返回
    if (absValue >= 100) {
      return sign + absValue.toFixed(0);
    }
    return sign + absValue.toFixed(1);
  }

  // 使用 Intl.NumberFormat 标准格式化
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/**
 * 带千位分隔符的数值格式化
 * @param {number} value - 要格式化的数值
 * @param {string} locale - 地区设置，默认 'zh-CN'
 * @returns {string} 格式化后的字符串 (如 1,234,567)
 */
export function formatWithSeparator(value, locale = DEFAULT_LOCALE) {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'number') return value;

  return new Intl.NumberFormat(locale).format(value);
}

/**
 * 货币格式化
 * @param {number} value - 要格式化的数值
 * @param {string} currency - 货币代码，默认 'CNY'
 * @param {string} locale - 地区设置，默认 'zh-CN'
 * @returns {string} 格式化后的字符串 (如 ¥1,234.56)
 */
export function formatCurrency(value, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'number') return value;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * 百分比格式化
 * @param {number} value - 百分比数值 (0-100 或 0-1)
 * @param {boolean} isRatio - 是否为比例值 (0-1)，默认 false (即输入 0-100)
 * @param {string} locale - 地区设置，默认 'zh-CN'
 * @param {number} fractionDigits - 小数位数，默认 1
 * @returns {string} 格式化后的字符串 (如 12.5%)
 */
export function formatPercentage(value, isRatio = false, locale = DEFAULT_LOCALE, fractionDigits = 1) {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'number') return value;

  const normalizedValue = isRatio ? value : value / 100;

  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(normalizedValue);
}

/**
 * 大数值智能格式化 (自动选择合适格式)
 * @param {number} value - 要格式化的数值
 * @param {Object} options - 格式化选项
 * @returns {string} 格式化后的字符串
 */
export function formatSmart(value, options = {}) {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'number') return value;

  const absValue = Math.abs(value);

  // 大于百万用紧凑格式
  if (absValue >= 1e6) {
    return formatNumber(value, { compact: true });
  }

  // 大于千用千位分隔符
  if (absValue >= 1e3) {
    return formatWithSeparator(value);
  }

  // 小数值保留适当精度
  if (absValue >= 100) {
    return value.toFixed(0);
  }
  if (absValue >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

/**
 * 按指标数值格式进行格式化
 * @param {number} value - 要格式化的数值
 * @param {string} format - 格式类型: 'integer' | 'float' | 'percentage'
 * @returns {string} 格式化后的字符串
 */
export function formatByMetricFormat(value, format = 'float') {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'number') return value;

  const absValue = Math.abs(value);

  switch (format) {
    case 'integer':
      if (absValue >= 1000) {
        return formatNumber(value, { compact: true });
      }
      return new Intl.NumberFormat(DEFAULT_LOCALE, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case 'percentage':
      return formatPercentage(value, false, DEFAULT_LOCALE, 1);
    case 'float':
    default:
      return formatDisplayValue(value);
  }
}

/**
 * UI 显示格式化（用于所有组件的数值显示）
 * 大数值自动使用 K/M/B 紧凑格式，小数值保持精确
 * @param {number} value - 要格式化的数值
 * @returns {string} 格式化后的字符串
 */
export function formatDisplayValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) value = parsed;
  }
  if (typeof value !== 'number') return value;

  const absValue = Math.abs(value);

  // 大于1000使用紧凑格式（K/M/B）
  if (absValue >= 1000) {
    return formatNumber(value, { compact: true });
  }

  // 小于1000保持精确，带千位分隔符（虽然不需要）
  // 根据数值大小决定小数位数
  if (absValue >= 100) {
    return value.toFixed(0);
  }
  if (absValue >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

/**
 * 短日期格式化（列表/表格用）
 * @param {string|Date} date - 日期
 * @param {string} locale - 地区设置，默认 'zh-CN'
 * @returns {string} 格式化后的字符串 (如 "2024年1月15日")
 */
export function formatDateShort(date, locale = DEFAULT_LOCALE) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * 带时间的日期格式化（回收站等用）
 * @param {string|Date} date - 日期
 * @param {string} locale - 地区设置，默认 'zh-CN'
 * @returns {string} 格式化后的字符串 (如 "01-15 14:30")
 */
export function formatDateWithTime(date, locale = DEFAULT_LOCALE) {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 紧凑日期标签格式化（图表轴用）
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD 格式)
 * @returns {string} 格式化后的字符串 (如 "01/15")
 */
export function formatDateLabelCompact(dateStr) {
  if (!dateStr) return dateStr;
  // 处理时间戳格式：仅提取日期部分
  const datePart = dateStr.split('T')[0].split(' ')[0];
  if (!datePart || datePart.length < 10) return dateStr;
  const parts = datePart.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[1]}/${parts[2]}`;
}

/**
 * 周范围格式化（图表轴用）
 * @param {string} weekStartStr - 周开始日期字符串 (YYYY-MM-DD 格式，周一)
 * @returns {string} 格式化后的字符串 (如 "04/14-04/20")
 */
export function formatWeekRange(weekStartStr) {
  if (!weekStartStr) return weekStartStr;
  const datePart = weekStartStr.split('T')[0].split(' ')[0];
  if (!datePart || datePart.length < 10) return weekStartStr;

  const startDate = new Date(datePart);
  if (isNaN(startDate.getTime())) return weekStartStr;

  // 周结束日期 = 周开始 + 6天（周日）
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  const formatDate = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

  return `${formatDate(startDate)}-${formatDate(endDate)}`;
}

/**
 * 月格式化（图表轴用）
 * @param {string} monthStartStr - 月开始日期字符串 (YYYY-MM-DD 格式，如 2026-04-01)
 * @returns {string} 格式化后的字符串 (如 "2026/04")
 */
export function formatMonthLabel(monthStartStr) {
  if (!monthStartStr) return monthStartStr;
  const datePart = monthStartStr.split('T')[0].split(' ')[0];
  if (!datePart || datePart.length < 10) return monthStartStr;

  const parts = datePart.split('-');
  if (parts.length !== 3) return monthStartStr;

  return `${parts[0]}/${parts[1]}`;
}

/**
 * 将 Date 对象格式化为本地日期字符串 (YYYY-MM-DD)
 * 避免 toISOString() 的 UTC 时区偏移问题
 * @param {Date} date - 日期对象
 * @returns {string} YYYY-MM-DD 格式字符串
 */
function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 日期范围预设常量
 */
export const DATE_RANGE_PRESETS = [
  {
    label: '今天',
    getValue: () => {
      const today = formatLocalDate(new Date());
      return { start: today, end: today };
    },
  },
  {
    label: '昨天',
    getValue: () => {
      const yesterday = formatLocalDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
      return { start: yesterday, end: yesterday };
    },
  },
  {
    label: '近7天',
    getValue: () => {
      const end = formatLocalDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const start = formatLocalDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
      return { start, end };
    },
  },
  {
    label: '近30天',
    getValue: () => {
      const end = formatLocalDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
      const start = formatLocalDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      return { start, end };
    },
  },
  {
    label: '本月',
    getValue: () => {
      const now = new Date();
      const start = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { start, end };
    },
  },
  {
    label: '上月',
    getValue: () => {
      const now = new Date();
      const start = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const end = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 0));
      return { start, end };
    },
  },
];

/**
 * 获取默认日期范围（近7天）
 * @returns {Object} { start, end } 日期字符串
 */
export function getDefaultDateRange() {
  return DATE_RANGE_PRESETS.find(p => p.label === '近7天').getValue();
}

/**
 * 格式化集合对象
 */
export const formatters = {
  number: formatNumber,
  withSeparator: formatWithSeparator,
  currency: formatCurrency,
  percentage: formatPercentage,
  smart: formatSmart,
  displayValue: formatDisplayValue,
  dateShort: formatDateShort,
  dateWithTime: formatDateWithTime,
  dateLabelCompact: formatDateLabelCompact,
  defaultDateRange: getDefaultDateRange,
  dateRangePresets: DATE_RANGE_PRESETS,
};

export default formatters;
