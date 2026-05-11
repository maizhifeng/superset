import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { useDashboardStore } from '@/store';
import { filtersAPI } from '@/api';
import { queryKeys } from '@/api/queryKeys';
import { getFilterConfig, getFallbackOptions } from '@/config/filterConfig';

function hexToRgba(hex, alpha) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return 'rgba(107,122,138,' + alpha + ')';
  return 'rgba(' + parseInt(r[1], 16) + ',' + parseInt(r[2], 16) + ',' + parseInt(r[3], 16) + ',' + alpha + ')';
}

function getPrimaryColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--mui-palette-primary-main').trim() || '#00796B';
}

function getTonalChipColor(index) {
  const primary = getPrimaryColor();
  const tones = [0.88, 0.72, 0.56, 0.44, 0.34, 0.24];
  return hexToRgba(primary, tones[index % tones.length]);
}

function getTonalTextColor(index) {
  const darkBgThreshold = 0.55;
  const tones = [0.88, 0.72, 0.56, 0.44, 0.34, 0.24];
  return tones[index % tones.length] >= darkBgThreshold ? '#fff' : 'var(--mui-palette-text-primary)';
}

const icon = <CheckBoxOutlineBlankIcon fontSize="small" sx={{ color: 'var(--mui-palette-text-secondary)' }} />;
const checkedIcon = <CheckBoxIcon fontSize="small" sx={{ color: 'var(--mui-palette-primary-main)' }} />;

export const ActiveFilterTag = React.memo(function ActiveFilterTag({ filterId }) {
  const config = getFilterConfig(filterId);

  const updateFilterValues = useDashboardStore(state => state.updateFilterValues);
  const storeValues = useDashboardStore(state =>
    state.globalFilters.active.find(f => f.filterId === filterId)?.values || []
  );

  const [draftValues, setDraftValues] = useState(() => [...storeValues]);

  const [muiOpen, setMuiOpen] = useState(false);

  const committedRef = useRef([...draftValues]);
  const draftValuesRef = useRef(draftValues);
  draftValuesRef.current = draftValues;

  // Sync from store on external changes (e.g. reset)
  useEffect(() => {
    if (storeValues.length !== draftValues.length ||
        storeValues.some((v, i) => v !== draftValues[i])) {
      setDraftValues([...storeValues]);
      committedRef.current = [...storeValues];
    }
  }, [storeValues]);

  const commitValues = () => {
    const current = draftValuesRef.current;
    const prev = committedRef.current;
    if (prev.length !== current.length || prev.some((v, i) => v !== current[i])) {
      updateFilterValues(filterId, current);
      committedRef.current = [...current];
    }
  };

  // Commit when popper closes
  const prevOpen = useRef(false);
  useEffect(() => {
    if (prevOpen.current && !muiOpen) {
      commitValues();
    }
    prevOpen.current = muiOpen;
  }, [muiOpen]);

  // Fetch filter options from API
  const { data: optionsData, isLoading: optionsLoading } = useQuery({
    queryKey: queryKeys.filterValues(config?.field),
    queryFn: () => filtersAPI.getValues(config.field),
    enabled: !!config?.field,
    staleTime: 1000 * 60 * 30,
    select: (data) => data?.values || [],
  });

  const options = useMemo(() => {
    if (optionsData?.length > 0) return optionsData;
    return getFallbackOptions(config?.field);
  }, [optionsData, config?.field]);

  // Use local draft values — only committed to store on blur
  const selectedOptions = useMemo(() =>
    draftValues.map((value) => {
      const opt = options?.find(o => o.value === value);
      return { value, label: opt?.label || value };
    }),
    [draftValues, options],
  );

  const handleChange = (event, newOptions) => {
    const newValues = newOptions.map(opt => opt.value);
    setDraftValues(newValues);
    // When popper is closed, commit immediately (e.g. chip delete "X" button)
    // When popper is open, defer commit to onClose via the muiOpen effect
    if (!muiOpen) {
      const prev = committedRef.current;
      if (prev.length !== newValues.length || prev.some((v, i) => v !== newValues[i])) {
        updateFilterValues(filterId, newValues);
        committedRef.current = [...newValues];
      }
    }
  };

  if (!config) return null;

  const hasValue = draftValues.length > 0;

  const renderValue = (value, getCustomizedItemProps) => {
    if (value.length === 0) return [];

    const chips = value.map((option, index) => {
      const { key, ...chipProps } = getCustomizedItemProps({ index });
      const optIndex = options?.findIndex(o => o.value === option.value) ?? index;
      return (
        <Chip
          key={key}
          {...chipProps}
          label={option.label}
          size="small"
          sx={{
            fontSize: '0.65rem',
            height: 20,
            borderRadius: 1,
            bgcolor: getTonalChipColor(optIndex),
            color: getTonalTextColor(optIndex),
            fontWeight: 500,
            '& .MuiChip-label': {
              px: 0.75,
            },
          }}
        />
      );
    });

    return chips;
  };

  const renderOption = (props, option, { selected }) => {
    const { key, ...restProps } = props;
    const optIndex = options?.findIndex(o => o.value === option.value) ?? 0;

    return (
      <li
        key={key}
        {...restProps}
        sx={{
          fontSize: '0.75rem',
          ...(props.sx || {}),
        }}
      >
        {selected ? checkedIcon : icon}
        {selected && (
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: getTonalChipColor(optIndex),
              ml: 1,
            }}
          />
        )}
        <Box sx={{ ml: 1 }}>{option.label}</Box>
      </li>
    );
  };

  const placeholderMinWidth = hasValue ? 80 : 120;

  return (
      <Autocomplete
        multiple
        disableCloseOnSelect
        loading={optionsLoading}
        loadingText="加载选项..."
        open={muiOpen}
        onOpen={() => setMuiOpen(true)}
        onClose={() => setMuiOpen(false)}
        options={options}
        value={selectedOptions}
        onChange={handleChange}

        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, value) => option.value === value.value}
        renderValue={renderValue}
        renderOption={renderOption}
        size="small"
        style={{ minWidth: placeholderMinWidth, paddingLeft: 8 }}
        sx={{
          '& .MuiOutlinedInput-root': {
            paddingTop: '0px !important',
            paddingBottom: '0px !important',
            flexWrap: 'wrap',
            overflow: 'hidden',
            borderRadius: 2,
            backgroundColor: 'var(--mui-palette-background-paper)',
            '& .MuiAutocomplete-input': {
              minWidth: hasValue ? 20 : 60,
              maxWidth: 80,
              flexShrink: 0,
              paddingTop: '8.5px !important',
              paddingBottom: '8.5px !important',
            },
            '& .MuiAutocomplete-tag': {
              flexShrink: 0,
              minWidth: 'auto',
              margin: 0,
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderWidth: 1,
              borderColor: 'var(--mui-palette-border-strong)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderWidth: 1,
              borderColor: 'var(--mui-palette-primary-main)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderWidth: 2,
              borderColor: 'var(--mui-palette-primary-main)',
            },
          },
        }}
        slotProps={{
          paper: {
            sx: {
              maxHeight: 250,
              minWidth: 150,
              width: 'auto',
            },
          },
          popper: {
            placement: 'bottom-start',
            style: { width: 'auto' },
          },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            fullWidth={false}
            label={config.label}
            placeholder={hasValue ? '' : config.label}
          />
        )}
      />
  );
});
