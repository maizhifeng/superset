/**
 * 图表颜色配置
 *
 * 功能：
 * 1. 静态调色板 - 预定义的配色方案
 * 2. 动态调色板 - 基于主题色生成和谐配色
 * 3. UI 元素颜色 - 轴线、网格、tooltip 等
 * 4. 语义颜色 - success/warning/error/info
 */

// ============================================================================
// HSL 色彩空间辅助函数
// ============================================================================

/**
 * HEX 转 RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

/**
 * RGB 转 HEX
 */
function rgbToHex(r, g, b) {
  const toHex = (x) => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * RGB 转 HSL
 */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * HSL 转 RGB
 */
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * HEX 转 HSL
 */
function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, l: 50 };
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

/**
 * HSL 转 HEX
 */
function hslToHex(h, s, l) {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// ============================================================================
// 调色板生成 - 基于色彩理论
// ============================================================================

/**
 * 基于主题色生成和谐调色板
 * 使用色相环配色方案：
 * - 位置 0: 主色
 * - 位置 1: 类似色 +30 (同类色)
 * - 位置 2: 类似色 -30
 * - 位置 3: 互补色 +180
 * - 位置 4: 分裂互补色 +150
 * - 位置 5: 分裂互补色 +210
 * - 位置 6-11: 三角配色 + 其他色相偏移
 */
export function generateThemeAwarePalette(primaryColor, count = 12) {
  const baseHsl = hexToHsl(primaryColor);
  const baseHue = baseHsl.h;
  const baseSat = Math.max(50, Math.min(80, baseHsl.s)); // 确保足够饱和度
  const baseLight = Math.max(45, Math.min(65, baseHsl.l)); // 确保可见性

  const hueOffsets = [
    0,      // 主色
    30,     // 类似色 +30
    -30,    // 类似色 -30 (调整为正数)
    180,    // 互补色
    150,    // 分裂互补色 +150
    210,    // 分裂互补色 +210 (调整为 -150)
    60,     // 三角配色
    120,    // 三角配色
    240,    // 三角配色
    90,     // 其他色相
    270,    // 其他色相
    330,    // 其他色相
  ];

  const result = [];
  for (let i = 0; i < count; i++) {
    const offset = hueOffsets[i % hueOffsets.length];
    const hue = (baseHue + offset + 360) % 360;

    // 根据位置微调饱和度和明度
    const satAdjust = i === 0 ? 0 : (i % 3 === 0 ? -10 : 5);
    const lightAdjust = i === 0 ? 0 : (i % 2 === 0 ? 5 : -5);

    const s = Math.max(40, Math.min(90, baseSat + satAdjust));
    const l = Math.max(40, Math.min(70, baseLight + lightAdjust));

    result.push(hslToHex(hue, s, l));
  }

  return result;
}

// ============================================================================
// 静态调色板 - 预定义配色
// ============================================================================

/**
 * 默认调色板（灰色主题）
 */
const DEFAULT_PALETTE = [
  '#4285F4',  // Blue (primary)
  '#8B5CF6',  // Violet
  '#F59E0B',  // Amber
  '#10B981',  // Emerald
  '#EF4444',  // Red
  '#6366F1',  // Indigo
  '#EC4899',  // Pink
  '#14B8A6',  // Teal
  '#F97316',  // Orange
  '#84CC16',  // Lime
  '#A855F7',  // Purple
  '#06B6D4',  // Cyan
];

/**
 * 获取分类调色板颜色数组
 * @param {number} count - 需要的颜色数量
 * @param {string} primaryColor - 主题色 (可选)
 * @returns {string[]} 十六进制颜色数组
 */
export function getCategoricalColors(count = 12, primaryColor = null) {
  // 如果有主题色，生成动态调色板
  if (primaryColor) {
    return generateThemeAwarePalette(primaryColor, count);
  }

  // 使用静态调色板
  const result = [];
  for (let i = 0; i < Math.min(count, DEFAULT_PALETTE.length); i++) {
    result.push(DEFAULT_PALETTE[i]);
  }

  // 如果需要更多颜色，循环使用
  if (count > DEFAULT_PALETTE.length) {
    for (let i = DEFAULT_PALETTE.length; i < count; i++) {
      result.push(DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]);
    }
  }

  return result;
}

// ============================================================================
// 图表 UI 元素颜色
// ============================================================================

/**
 * 获取图表 UI 元素颜色（使用 CSS 变量）
 * @returns {Object} 包含轴线、网格线、tooltip 等颜色
 */
export function getChartUIColors() {
  // 尝试从 CSS 变量读取
  const root = document.documentElement;
  const styles = getComputedStyle(root);

  const getVar = (name, fallback) => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };

  return {
    axisLine: getVar('--mui-palette-chart-axisLine', '#9AA0A6'),
    gridLine: getVar('--mui-palette-chart-gridLine', '#E4E8E6'),
    splitLine: getVar('--mui-palette-divider', 'rgba(0,0,0,0.10)'),
    tooltipBg: getVar('--mui-palette-chart-tooltipBg', '#202124'),
    tooltipBorder: getVar('--mui-palette-chart-tooltipBorder', '#DADCE0'),
    tooltipText: getVar('--mui-palette-chart-tooltipText', '#F9FAFB'),
    legendText: getVar('--mui-palette-chart-legendText', '#5F6368'),
    labelText: getVar('--mui-palette-chart-labelText', '#191C1E'),
    mutedText: getVar('--mui-palette-text-muted', '#6B7280'),
    emphasisShadow: 'rgba(0, 0, 0, 0.3)',
  };
}

// ============================================================================
// 语义颜色
// ============================================================================

/**
 * 获取语义颜色
 * @param {string} primaryColor - 主题色 (可选，用于 info)
 * @returns {Object} success, warning, error, info, neutral 颜色
 */
export function getSemanticColors() {
  const getVar = (name, fallback) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };

  return {
    success: getVar('--mui-palette-success-main', '#1E8E3E'),
    warning: getVar('--mui-palette-warning-main', '#F9AB00'),
    error: getVar('--mui-palette-error-main', '#D93025'),
    info: getVar('--mui-palette-info-main', '#4285F4'),
    neutral: '#6B7280',
  };
}

// ============================================================================
// 综合调色板获取
// ============================================================================

/**
 * 根据数据量获取合适的颜色调色板
 * @param {number} count - 需要的颜色数量
 * @param {string} type - 调色板类型 ('categorical' | 'ui' | 'semantic')
 * @param {string} primaryColor - 主题色 (可选)
 * @returns {string[]|Object} 颜色数组或对象
 */
export function getChartColorPalette(count, type = 'categorical', primaryColor = null) {
  if (type === 'categorical') {
    return getCategoricalColors(count, primaryColor);
  }
  if (type === 'ui') {
    return getChartUIColors();
  }
  if (type === 'semantic') {
    return getSemanticColors();
  }
  return getCategoricalColors(count, primaryColor);
}

// ============================================================================
// 便捷导出
// ============================================================================

export const CHART_COLORS = {
  categorical: getCategoricalColors,
  ui: getChartUIColors,
  semantic: getSemanticColors,
  palette: getChartColorPalette,
  generateThemeAware: generateThemeAwarePalette,
};

export default CHART_COLORS;
