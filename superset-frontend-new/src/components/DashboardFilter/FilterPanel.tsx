import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';
import api from '@/api';
import type { FilterConfig, FilterState } from './types';

interface FilterPanelProps {
  filters: FilterConfig[];
  filterState: FilterState;
  onFilterChange: (id: string, value: unknown) => void;
  pendingFilterIds?: string[];
}

function formatTimeLabel(v: unknown): string {
  const s = String(v ?? '');
  if (!s || s === 'null') return s;
  const num = Number(s);
  if (!isNaN(num) && num > 100000) {
    const d = new Date(num);
    if (d.getFullYear() > 1900 && d.getFullYear() < 2100) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return s;
}

function FilterSelect({
  filter,
  value,
  onChange,
}: {
  filter: FilterConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/datasource/table/${filter.datasetId}/column/${encodeURIComponent(filter.column)}/values/`);
        const raw: unknown[] = res.data?.result || [];
        const values: { label: string; value: string }[] = raw
          .filter((v): v is string => v != null)
          .map(v => ({ value: String(v), label: filter.columnType === 'time' ? formatTimeLabel(v) : String(v) }));
        if (!cancelled) setOptions(values);
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter.datasetId, filter.column, filter.columnType]);

  const selected = useMemo(() => {
    if (Array.isArray(value)) return (value as string[]).map(v => ({ value: v, label: filter.columnType === 'time' ? formatTimeLabel(v) : v }));
    if (value === undefined || value === null || value === '') return [];
    return [{ value: String(value), label: filter.columnType === 'time' ? formatTimeLabel(value) : String(value) }];
  }, [value, filter.columnType]);

  return (
    <Autocomplete<{ label: string; value: string }, true, false, false>
      multiple
      size="small"
      loading={loading}
      options={options}
      value={selected}
      inputValue={inputValue}
      onInputChange={(_, v) => setInputValue(v)}
      onChange={(_, v) => onChange(v ? v.map(x => x.value) : [])}
      filterSelectedOptions
      disableCloseOnSelect
      limitTags={2}
      getOptionLabel={o => o.label}
      isOptionEqualToValue={(o, v) => o.value === v.value}
      sx={{
        '& .MuiInputBase-root': { minHeight: 36 },
        '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8125rem', minWidth: 60 },
      }}
      slotProps={{
        chip: { size: 'small', sx: { height: 20 } },
        popper: { sx: { '& .MuiAutocomplete-listbox .MuiAutocomplete-option': { minHeight: 28, fontSize: '0.8125rem' } } },
      }}
      renderInput={params => (
        <TextField
          {...params}
          label={filter.name}
          placeholder="Select..."
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={14} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}

function FilterText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [local, setLocal] = useState(String(value || ''));
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocal(String(value || ''));
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(v || undefined);
    }, 300);
  };

  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      placeholder="Type..."
      value={local}
      onChange={e => handleChange(e.target.value)}
      sx={{
        '& .MuiInputBase-root': { minHeight: 36 },
        '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8125rem' },
      }}
    />
  );
}

function FilterNumericalRange({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const range = (Array.isArray(value) ? value : [undefined, undefined]) as [number | undefined, number | undefined];

  const rangeSx = {
    flex: 1,
    '& .MuiInputBase-root': { minHeight: 36 },
    '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8125rem' },
  };
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
      <TextField
        size="small"
        type="number"
        placeholder="Min"
        value={range[0] ?? ''}
        onChange={e => {
          const min = e.target.value ? Number(e.target.value) : undefined;
          onChange([min, range[1]]);
        }}
        sx={rangeSx}
      />
      <Typography variant="body2" color="text.secondary">—</Typography>
      <TextField
        size="small"
        type="number"
        placeholder="Max"
        value={range[1] ?? ''}
        onChange={e => {
          const max = e.target.value ? Number(e.target.value) : undefined;
          onChange([range[0], max]);
        }}
        sx={rangeSx}
      />
    </Box>
  );
}

function renderFilterControl(
  filter: FilterConfig,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  switch (filter.filterType) {
    case 'text':
      return <FilterText label={filter.name} value={value} onChange={onChange} />;
    case 'numerical_range':
      return <FilterNumericalRange value={value} onChange={onChange} />;
    case 'value':
    case 'filter_select':
    default:
      return <FilterSelect filter={filter} value={value} onChange={onChange} />;
  }
}

export default function FilterPanel({
  filters,
  filterState,
  onFilterChange,
  pendingFilterIds,
}: FilterPanelProps) {
  const [visibleIds, setVisibleIds] = useState<Set<string> | null>(null);
  const consumedPendingRef = useRef<Set<string>>(new Set());

  const visibleFilters = useMemo(() => {
    if (visibleIds) {
      return filters.filter(f => visibleIds.has(f.id));
    }
    return filters.slice(0, 8);
  }, [filters, visibleIds]);

  const initVisibleIds = useCallback(() => {
    if (!visibleIds && filters.length > 0) {
      setVisibleIds(new Set(filters.slice(0, 8).map(f => f.id)));
    }
  }, [visibleIds, filters]);

  useEffect(() => { initVisibleIds(); }, [initVisibleIds]);

  useEffect(() => {
    if (pendingFilterIds && visibleIds) {
      let changed = false;
      const next = new Set(visibleIds);
      for (const id of pendingFilterIds) {
        if (!consumedPendingRef.current.has(id)) {
          consumedPendingRef.current.add(id);
          next.add(id);
          changed = true;
        }
      }
      if (changed) setVisibleIds(next);
    }
  }, [pendingFilterIds, visibleIds]);

  const handleRemoveFilter = useCallback((id: string) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return (
    <Box sx={{ px: 1.25, py: 0.5 }}>
      {filters.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No filters configured for this dashboard.
        </Typography>
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 0.75,
          mt: 0.5,
        }}>
          {visibleFilters.map(filter => (
            <Box key={filter.id} sx={{ position: 'relative' }}>
              <IconButton
                size="small"
                onClick={() => handleRemoveFilter(filter.id)}
                sx={{ position: 'absolute', top: 0, right: 0, zIndex: 1, p: 0.125, color: '#fff', bgcolor: 'error.main', '&:hover': { bgcolor: 'error.dark' }, width: 14, height: 14, minWidth: 0 }}
              >
                <CloseIcon sx={{ fontSize: 8 }} />
              </IconButton>
              {filter.filterType === 'numerical_range' ? (
                <Typography variant="caption" sx={{ fontWeight: 500, mb: 0.125, display: 'block', lineHeight: 1.4 }}>
                  {filter.name}
                </Typography>
              ) : null}
              {renderFilterControl(
                filter,
                filterState[filter.id]?.value,
                (value: unknown) => onFilterChange(filter.id, value),
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
