import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import CloseIcon from "@mui/icons-material/Close";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import rison from "rison";
import api from "@/api";
import type { FilterConfig, FilterState } from "./types";

interface FilterPanelProps {
  filters: FilterConfig[];
  filterState: FilterState;
  onFilterChange: (id: string, value: unknown) => void;
  pendingFilterIds?: string[];
}

function formatTimeLabel(v: unknown): string {
  const s = String(v ?? "");
  if (!s || s === "null") return s;
  const num = Number(s);
  if (!isNaN(num) && num > 1e12 && num < 1e16) {
    const d = new Date(num);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
    return d.toLocaleDateString();
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
  const [options, setOptions] = useState<{ label: string; value: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchValues = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const q: Record<string, unknown> = { page_size: 100, page: 0 };
        if (search) {
          q.filters = [{ col: "value", op: "ct", val: search }];
        }
        const res = await api.get(
          `/datasource/table/${filter.datasetId}/column/${encodeURIComponent(filter.column)}/values/?q=${rison.encode(q)}`,
        );
        const raw: unknown[] = res.data?.result || [];
        const values: { label: string; value: string }[] = raw
          .filter((v): v is string => v != null)
          .map((v) => ({
            value: String(v),
            label:
              filter.columnType === "time" ? formatTimeLabel(v) : String(v),
          }));
        setOptions(values);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [filter.datasetId, filter.column, filter.columnType],
  );

  useEffect(() => {
    fetchValues("");
  }, [fetchValues]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchValues(searchTerm);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchTerm, fetchValues]);

  const selected = useMemo(() => {
    if (Array.isArray(value))
      return (value as string[]).map((v) => ({
        value: v,
        label: filter.columnType === "time" ? formatTimeLabel(v) : v,
      }));
    if (value === undefined || value === null || value === "") return [];
    return [
      {
        value: String(value),
        label:
          filter.columnType === "time" ? formatTimeLabel(value) : String(value),
      },
    ];
  }, [value, filter.columnType]);

  return (
    <Autocomplete<{ label: string; value: string }, true, false, false>
      multiple
      size="small"
      loading={loading}
      options={options}
      value={selected}
      inputValue={searchTerm}
      onInputChange={(_, v) => setSearchTerm(v)}
      onChange={(_, v) => onChange(v ? v.map((x) => x.value) : [])}
      filterSelectedOptions
      disableCloseOnSelect
      openOnFocus
      autoHighlight
      limitTags={2}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(o, v) => o.value === v.value}
      noOptionsText="No matches"
      sx={{
        "& .MuiInputBase-root": { minHeight: 36 },
        "& .MuiInputBase-input": {
          py: 0.5,
          fontSize: "0.8125rem",
          minWidth: 60,
        },
      }}
      slotProps={{
        chip: { size: "small", sx: { height: 20 } },
        popper: {
          sx: {
            "& .MuiAutocomplete-listbox .MuiAutocomplete-option": {
              minHeight: 28,
              fontSize: "0.8125rem",
            },
            "& .MuiPaper-root": { border: "1px solid", borderColor: "divider" },
          },
        },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={filter.name}
          placeholder={searchTerm ? "Type to search..." : "Select..."}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {loading ? (
                    <CircularProgress color="inherit" size={14} />
                  ) : null}
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
  const [local, setLocal] = useState(String(value || ""));
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocal(String(value || ""));
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
      onChange={(e) => handleChange(e.target.value)}
      sx={{
        "& .MuiInputBase-root": { minHeight: 36 },
        "& .MuiInputBase-input": { py: 0.5, fontSize: "0.8125rem" },
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
  const range = (Array.isArray(value) ? value : [undefined, undefined]) as [
    number | undefined,
    number | undefined,
  ];

  const rangeSx = {
    flex: 1,
    "& .MuiInputBase-root": { minHeight: 36 },
    "& .MuiInputBase-input": { py: 0.5, fontSize: "0.8125rem" },
  };
  return (
    <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
      <TextField
        size="small"
        type="number"
        placeholder="Min"
        value={range[0] ?? ""}
        onChange={(e) => {
          const min = e.target.value ? Number(e.target.value) : undefined;
          onChange([min, range[1]]);
        }}
        sx={rangeSx}
      />
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
      <TextField
        size="small"
        type="number"
        placeholder="Max"
        value={range[1] ?? ""}
        onChange={(e) => {
          const max = e.target.value ? Number(e.target.value) : undefined;
          onChange([range[0], max]);
        }}
        sx={rangeSx}
      />
    </Box>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const range = (Array.isArray(value) ? value : [null, null]) as [
    string | null,
    string | null,
  ];
  const start = range[0] ? dayjs(range[0].replace(/\//g, "-")) : null;
  const end = range[1] ? dayjs(range[1].replace(/\//g, "-")) : null;

  const pickerSx = {
    width: 190,
    flexShrink: 0,
    "& .MuiPickersInputBase-root": { minHeight: 36, fontSize: "0.8125rem" },
    "& .MuiPickersInputBase-input": { py: 0.5, fontSize: "0.8125rem" },
    "& .MuiPickersSectionList-sectionContent": { fontSize: "0.8125rem" },
    "& .MuiPickersSectionList-section": {
      display: "inline-flex",
      whiteSpace: "nowrap",
    },
    "& .MuiFormLabel-root": { fontSize: "0.8125rem" },
    "& .MuiSvgIcon-root": { fontSize: 18 },
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box
        sx={{ display: "flex", gap: 0.75, alignItems: "center", minWidth: 0 }}
      >
        <DatePicker
          label={`${label} (from)`}
          value={start}
          onChange={(v) => {
            const s = v?.isValid() ? v.format("YYYY/MM/DD") : null;
            onChange([s, range[1]]);
          }}
          format="YYYY/MM/DD"
          slotProps={{
            textField: {
              size: "small",
              sx: pickerSx,
            },
          }}
        />
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ flexShrink: 0 }}
        >
          —
        </Typography>
        <DatePicker
          label={`${label} (to)`}
          value={end}
          onChange={(v) => {
            const e = v?.isValid() ? v.format("YYYY/MM/DD") : null;
            onChange([range[0], e]);
          }}
          minDate={start ?? undefined}
          format="YYYY/MM/DD"
          slotProps={{
            textField: {
              size: "small",
              sx: pickerSx,
            },
          }}
        />
      </Box>
    </LocalizationProvider>
  );
}

function renderFilterControl(
  filter: FilterConfig,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  switch (filter.filterType) {
    case "text":
      return (
        <FilterText label={filter.name} value={value} onChange={onChange} />
      );
    case "numerical_range":
      return <FilterNumericalRange value={value} onChange={onChange} />;
    case "time_range":
    case "time_column":
    case "time_grain":
      return (
        <FilterDate label={filter.name} value={value} onChange={onChange} />
      );
    case "value":
    case "filter_select":
    default:
      if (filter.columnType === "time" && /_date/i.test(filter.column)) {
        return (
          <FilterDate label={filter.name} value={value} onChange={onChange} />
        );
      }
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
      return filters.filter((f) => visibleIds.has(f.id));
    }
    return filters.slice(0, 8);
  }, [filters, visibleIds]);

  const initVisibleIds = useCallback(() => {
    if (!visibleIds && filters.length > 0) {
      setVisibleIds(new Set(filters.slice(0, 8).map((f) => f.id)));
    }
  }, [visibleIds, filters]);

  useEffect(() => {
    initVisibleIds();
  }, [initVisibleIds]);

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
    setVisibleIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return (
    <Box sx={{ px: 1.25, py: 0.5 }}>
      {filters.length === 0 ? (
        <Box sx={{ py: 2, textAlign: "center" }}>
          <FilterAltOffIcon
            sx={{ fontSize: 28, color: "text.disabled", mb: 0.5 }}
          />
          <Typography variant="body2" color="text.secondary">
            No filters configured for this dashboard.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(4, 1fr)",
            },
            gap: 0.75,
            mt: 0.5,
            overflow: "hidden",
          }}
        >
          {visibleFilters.map((filter) => (
            <Box key={filter.id} sx={{ position: "relative" }}>
              <IconButton
                size="small"
                onClick={() => handleRemoveFilter(filter.id)}
                sx={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  zIndex: 1,
                  p: 0.125,
                  color: "#fff",
                  bgcolor: "error.main",
                  "&:hover": { bgcolor: "error.dark" },
                  width: 14,
                  height: 14,
                  minWidth: 0,
                }}
              >
                <CloseIcon sx={{ fontSize: 8 }} />
              </IconButton>
              {filter.filterType === "numerical_range" ? (
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 500,
                    mb: 0.125,
                    display: "block",
                    lineHeight: 1.4,
                  }}
                >
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
