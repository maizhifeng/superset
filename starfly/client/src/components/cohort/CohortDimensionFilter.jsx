import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { filtersAPI } from '../../api';

const DIMENSION_OPTIONS = [
  { value: 'platform', label: '平台' },
  { value: 'game_id', label: '游戏' },
  { value: 'channel_id', label: '渠道' },
  { value: 'country', label: '地区' },
];

export default function CohortDimensionFilter({ selected = [], onChange, filters = {}, onFilterChange }) {
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState({});

  useEffect(() => {
    selected.forEach(async (dim) => {
      if (options[dim] !== undefined) return;
      setLoading((prev) => ({ ...prev, [dim]: true }));
      try {
        const res = await filtersAPI.getValues(dim);
        if (res?.success) {
          setOptions((prev) => ({ ...prev, [dim]: res.values }));
        }
      } catch {
        setOptions((prev) => ({ ...prev, [dim]: [] }));
      } finally {
        setLoading((prev) => ({ ...prev, [dim]: false }));
      }
    });
  }, [selected]);

  const handleToggle = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter((d) => d !== value));
      const newFilters = { ...filters };
      delete newFilters[value];
      onFilterChange(newFilters);
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        维度
      </Typography>
      <FormGroup>
        {DIMENSION_OPTIONS.map((dim) => (
          <Box key={dim.value}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={selected.includes(dim.value)}
                  onChange={() => handleToggle(dim.value)}
                />
              }
              label={<Typography variant="body2">{dim.label}</Typography>}
            />
            {selected.includes(dim.value) && (
              <Box sx={{ ml: 2, mb: 1 }}>
                {loading[dim.value] ? (
                  <CircularProgress size={16} sx={{ ml: 1 }} />
                ) : (
                  <Autocomplete
                    multiple
                    size="small"
                    options={options[dim.value] || []}
                    getOptionLabel={(opt) => opt.label || String(opt)}
                    isOptionEqualToValue={(opt, val) => opt.value === val.value}
                    value={filters[dim.value] || []}
                    onChange={(e, newVal) => {
                      onFilterChange({ ...filters, [dim.value]: newVal });
                    }}
                    disableCloseOnSelect
                    renderTags={(tagValue, getTagProps) =>
                      tagValue.map((option, index) => (
                        <Chip
                          label={option.label || option.value}
                          size="small"
                          {...getTagProps({ index })}
                          key={option.value}
                        />
                      ))
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="选择..."
                        sx={{ '& .MuiOutlinedInput-root': { py: 0.3 } }}
                      />
                    )}
                  />
                )}
              </Box>
            )}
          </Box>
        ))}
      </FormGroup>
    </Box>
  );
}
