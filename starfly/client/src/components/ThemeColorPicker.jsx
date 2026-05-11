import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box, Typography, Popover, IconButton, Tooltip, Slider, TextField, Snackbar,
  ToggleButtonGroup, ToggleButton, Collapse,
} from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import TuneIcon from '@mui/icons-material/Tune';
import { useThemeColor } from '../contexts/ThemeContext';

// ============================================================================
// HSB 转换函数 (用于自定义颜色拾色器)
// ============================================================================

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function rgbToHex(r, g, b) {
  const toHex = (x) => { const h = Math.round(Math.max(0, Math.min(255, x))).toString(16); return h.length === 1 ? '0' + h : h; };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function rgbToHsb(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), b: Math.round(v * 100) };
}

function hsbToRgb(h, s, b) {
  h /= 360; s /= 100; b /= 100;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = b * (1 - s), q = b * (1 - f * s), t = b * (1 - (1 - f) * s);
  let r, g, bv;
  switch (i % 6) {
    case 0: r = b; g = t; bv = p; break;
    case 1: r = q; g = b; bv = p; break;
    case 2: r = p; g = b; bv = t; break;
    case 3: r = p; g = q; bv = b; break;
    case 4: r = t; g = p; bv = b; break;
    case 5: r = b; g = p; bv = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(bv * 255) };
}

function hexToHsb(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 170, s: 60, b: 50 };
  return rgbToHsb(rgb.r, rgb.g, rgb.b);
}

