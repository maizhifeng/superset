import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { buildPresetPalette, presetColors, buildM3Palette } from '../theme/palette';

// ============================================================
// 主题上下文 - 管理颜色模式（亮/暗）、预设主题与自定义颜色
// ============================================================

const PRESET_ID_KEY = 'theme-preset-id';
const COLOR_MODE_KEY = 'theme-color-mode';
const CUSTOM_COLOR_KEY = 'theme-custom-color';
const DEFAULT_PRESET = 'teal';

const ThemeContext = createContext(null);

// ============================================================================
// HSL 辅助 (用于自定义颜色时自动生成 secondary / tertiary)
// ============================================================================

function hexToHsl(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 50 };
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
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

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return (v).toString(16).padStart(2,'0'); }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toHex = x => { const hx = Math.round(Math.max(0, Math.min(255, x * 255))).toString(16); return hx.length === 1 ? '0' + hx : hx; };
  return '#' + toHex(hue2rgb(p, q, h + 1/3)) + toHex(hue2rgb(p, q, h)) + toHex(hue2rgb(p, q, h - 1/3));
}

function generateAutoSecondary(primaryHex) {
  const hsl = hexToHsl(primaryHex);
  return hslToHex((hsl.h + 40) % 360, Math.max(15, Math.min(30, hsl.s - 10)), Math.max(40, Math.min(60, hsl.l + 5)));
}

function generateAutoTertiary(primaryHex) {
  const hsl = hexToHsl(primaryHex);
  return hslToHex((hsl.h + 165) % 360, 22, 50);
}

// ============================================================================
// CSS 变量更新
// ============================================================================

