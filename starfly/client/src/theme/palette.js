/**
 * 主题颜色定义 — Material Design 3 语义化色彩系统
 *
 * M3 色彩角色：primary、secondary、tertiary、error、surface、background
 * 8 个预置主题，各含 light/dark 两套完整色板
 * 每个角色有 main / on- / container / on-container- 等变体
 */

// ============================================================================
// HSL 色彩空间辅助函数 (用于生成 container / surface 派生色)
// ============================================================================

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function rgbToHex(r, g, b) {
  const toHex = (x) => { const h = Math.round(Math.max(0, Math.min(255, x))).toString(16); return h.length === 1 ? '0' + h : h; };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s; const l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: Math.round(hue2rgb(p, q, h + 1/3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1/3) * 255) };
}

function hexToHsl(hex) { const rgb = hexToRgb(hex); return rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : { h: 0, s: 0, l: 50 }; }

function hslToHex(h, s, l) { const rgb = hslToRgb(h, s, l); return rgbToHex(rgb.r, rgb.g, rgb.b); }

function hexToRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'rgba(0,0,0,' + alpha + ')';
  return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
}

function getLuminance(hex) {
  const rgb = hexToRgb(hex); if (!rgb) return 0;
  const [R, G, B] = [rgb.r, rgb.g, rgb.b].map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function getContrastText(hex) { return getLuminance(hex) > 0.5 ? '#000000' : '#FFFFFF'; }

function generateContainerColor(hex, mode) {
  const hsl = hexToHsl(hex);
  if (mode === 'light') {
    const l = Math.max(92, Math.min(96, hsl.l + 40));
    const s = Math.max(6, Math.min(14, hsl.s - 25));
    return hslToHex(hsl.h, s, l);
  }
  // dark: low lightness container
  const l = Math.max(12, Math.min(22, hsl.l - 30));
  const s = Math.max(10, Math.min(20, hsl.s));
  return hslToHex(hsl.h, s, l);
}

function generateOnContainer(contrastToHex, mode) {
  return mode === 'light' ? '#191C1E' : '#E0E3E7';
}

// ============================================================================
// 8 个预置主题 — 浅色基色定义
// ============================================================================

export const presetColors = {
  teal: {
    name: 'Teal Green',
    primary: '#00796B',
    secondary: '#4A6360',
    tertiary: '#7B5A3E',
    surfaceTint: '#8CD487',
  },
  ocean: {
    name: 'Ocean Blue',
    primary: '#1565C0',
    secondary: '#5C6A78',
    tertiary: '#C0504D',
    surfaceTint: '#64B5F6',
  },
  indigo: {
    name: 'Deep Indigo',
    primary: '#3F51B5',
    secondary: '#616A8D',
    tertiary: '#C0853B',
    surfaceTint: '#9FA8DA',
  },
  purple: {
    name: 'Royal Purple',
    primary: '#7C3AED',
    secondary: '#6B6185',
    tertiary: '#3DB88B',
    surfaceTint: '#CE93D8',
  },
  rose: {
    name: 'Bold Rose',
    primary: '#C2185B',
    secondary: '#7A5C69',
    tertiary: '#00838F',
    surfaceTint: '#F48FB1',
  },
  amber: {
    name: 'Warm Amber',
    primary: '#E65100',
    secondary: '#7A6B5E',
    tertiary: '#1565C0',
    surfaceTint: '#FFCC80',
  },
  cyan: {
    name: 'Crisp Cyan',
    primary: '#00838F',
    secondary: '#5A6A6D',
    tertiary: '#BF5F3F',
    surfaceTint: '#80DEEA',
  },
  slate: {
    name: 'Neutral Slate',
    primary: '#546E7A',
    secondary: '#5D6D75',
    tertiary: '#A0805E',
    surfaceTint: '#B0BEC5',
  },
};

// ============================================================================
// buildM3Palette — 从关键色构建完整的 M3 调色板
// ============================================================================

export function buildM3Palette(colors, mode = 'light') {
  const { primary, secondary, tertiary } = colors;
  const isDark = mode === 'dark';

  const primaryContainer = generateContainerColor(primary, mode);
  const secondaryContainer = generateContainerColor(secondary, mode);
  const tertiaryContainer = generateContainerColor(tertiary, mode);

  // Surface hierarchy
  const surface = isDark ? '#121316' : '#F8FAF9';
  const surfaceVariant = isDark ? '#1E2023' : '#EEF2F0';
  const surfaceVariant2 = isDark ? '#282A2E' : '#E4E8E6';
  const pageBg = isDark ? '#0D0F10' : '#F3F6F5';
  const sidebarBg = isDark ? '#0D0F10' : '#F3F6F5';
  const cardBg = isDark ? '#1A1C1F' : '#FFFFFF';
  const headerBg = isDark ? '#1E2023' : '#EEF2F0';
  const iconBg = isDark ? '#282A2E' : '#E4E8E6';

  // Text hierarchy
  const textPrimary = isDark ? '#E3E2E6' : '#191C1E';
  const textSecondary = isDark ? '#B0B3B8' : '#44474E';
  const textDisabled = isDark ? '#6B6F76' : '#75777A';
  const textMuted = isDark ? '#8E9098' : '#6B7280';
  const textTooltip = isDark ? '#191C1E' : '#F9FAFB';

  // Interactive states (based on primary)
  const actionHover = hexToRgba(primary, 0.08);
  const actionSelected = hexToRgba(primary, 0.12);
  const actionFocus = hexToRgba(primary, 0.14);
  const actionDisabled = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.26)';
  const actionDisabledBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';

  // Borders
  const borderLight = isDark ? 'rgba(255,255,255,0.06)' : hexToRgba(primary, 0.08);
  const borderMedium = isDark ? 'rgba(255,255,255,0.10)' : hexToRgba(primary, 0.12);
  const borderStrong = isDark ? 'rgba(255,255,255,0.14)' : hexToRgba(primary, 0.15);
  const borderGray = isDark ? '#3A3D42' : '#DADCE0';
  const divider = isDark ? 'rgba(255,255,255,0.10)' : hexToRgba(primary, 0.12);
  const outline = isDark ? 'rgba(255,255,255,0.16)' : hexToRgba(primary, 0.20);
  const outlineVariant = isDark ? 'rgba(255,255,255,0.08)' : hexToRgba(primary, 0.10);

  // Elevation overlays
  const elevation = {
    overlay0: 'rgba(0,0,0,0)',
    overlay1: isDark ? 'rgba(0,0,0,0.20)' : hexToRgba(primary, 0.05),
    overlay2: isDark ? 'rgba(0,0,0,0.26)' : hexToRgba(primary, 0.08),
    overlay3: isDark ? 'rgba(0,0,0,0.31)' : hexToRgba(primary, 0.11),
    overlay4: isDark ? 'rgba(0,0,0,0.34)' : hexToRgba(primary, 0.12),
    overlay5: isDark ? 'rgba(0,0,0,0.38)' : hexToRgba(primary, 0.14),
  };

  // Shadows
  const shadowKey = isDark
    ? '0px 2px 1px -1px rgba(0,0,0,0.3), 0px 1px 1px 0px rgba(0,0,0,0.24), 0px 1px 3px 0px rgba(0,0,0,0.20)'
    : '0px 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12)';

  // Semantic status colors (consistent across themes)
  const errorMain = '#D93025';
  const errorContainer = isDark ? '#93000A' : '#FCE9E9';
  const errorOnContainer = isDark ? '#FFDAD6' : '#410E0B';
  const warningMain = '#F9AB00';
  const successMain = '#1E8E3E';
  const successContainer = isDark ? '#00391E' : '#E6F4EA';
  const successLight = '#34A853';
  const infoMain = '#4285F4';

  // Status with backgrounds
  const status = {
    success: successMain,
    successBg: hexToRgba(successMain, isDark ? 0.16 : 0.08),
    successLight,
    warning: warningMain,
    warningBg: hexToRgba(warningMain, isDark ? 0.16 : 0.08),
    error: errorMain,
    errorBg: hexToRgba(errorMain, isDark ? 0.16 : 0.08),
  };

  // Chart colors
  const chart = {
    tooltipBg: isDark ? '#2D3035' : '#202124',
    tooltipBorder: isDark ? '#3A3D42' : '#DADCE0',
    tooltipText: isDark ? '#E3E2E6' : '#F9FAFB',
    legendText: isDark ? '#B0B3B8' : '#5F6368',
    labelText: isDark ? '#E3E2E6' : '#191C1E',
    axisLine: isDark ? '#6B6F76' : '#9AA0A6',
    gridLine: isDark ? '#282A2E' : '#E4E8E6',
    emphasisShadow: 'rgba(0, 0, 0, 0.3)',
  };

  // Step indicator
  const step = {
    active: primary,
    inactive: isDark ? '#3A3D42' : '#DADCE0',
    inactiveText: isDark ? '#B0B3B8' : '#5F6368',
    line: isDark ? '#3A3D42' : '#DADCE0',
  };

  return {
    mode,

    // ===== M3 核心色 =====
    primary: {
      main: primary,
      container: primaryContainer,
      onContainer: generateOnContainer(primaryContainer, mode),
      contrastText: getContrastText(primary),
    },
    secondary: {
      main: secondary,
      container: secondaryContainer,
      onContainer: generateOnContainer(secondaryContainer, mode),
      contrastText: getContrastText(secondary),
    },
    tertiary: {
      main: tertiary,
      container: tertiaryContainer,
      onContainer: generateOnContainer(tertiaryContainer, mode),
      contrastText: getContrastText(tertiary),
    },
    error: {
      main: errorMain,
      container: errorContainer,
      onContainer: errorOnContainer,
      contrastText: '#FFFFFF',
    },

    // ===== Surface / Background =====
    background: {
      default: pageBg,
      paper: cardBg,
    },
    surface: {
      main: surface,
      variant: surfaceVariant,
      tint: primary,
    },

    // ===== Text =====
    text: {
      primary: textPrimary,
      secondary: textSecondary,
      disabled: textDisabled,
      muted: textMuted,
      tooltip: textTooltip,
    },

    // ===== Outline / Divider =====
    outline,
    outlineVariant,
    divider,

    // ===== 状态色 =====
    warning: { main: warningMain, contrastText: '#000000' },
    success: { main: successMain, light: successContainer, contrastText: '#FFFFFF' },
    info: { main: infoMain, contrastText: '#FFFFFF' },

    // ===== 向后兼容的背景色 =====
    bg: {
      page: pageBg,
      sidebar: sidebarBg,
      card: cardBg,
      header: headerBg,
      hover: actionHover,
      selected: actionSelected,
      muted: actionHover,
      iconBg,
    },

    // ===== 向后兼容的边框 =====
    border: {
      light: borderLight,
      medium: borderMedium,
      strong: borderStrong,
      gray: borderGray,
    },

    // ===== 阴影 =====
    shadow: {
      sm: shadowKey,
      md: isDark
        ? '0px 3px 3px -2px rgba(0,0,0,0.3), 0px 3px 4px 0px rgba(0,0,0,0.24), 0px 1px 8px 0px rgba(0,0,0,0.20)'
        : '0px 3px 3px -2px rgba(0,0,0,0.2), 0px 3px 4px 0px rgba(0,0,0,0.14), 0px 1px 8px 0px rgba(0,0,0,0.12)',
      lg: isDark
        ? '0px 3px 5px -1px rgba(0,0,0,0.3), 0px 6px 10px 0px rgba(0,0,0,0.24), 0px 1px 18px 0px rgba(0,0,0,0.20)'
        : '0px 3px 5px -1px rgba(0,0,0,0.2), 0px 6px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)',
      card: shadowKey,
      cardHover: isDark
        ? '0px 3px 3px -2px rgba(0,0,0,0.3), 0px 3px 4px 0px rgba(0,0,0,0.24), 0px 1px 8px 0px rgba(0,0,0,0.20)'
        : '0px 3px 3px -2px rgba(0,0,0,0.2), 0px 3px 4px 0px rgba(0,0,0,0.14), 0px 1px 8px 0px rgba(0,0,0,0.12)',
    },

    // ===== Elevation overlays =====
    elevation,

    // ===== Status =====
    status,

    // ===== Chart =====
    chart,

    // ===== Step =====
    step,

    // ===== Action states =====
    action: {
      active: primary,
      hover: actionHover,
      selected: actionSelected,
      selectedOpacity: 0.12,
      disabled: actionDisabled,
      disabledBackground: actionDisabledBg,
      focus: actionFocus,
    },
  };
}

// ============================================================================
// 构建指定 preset 的完整调色板
// ============================================================================

export function buildPresetPalette(presetId, mode = 'light') {
  const preset = presetColors[presetId];
  if (!preset) return buildM3Palette(presetColors.teal, mode);
  return buildM3Palette(preset, mode);
}

// ============================================================================
// 默认导出 — 用于 MUI createTheme 初始值 (Teal Green light)
// ============================================================================

const defaultPalette = buildM3Palette(presetColors.teal, 'light');
export default defaultPalette;