function hsbToHex(h, s, b) {
  const rgb = hsbToRgb(h, s, b);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// ============================================================================
// 颜色历史
// ============================================================================
const HISTORY_KEY = 'theme-color-history';
const MAX_HISTORY = 8;

function loadColorHistory() { try { const s = localStorage.getItem(HISTORY_KEY); return s ? JSON.parse(s) : []; } catch { return []; } }
function saveColorHistory(color) { const h = loadColorHistory(); const nh = [color, ...h.filter(c => c !== color)].slice(0, MAX_HISTORY); localStorage.setItem(HISTORY_KEY, JSON.stringify(nh)); return nh; }

// ============================================================================
// ThemeColorPicker
// ============================================================================

export default function ThemeColorPicker() {
  const { primaryColor, presetColor, setPrimaryColor, currentPalette, presetId, setPreset, colorMode, toggleColorMode, presets } = useThemeColor();
  const [anchorEl, setAnchorEl] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [hsb, setHsb] = useState(() => hexToHsb(primaryColor));
  const [hexInput, setHexInput] = useState(primaryColor);
  const [colorHistory, setColorHistory] = useState(() => loadColorHistory());
  const [showCopySuccess, setShowCopySuccess] = useState(false);

  useEffect(() => {
    if (anchorEl) {
      setHsb(hexToHsb(primaryColor));
      setHexInput(primaryColor.toUpperCase());
    }
  }, [anchorEl, primaryColor]);

  const handleClick = (event) => { setAnchorEl(event.currentTarget); };
  const handleClose = () => { document.activeElement?.blur(); setAnchorEl(null); setShowCustom(false); setColorHistory(saveColorHistory(primaryColor)); };

  const handlePresetSelect = useCallback((id) => { setPreset(id); }, [setPreset]);

  const handleHistorySelect = useCallback((color) => {
    setPrimaryColor(color);
    setHsb(hexToHsb(color));
    setHexInput(color.toUpperCase());
  }, [setPrimaryColor]);

  const handleHsbChange = useCallback((key, value) => {
    const nh = { ...hsb, [key]: value }; setHsb(nh);
    const hex = hsbToHex(nh.h, nh.s, nh.b);
    setHexInput(hex.toUpperCase());
    setPrimaryColor(hex);
  }, [hsb, setPrimaryColor]);

  const handleHexChange = useCallback((event) => {
    const value = event.target.value.toUpperCase(); setHexInput(value);
    if (/^#[0-9A-F]{6}$/i.test(value)) { const nh = hexToHsb(value); setHsb(nh); setPrimaryColor(value); }
  }, [setPrimaryColor]);

  const handleCopy = useCallback(() => { navigator.clipboard.writeText(primaryColor.toUpperCase()); setShowCopySuccess(true); }, [primaryColor]);

  const currentHex = useMemo(() => hsbToHex(hsb.h, hsb.s, hsb.b), [hsb]);
  const hueGradient = 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';
  const satStart = hsbToHex(hsb.h, 0, hsb.b);
  const satEnd = hsbToHex(hsb.h, 100, hsb.b);
  const satGradient = 'linear-gradient(to right, ' + satStart + ', ' + satEnd + ')';
  const briMid = hsbToHex(hsb.h, hsb.s, 50);
  const briGradient = 'linear-gradient(to right, #000000, ' + briMid + ', #ffffff)';

  const open = Boolean(anchorEl);

  const presetEntries = Object.entries(presets);

  return (
    <>
      <Tooltip title="主题配色">
        <IconButton
          size="small"
          onClick={handleClick}
          sx={{ borderRadius: 1, bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}
        >
          <PaletteIcon fontSize="small" sx={{ color: primaryColor }} />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ '& .MuiPopover-paper': { p: 2, borderRadius: 2, minWidth: 340, boxShadow: 'var(--mui-palette-shadow-lg)' } }}
      >
        {/* Header with mode toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>主题配色</Typography>
          <ToggleButtonGroup
            value={colorMode}
            exclusive
            onChange={(e, val) => { if (val) toggleColorMode(); }}
            size="small"
          >
            <ToggleButton value="light" sx={{ px: 1, py: 0.3 }}>
              <LightModeIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="dark" sx={{ px: 1, py: 0.3 }}>
              <DarkModeIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Preset swatches */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 1.5 }}>
          {presetEntries.map(([id, preset]) => {
            const isActive = presetId === id;
            return (
              <Box
                key={id}
                onClick={() => handlePresetSelect(id)}
                sx={{
                  cursor: 'pointer',
                  borderRadius: 2,
                  p: 1,
                  border: '2px solid',
                  borderColor: isActive ? 'primary.main' : 'transparent',
                  transition: 'all 150ms',
                  bgcolor: isActive ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover', borderColor: isActive ? 'primary.main' : 'divider' },
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    height: 32,
                    borderRadius: 1,
                    background: 'linear-gradient(135deg, ' + preset.primary + ' 50%, ' + preset.secondary + ' 100%)',
                    mb: 0.5,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
                <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: isActive ? 600 : 400, textAlign: 'center', display: 'block', color: isActive ? 'text.primary' : 'text.secondary' }}>
                  {preset.name}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Color history */}
        {colorHistory.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>最近使用</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {colorHistory.map((color) => (
                <Box
                  key={color}
                  onClick={() => handleHistorySelect(color)}
                  sx={{
                    width: 22, height: 22, borderRadius: 0.75, bgcolor: color, cursor: 'pointer',
                    transition: 'transform 100ms', border: '1px solid', borderColor: 'divider',
                    '&:hover': { transform: 'scale(1.15)' },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Custom color toggle */}
        <Box sx={{ mb: 1 }}>
          <Box
            onClick={() => setShowCustom(!showCustom)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', py: 0.5, px: 0.5,
              borderRadius: 1, color: 'text.secondary',
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
          >
            <TuneIcon fontSize="small" />
            <Typography variant="caption" sx={{ flex: 1 }}>自定义颜色</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'text.primary' }}>
              {primaryColor.toUpperCase()}
            </Typography>
          </Box>

          <Collapse in={showCustom}>
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Hue */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">色相</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{hsb.h}</Typography>
                </Box>
                <Slider
                  value={hsb.h} onChange={(e, v) => handleHsbChange('h', v)} min={0} max={360} step={1} size="small"
                  sx={{
                    color: 'transparent',
                    '& .MuiSlider-thumb': { width: 14, height: 14, bgcolor: '#fff', border: '2px solid #333', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' },
                    '& .MuiSlider-track': { height: 8, background: hueGradient, borderRadius: 4 },
                    '& .MuiSlider-rail': { height: 8, background: hueGradient, opacity: 0.4, borderRadius: 4 },
                  }}
                />
              </Box>

              {/* Saturation */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">饱和度</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{hsb.s}%</Typography>
                </Box>
                <Slider
                  value={hsb.s} onChange={(e, v) => handleHsbChange('s', v)} min={0} max={100} step={1} size="small"
                  sx={{
                    color: 'transparent',
                    '& .MuiSlider-thumb': { width: 14, height: 14, bgcolor: '#fff', border: '2px solid #333', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' },
                    '& .MuiSlider-track': { height: 8, background: satGradient, borderRadius: 4 },
                    '& .MuiSlider-rail': { height: 8, background: satGradient, opacity: 0.4, borderRadius: 4 },
                  }}
                />
              </Box>

              {/* Brightness */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">明度</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{hsb.b}%</Typography>
                </Box>
                <Slider
                  value={hsb.b} onChange={(e, v) => handleHsbChange('b', v)} min={0} max={100} step={1} size="small"
                  sx={{
                    color: 'transparent',
                    '& .MuiSlider-thumb': { width: 14, height: 14, bgcolor: '#fff', border: '2px solid #333', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' },
                    '& .MuiSlider-track': { height: 8, background: briGradient, borderRadius: 4 },
                    '& .MuiSlider-rail': { height: 8, background: briGradient, opacity: 0.4, borderRadius: 4 },
                  }}
                />
              </Box>

              {/* Color display + HEX input */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: currentHex, border: '2px solid', borderColor: 'divider', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                <TextField
                  value={hexInput} onChange={handleHexChange} size="small"
                  sx={{ flex: 1, '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase' } }}
                  InputProps={{
                    endAdornment: (
                      <Tooltip title="复制颜色值">
                        <IconButton size="small" onClick={handleCopy} sx={{ mr: -0.5 }}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ),
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                H: {hsb.h} S: {hsb.s}% B: {hsb.b}%
              </Typography>
            </Box>
          </Collapse>
        </Box>
      </Popover>

      <Snackbar open={showCopySuccess} onClose={() => setShowCopySuccess(false)} autoHideDuration={2000} message="颜色已复制到剪贴板" anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </>
  );
}
