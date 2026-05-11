import React from 'react';
import { Dialog, DialogContent, DialogTransition } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  Radio,
  FormControlLabel,
  ToggleButtonGroup,
  ToggleButton,
  Paper,
  Button,
  Tooltip,
} from '@mui/material';
import Undo from '@mui/icons-material/Undo';

/**
 * FullscreenModal component - full-screen view for widgets with controls
 */
export default function FullscreenModal({
  isOpen,
  onClose,
  title,
  children,
  config,
  dateField,
  hasRealDateField,
  dimensionColumns,
  fullscreenDimension,
  fullscreenChartType,
  setFullscreenDimension,
  setFullscreenChartType,
  onSave,
  onReset,
  onCopyTable,
  copied,
  pendingVisibleFields,
  pendingMetricIds,
  originalVisibleFields,
  originalMetricIds,
}) {
  const defaultDimensionValue = hasRealDateField ? dateField : 'default';
  const currentDimensionValue = fullscreenDimension || defaultDimensionValue;

  // Check if there are pending changes
  const hasPendingFieldChanges = pendingVisibleFields && (
    (originalVisibleFields || []).length !== pendingVisibleFields.length ||
    !(originalVisibleFields || []).every(f => pendingVisibleFields.includes(f))
  );
  const hasPendingMetricChanges = pendingMetricIds && (
    (originalMetricIds || []).length !== pendingMetricIds.length ||
    !(originalMetricIds || []).every(id => pendingMetricIds.includes(id))
  );
  const hasAnyPendingChanges = hasPendingFieldChanges || hasPendingMetricChanges;

  const pendingChangeCount = (() => {
    let count = 0;
    if (hasPendingFieldChanges && pendingVisibleFields && originalVisibleFields) {
      const orig = new Set(originalVisibleFields.map(f => f.toLowerCase()));
      const pend = new Set(pendingVisibleFields.map(f => f.toLowerCase()));
      for (const f of orig) if (!pend.has(f)) count++;
      for (const f of pend) if (!orig.has(f)) count++;
    }
    if (hasPendingMetricChanges && pendingMetricIds && originalMetricIds) {
      const orig = new Set(originalMetricIds.map(Number));
      const pend = new Set(pendingMetricIds.map(Number));
      for (const id of orig) if (!pend.has(id)) count++;
      for (const id of pend) if (!orig.has(id)) count++;
    }
    return count;
  })();

  const handleDimensionChange = (event) => {
    const value = event.target.value;
    if (value === defaultDimensionValue && hasRealDateField) {
      setFullscreenDimension(dateField);
    } else {
      setFullscreenDimension(value);
    }
  };

  const handleChartTypeChange = (event, newType) => {
    if (newType !== null) {
      setFullscreenChartType(newType === 'auto' ? null : newType);
    }
  };

  return (
    <Dialog open={isOpen} onClose={() => { document.activeElement?.blur(); onClose(); }} fullScreen slots={{ transition: DialogTransition }}>
      <DialogContent
        variant="fullscreen"
        showClose={false}
        sx={{ display: 'flex', flexDirection: 'column', p: 0 }}
      >
        {/* Header with title and controls combined */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 2,
            py: 1,
            minHeight: 48,
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexShrink: 0,
            backgroundColor: 'background.paper',
          }}
        >
          {/* Title */}
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              flexShrink: 0,
              pr: 1,
              borderRight: '1px solid',
              borderColor: 'divider',
            }}
          >
            {title}
          </Typography>

          {/* Dimension Radio Group - only show date options if table has real date field */}
          {hasRealDateField && (
            <Paper
              elevation={0}
              sx={{
                display: 'flex',
                alignItems: 'center',
                height: 32,
                px: 1,
                borderRadius: 2,
                backgroundColor: 'var(--mui-palette-bg-selected)',
                gap: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.75rem',
                  color: 'var(--mui-palette-primary-main)',
                  pr: 0.5,
                  borderRight: '1px solid var(--mui-palette-border-medium)',
                  flexShrink: 0,
                }}
              >
                维度
              </Typography>
              <RadioGroup
                row
                value={currentDimensionValue}
                onChange={handleDimensionChange}
                sx={{
                  gap: 0.5,
                  '& .MuiFormControlLabel-root': {
                    mr: 0,
                    px: 1,
                    height: 28,
                    borderRadius: 1,
                    cursor: 'pointer',
                    transition: 'background-color 150ms',
                    '&:hover': {
                      backgroundColor: 'background.paper',
                    },
                  },
                  '& .MuiRadio-root': {
                    p: 0.25,
                    '&.Mui-checked': {
                      color: 'primary.main',
                    },
                  },
                  '& .MuiTypography-root': {
                    fontSize: '0.75rem',
                  },
                }}
              >
                <FormControlLabel
                  value={defaultDimensionValue}
                  control={<Radio size="small" />}
                  label="天"
                />
                <FormControlLabel
                  value="week"
                  control={<Radio size="small" />}
                  label="周"
                />
                <FormControlLabel
                  value="month"
                  control={<Radio size="small" />}
                  label="月"
                />
              </RadioGroup>
            </Paper>
          )}

          {/* Other dimension select */}
          {dimensionColumns.length > 0 && !hasRealDateField && (
            <Paper
              elevation={0}
              sx={{
                display: 'flex',
                alignItems: 'center',
                height: 32,
                px: 1,
                borderRadius: 2,
                backgroundColor: 'var(--mui-palette-bg-selected)',
                gap: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.75rem',
                  color: 'var(--mui-palette-primary-main)',
                  pr: 0.5,
                  borderRight: '1px solid var(--mui-palette-border-medium)',
                  flexShrink: 0,
                }}
              >
                维度
              </Typography>
              <FormControl size="small" sx={{ minWidth: 100, '& .MuiOutlinedInput-root': { height: 28 } }}>
                <InputLabel id="dimension-select-label">选择</InputLabel>
                <Select
                  labelId="dimension-select-label"
                  label="选择"
                  value={fullscreenDimension || ''}
                  onChange={(e) => setFullscreenDimension(e.target.value)}
                  onClose={() => document.activeElement?.blur()}
                >
                  {dimensionColumns.map((c) => (
                    <MenuItem key={c.column_name} value={c.column_name}>
                      {c.column_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Paper>
          )}

          {/* Combined: date options + other dimensions */}
          {hasRealDateField && dimensionColumns.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 100, '& .MuiOutlinedInput-root': { height: 28 } }}>
              <InputLabel id="dimension-select-label">其他</InputLabel>
              <Select
                labelId="dimension-select-label"
                label="其他"
                value={fullscreenDimension && !['week', 'month'].includes(fullscreenDimension) && fullscreenDimension !== dateField ? fullscreenDimension : ''}
                onChange={(e) => setFullscreenDimension(e.target.value)}
                onClose={() => document.activeElement?.blur()}
              >
                {dimensionColumns.map((c) => (
                  <MenuItem key={c.column_name} value={c.column_name}>
                    {c.column_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Chart type Toggle Button Group */}
          <Paper
            elevation={0}
            sx={{
              display: 'flex',
              alignItems: 'center',
              height: 32,
              px: 1,
              borderRadius: 2,
              backgroundColor: 'var(--mui-palette-status-successBg)',
              gap: 1,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.75rem',
                color: 'var(--mui-palette-status-successLight)',
                pr: 0.5,
                borderRight: '1px solid var(--mui-palette-status-successBg)',
                flexShrink: 0,
              }}
            >
              图表
            </Typography>
            <ToggleButtonGroup
              value={fullscreenChartType || 'auto'}
              exclusive
              onChange={handleChartTypeChange}
              size="small"
              sx={{
                '& .MuiToggleButtonGroup-grouped': {
                  m: 0,
                  borderRadius: 1,
                  border: 'none',
                  px: 0.75,
                  height: 28,
                  backgroundColor: 'transparent',
                  '&.Mui-selected': {
                    backgroundColor: 'background.paper',
                    color: 'primary.main',
                    '&:hover': {
                      backgroundColor: 'background.paper',
                    },
                  },
                  '&:hover': {
                    backgroundColor: 'background.paper',
                  },
                },
              }}
            >
              <ToggleButton value="auto" title="自动">
                <Icon name="sparkles" size={14} />
              </ToggleButton>
              <ToggleButton value="bar" title="柱状图">
                <Icon name="barChart3" size={14} />
              </ToggleButton>
              <ToggleButton value="line" title="折线图">
                <Icon name="lineChart" size={14} />
              </ToggleButton>
              <ToggleButton value="area" title="面积图">
                <Icon name="areaChart" size={14} />
              </ToggleButton>
              <ToggleButton value="pie" title="饼图">
                <Icon name="pieChart" size={14} />
              </ToggleButton>
              <ToggleButton value="table" title="表格">
                <Icon name="table" size={14} />
              </ToggleButton>
            </ToggleButtonGroup>
          </Paper>

           {/* Reset and Save buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 32 }}>
            {(fullscreenDimension || fullscreenChartType || hasAnyPendingChanges) && (
              <>
                <Button
                  size="small"
                  color="inherit"
                  sx={{ height: 28 }}
                  startIcon={<Undo />}
                  onClick={() => {
                    setFullscreenDimension(null);
                    setFullscreenChartType(null);
                    if (onReset) onReset();
                  }}
                >
                  重置{hasAnyPendingChanges && pendingChangeCount > 0 ? ` (${pendingChangeCount})` : ''}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  sx={{ height: 28 }}
                  onClick={onSave}
                  disabled={!hasAnyPendingChanges && !fullscreenDimension && !fullscreenChartType}
                >
                  保存{hasAnyPendingChanges && pendingChangeCount > 0 ? ` (${pendingChangeCount})` : ''}
                </Button>
              </>
            )}
          </Box>

          {/* Close button - right aligned */}
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
            <Tooltip title="复制表格">
              <Box
                component="button"
                onClick={() => { document.activeElement?.blur(); onCopyTable?.(); }}
                sx={{
                  p: 0.5,
                  color: 'text.secondary',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  '&:hover': {
                    color: 'text.primary',
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                <Icon name={copied ? 'check' : 'copy'} size={16} />
              </Box>
            </Tooltip>
            <Tooltip title="关闭">
              <Box
                component="button"
                onClick={() => { document.activeElement?.blur(); onClose(); }}
                sx={{
                  p: 0.5,
                  color: 'text.secondary',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  '&:hover': {
                    color: 'text.primary',
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                <Icon name="x" size={18} />
              </Box>
            </Tooltip>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'hidden', px: 2, py: 1.5 }}>{children}</Box>
      </DialogContent>
    </Dialog>
  );
}