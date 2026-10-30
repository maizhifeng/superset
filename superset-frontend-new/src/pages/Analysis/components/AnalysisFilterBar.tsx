import { useEffect, useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  defaultFilters,
  FILTER_DEFINITIONS,
  RANGE_OPTIONS,
  resolveDateBounds,
  type AnalysisFilters,
  type FilterKey,
  type RangeValue,
} from "../filters";
import { fetchFilterValues } from "../filterValues";
import type { AnalysisTopic } from "../types";

type FilterOptions = Record<FilterKey, string[]>;

const EMPTY_OPTIONS: FilterOptions = {
  games: [],
  regions: [],
  media: [],
  channels: [],
  platforms: [],
};

/** Placeholder shown by every empty multi-select ("no restriction"). */
const ALL_PLACEHOLDER = "全部";

function mergeOptions(selected: string[], options: string[]): string[] {
  return Array.from(new Set([...selected, ...options])).sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}

/**
 * Whether the current filters still equal the topic defaults.  Used to keep
 * 重置 disabled: with an empty filter bar the button would do nothing, and an
 * always-enabled reset reads as if a filter were active.
 */
function isDefaultFilters(
  filters: AnalysisFilters,
  topic: AnalysisTopic,
): boolean {
  const defaults = defaultFilters(topic);
  if (filters.range !== defaults.range) return false;
  if (filters.start || filters.end || filters.focusDate || filters.focusWeek) {
    return false;
  }
  if (filters.dimension !== defaults.dimension) return false;
  const hasDrill = FILTER_DEFINITIONS.some(
    (definition) => (filters.drill?.[definition.key] ?? []).length > 0,
  );
  if (hasDrill) return false;
  return FILTER_DEFINITIONS.every(
    (definition) => filters[definition.key].length === 0,
  );
}

export default function AnalysisFilterBar({
  topic,
  filters,
  onChange,
}: {
  topic: AnalysisTopic;
  filters: AnalysisFilters;
  onChange: (next: AnalysisFilters) => void;
}) {
  const [options, setOptions] = useState<FilterOptions>(EMPTY_OPTIONS);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadingOptions(true);
    void Promise.all(
      FILTER_DEFINITIONS.map(async (definition) => {
        try {
          // filterValues.ts caches per column, so remounting a topic page or
          // revisiting it within the TTL does not repeat these requests.
          const values = await fetchFilterValues(
            definition.column,
            controller.signal,
          );
          return [definition.key, values] as const;
        } catch {
          return [definition.key, [] as string[]] as const;
        }
      }),
    )
      .then((entries) => {
        if (!active) return;
        setOptions(Object.fromEntries(entries) as FilterOptions);
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const selectedValues = useMemo(
    () => ({
      games: filters.games,
      regions: filters.regions,
      media: filters.media,
      channels: filters.channels,
      platforms: filters.platforms,
    }),
    [filters],
  );

  const defaultsApplied = isDefaultFilters(filters, topic);

  const updateRange = (range: RangeValue) => {
    if (range === "custom") {
      const bounds = resolveDateBounds(filters);
      onChange({ ...filters, range, ...bounds, focusDate: undefined });
      return;
    }
    onChange({
      ...filters,
      range,
      start: undefined,
      end: undefined,
      focusDate: undefined,
    });
  };

  return (
    // The wrapper is one flex item inside the PageFrame toolbar, which already
    // handles desktop wrapping and mobile horizontal scrolling.  The top
    // padding on small screens leaves room for the floated field labels, which
    // the toolbar's overflow-x scroller would otherwise clip.
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: { xs: "nowrap", md: "wrap" },
        minWidth: 0,
        flex: 1,
        pt: { xs: 1.25, md: 0 },
      }}
    >
      <TextField
        select
        size="small"
        label="日期范围"
        value={filters.range}
        onChange={(event) => updateRange(event.target.value as RangeValue)}
        sx={{ minWidth: 124 }}
      >
        {RANGE_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>

      {filters.range === "custom" && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <DatePicker
            label="开始日期"
            value={filters.start ? dayjs(filters.start) : null}
            onChange={(value) => {
              if (!value?.isValid()) return;
              const start = value.format("YYYY-MM-DD");
              const end =
                filters.end && filters.end < start ? start : filters.end;
              onChange({
                ...filters,
                range: "custom",
                start,
                end,
                focusDate: undefined,
              });
            }}
            format="YYYY-MM-DD"
            slotProps={{ textField: { size: "small", sx: { width: 150 } } }}
          />
          <DatePicker
            label="结束日期"
            value={filters.end ? dayjs(filters.end) : null}
            onChange={(value) => {
              if (!value?.isValid()) return;
              onChange({
                ...filters,
                range: "custom",
                end: value.format("YYYY-MM-DD"),
                focusDate: undefined,
              });
            }}
            format="YYYY-MM-DD"
            minDate={filters.start ? dayjs(filters.start) : undefined}
            slotProps={{ textField: { size: "small", sx: { width: 150 } } }}
          />
        </Box>
      )}

      {FILTER_DEFINITIONS.map((definition) => {
        const selected = selectedValues[definition.key];
        return (
          <Autocomplete
            key={definition.key}
            multiple
            size="small"
            disableCloseOnSelect
            // Two chips keep the selected filter readable without letting the
            // row overflow; the remaining count collapses into "+N".
            limitTags={2}
            loading={loadingOptions}
            loadingText="加载中…"
            noOptionsText="无匹配选项"
            options={mergeOptions(selected, options[definition.key])}
            value={selected}
            onChange={(_, value) =>
              onChange({ ...filters, [definition.key]: value })
            }
            renderInput={(params) => {
              const { slotProps: inputSlotProps, ...inputParams } = params;
              return (
                <TextField
                  {...inputParams}
                  label={definition.label}
                  // A shrunk label keeps the "全部" placeholder visible while
                  // the field is at rest, so an empty filter reads as
                  // "no restriction" instead of a blank box.  Merge the
                  // Autocomplete-provided slot props instead of replacing
                  // them, or the input ref is lost.
                  slotProps={{
                    ...inputSlotProps,
                    inputLabel: { ...inputSlotProps.inputLabel, shrink: true },
                  }}
                  placeholder={
                    selected.length === 0 ? ALL_PLACEHOLDER : undefined
                  }
                />
              );
            }}
            sx={{
              minWidth: definition.key === "games" ? 190 : 150,
              maxWidth: 260,
              // Nudge the placeholder up so it sits on the same baseline as a
              // filled date Select in the same toolbar row.  MUI's own
              // Autocomplete input rule wins without ``!important``.
              "& .MuiAutocomplete-input": {
                paddingTop: "1.5px !important",
                paddingBottom: "3.5px !important",
              },
            }}
          />
        );
      })}

      <Button
        size="small"
        variant="text"
        startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
        onClick={() => onChange(defaultFilters(topic))}
        disabled={defaultsApplied}
        sx={{ textTransform: "none", flexShrink: 0 }}
      >
        重置
      </Button>
    </Box>
  );
}
