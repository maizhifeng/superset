import React from 'react';
import { useDashboardStore } from '@/store';
import { DATE_RANGE_PRESETS } from '@/utils/formatters';
import {
  Box,
  MenuItem,
  FormControl,
  Select,
  OutlinedInput,
  InputLabel,
} from '@mui/material';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;

/**
 * Permanent date filter - always active, fixed on left side
 * Visual emphasis: left border + primary label color
 */
export const PermanentDateFilter = React.memo(function PermanentDateFilter({ showCustomDate, onCustomDateToggle }) {
  // Granular subscription — only re-renders when dateRange changes
  const dateRange = useDashboardStore(state => state.globalFilters.permanent.dateRange);
  const setDateRange = useDashboardStore(state => state.setDateRange);

  const safeDateRange = dateRange || { start: '', end: '' };

  const getActivePreset = () => {
    if (!safeDateRange?.start || !safeDateRange?.end) return '';
    // Use stored label if available (reliable, avoids date comparison timezone issues)
    if (safeDateRange.label && safeDateRange.label !== 'custom') return safeDateRange.label;
    // Fallback: compare date strings for legacy data without label
    const { start, end } = safeDateRange;
    for (const preset of DATE_RANGE_PRESETS) {
      const { start: ps, end: pe } = preset.getValue();
      if (start === ps && end === pe) return preset.label;
    }
    return 'custom';
  };

  const activePreset = showCustomDate ? 'custom' : getActivePreset();

  const handleChange = (event) => {
    const value = event.target.value;
    if (value === 'custom') {
      onCustomDateToggle(true);
      return;
    }
    const preset = DATE_RANGE_PRESETS.find(p => p.label === value);
    if (preset) {
      const { start, end } = preset.getValue();
      setDateRange({ start, end, label: preset.label });
      onCustomDateToggle(false);
    }
  };

  const getDisplayLabel = () => {
    if (showCustomDate) return '自定义';
    if (!safeDateRange?.start || !safeDateRange?.end) return '';
    const preset = DATE_RANGE_PRESETS.find(p => p.label === activePreset);
    return preset?.label || '自定义';
  };

  const hasValue = Boolean(activePreset);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <FormControl
        size="small"
        sx={{
          minWidth: 80,
          m: 0,
          overflow: 'visible',
          '& .MuiInputLabel-root': {
            fontWeight: 600,
            color: 'var(--mui-palette-primary-main)',
            '&.MuiInputLabel-shrink': {
              color: 'var(--mui-palette-primary-main)',
              fontWeight: 600,
            },
          },
        }}
      >
        <InputLabel id="date-filter-label">时间</InputLabel>
        <Select
          labelId="date-filter-label"
          id="date-filter"
          size="small"
          value={activePreset}
          onChange={handleChange}
          input={<OutlinedInput label="时间" size="small" />}
          slotProps={{
            menu: {
              slotProps: {
                paper: {
                  style: {
                    maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
                    width: 180,
                  },
                },
              },
            },
          }}
          sx={{
            borderRadius: 2,
            backgroundColor: 'var(--mui-palette-background-paper) !important',
            '& .MuiOutlinedInput-notchedOutline': {
              borderWidth: 1,
              borderColor: hasValue ? 'var(--mui-palette-primary-main)' : 'var(--mui-palette-border-medium)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderWidth: 1,
              borderColor: 'var(--mui-palette-primary-main)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderWidth: 2,
              borderColor: 'var(--mui-palette-primary-main)',
            },
          }}
        >
          {DATE_RANGE_PRESETS
            .filter(preset => preset.label !== '本月' && preset.label !== '上月')
             .map(preset => (
              <MenuItem
                key={preset.label}
                value={preset.label}
                sx={{ fontSize: '0.75rem' }}
              >
                {preset.label}
              </MenuItem>
            ))}
          <MenuItem value="custom" sx={{ fontSize: '0.75rem' }}>
            自定义
          </MenuItem>
        </Select>
      </FormControl>

    </Box>
  );
});