function updateCSSVariables(palette) {
  const root = document.documentElement;

  root.setAttribute('data-mui-color-scheme', palette.mode);
  if (palette.mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const set = (name, value) => { if (value !== undefined && value !== null) root.style.setProperty(name, value); };

  set('--mui-palette-primary-main', palette.primary.main);
  set('--mui-palette-primary-container', palette.primary.container);
  set('--mui-palette-primary-onContainer', palette.primary.onContainer);
  set('--mui-palette-primary-contrastText', palette.primary.contrastText);
  set('--mui-palette-secondary-main', palette.secondary.main);
  set('--mui-palette-secondary-container', palette.secondary.container);
  set('--mui-palette-secondary-onContainer', palette.secondary.onContainer);
  set('--mui-palette-tertiary-main', palette.tertiary.main);
  set('--mui-palette-tertiary-container', palette.tertiary.container);
  set('--mui-palette-tertiary-onContainer', palette.tertiary.onContainer);
  set('--mui-palette-error-main', palette.error.main);
  set('--mui-palette-error-container', palette.error.container);
  set('--mui-palette-error-onContainer', palette.error.onContainer);
  set('--mui-palette-error-contrastText', palette.error.contrastText);
  set('--mui-palette-warning-main', palette.warning.main);
  set('--mui-palette-success-main', palette.success.main);
  set('--mui-palette-info-main', palette.info.main);
  set('--mui-palette-background-default', palette.background.default);
  set('--mui-palette-background-paper', palette.background.paper);
  set('--mui-palette-surface-main', palette.surface.main);
  set('--mui-palette-surface-variant', palette.surface.variant);
  set('--mui-palette-surface-tint', palette.surface.tint);
  set('--mui-palette-text-primary', palette.text.primary);
  set('--mui-palette-text-secondary', palette.text.secondary);
  set('--mui-palette-text-disabled', palette.text.disabled);
  set('--mui-palette-text-muted', palette.text.muted);
  set('--mui-palette-text-tooltip', palette.text.tooltip);
  set('--mui-palette-outline', palette.outline);
  set('--mui-palette-outlineVariant', palette.outlineVariant);
  set('--mui-palette-divider', palette.divider);
  set('--mui-palette-bg-page', palette.bg.page);
  set('--mui-palette-bg-sidebar', palette.bg.sidebar);
  set('--mui-palette-bg-card', palette.bg.card);
  set('--mui-palette-bg-header', palette.bg.header);
  set('--mui-palette-bg-hover', palette.bg.hover);
  set('--mui-palette-bg-selected', palette.bg.selected);
  set('--mui-palette-bg-muted', palette.bg.muted);
  set('--mui-palette-bg-iconBg', palette.bg.iconBg);
  set('--mui-palette-border-light', palette.border.light);
  set('--mui-palette-border-medium', palette.border.medium);
  set('--mui-palette-border-strong', palette.border.strong);
  set('--mui-palette-border-gray', palette.border.gray);
  set('--mui-palette-shadow-sm', palette.shadow.sm);
  set('--mui-palette-shadow-md', palette.shadow.md);
  set('--mui-palette-shadow-lg', palette.shadow.lg);
  set('--mui-palette-action-hover', palette.action.hover);
  set('--mui-palette-action-selected', palette.action.selected);
  set('--mui-palette-action-focus', palette.action.focus);
  set('--mui-palette-action-active', palette.action.active);
  set('--mui-palette-action-disabled', palette.action.disabled);
  set('--mui-palette-action-disabledBackground', palette.action.disabledBackground);
  set('--mui-palette-elevation-overlay0', palette.elevation.overlay0);
  set('--mui-palette-elevation-overlay1', palette.elevation.overlay1);
  set('--mui-palette-elevation-overlay2', palette.elevation.overlay2);
  set('--mui-palette-elevation-overlay3', palette.elevation.overlay3);
  set('--mui-palette-elevation-overlay4', palette.elevation.overlay4);
  set('--mui-palette-elevation-overlay5', palette.elevation.overlay5);
  set('--mui-palette-status-success', palette.status.success);
  set('--mui-palette-status-successBg', palette.status.successBg);
  set('--mui-palette-status-successLight', palette.status.successLight);
  set('--mui-palette-status-warning', palette.status.warning);
  set('--mui-palette-status-warningBg', palette.status.warningBg);
  set('--mui-palette-status-error', palette.status.error);
  set('--mui-palette-status-errorBg', palette.status.errorBg);
  set('--mui-palette-chart-tooltipBg', palette.chart.tooltipBg);
  set('--mui-palette-chart-tooltipBorder', palette.chart.tooltipBorder);
  set('--mui-palette-chart-tooltipText', palette.chart.tooltipText);
  set('--mui-palette-chart-legendText', palette.chart.legendText);
  set('--mui-palette-chart-labelText', palette.chart.labelText);
  set('--mui-palette-chart-axisLine', palette.chart.axisLine);
  set('--mui-palette-chart-gridLine', palette.chart.gridLine);
  set('--mui-palette-step-active', palette.step.active);
  set('--mui-palette-step-inactive', palette.step.inactive);
  set('--mui-palette-step-inactiveText', palette.step.inactiveText);
  set('--mui-palette-step-line', palette.step.line);
}

// ============================================================================
// ThemeProvider
// ============================================================================

export function ThemeProvider({ children }) {
  const [presetId, setPresetIdState] = useState(() => {
    const saved = localStorage.getItem(PRESET_ID_KEY);
    return presetColors[saved] ? saved : DEFAULT_PRESET;
  });

  const [colorMode, setColorModeState] = useState(() => {
    const saved = localStorage.getItem(COLOR_MODE_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [currentPalette, setCurrentPalette] = useState(() =>
    buildPresetPalette(presetId, colorMode)
  );

  const buildAndApply = useCallback((pid, mode) => {
    const palette = buildPresetPalette(pid, mode);
    setCurrentPalette(palette);
    updateCSSVariables(palette);
  }, []);

  const setPreset = useCallback((id) => {
    if (!presetColors[id]) return;
    setPresetIdState(id);
    localStorage.setItem(PRESET_ID_KEY, id);
    localStorage.removeItem(CUSTOM_COLOR_KEY);
    buildAndApply(id, colorMode);
  }, [colorMode, buildAndApply]);

  const setCustomColor = useCallback((hex) => {
    const secondary = generateAutoSecondary(hex);
    const tertiary = generateAutoTertiary(hex);
    const palette = buildM3Palette({ primary: hex, secondary, tertiary }, colorMode);
    setCurrentPalette(palette);
    setPresetIdState('custom');
    localStorage.setItem(PRESET_ID_KEY, 'custom');
    localStorage.setItem(CUSTOM_COLOR_KEY, JSON.stringify({ primary: hex, secondary, tertiary }));
    updateCSSVariables(palette);
  }, [colorMode]);

  const toggleColorMode = useCallback(() => {
    const newMode = colorMode === 'light' ? 'dark' : 'light';
    setColorModeState(newMode);
    localStorage.setItem(COLOR_MODE_KEY, newMode);
    if (presetId === 'custom') {
      const raw = localStorage.getItem(CUSTOM_COLOR_KEY);
      if (raw) {
        try {
          const c = JSON.parse(raw);
          const palette = buildM3Palette({ primary: c.primary, secondary: c.secondary, tertiary: c.tertiary }, newMode);
          setCurrentPalette(palette);
          updateCSSVariables(palette);
          return;
        } catch (_) { /* fall through */ }
      }
    }
    buildAndApply(presetId, newMode);
  }, [colorMode, presetId, buildAndApply]);

  useEffect(() => {
    if (presetId === 'custom') {
      const raw = localStorage.getItem(CUSTOM_COLOR_KEY);
      if (raw) {
        try {
          const c = JSON.parse(raw);
          const palette = buildM3Palette({ primary: c.primary, secondary: c.secondary, tertiary: c.tertiary }, colorMode);
          setCurrentPalette(palette);
          updateCSSVariables(palette);
          return;
        } catch (_) { /* fall through */ }
      }
    }
    buildAndApply(presetId, colorMode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const primaryColor = currentPalette.primary.main;

  return (
    <ThemeContext.Provider value={{
      primaryColor,
      presetColor: primaryColor,
      currentPalette,
      presetId,
      setPreset,
      setPrimaryColor: setCustomColor,
      colorMode,
      toggleColorMode,
      presets: presetColors,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeColor() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeColor must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
