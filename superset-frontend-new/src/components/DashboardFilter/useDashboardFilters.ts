import { useState, useMemo, useCallback, useLayoutEffect } from "react";
import type {
  FilterConfig,
  FilterState,
  UseDashboardFiltersResult,
  NativeFilterConfigRaw,
  AdhocFilter,
} from "./types";

function parseJsonMetadata(
  jsonMetadata: string | undefined | null,
): NativeFilterConfigRaw[] {
  if (!jsonMetadata) return [];
  try {
    const parsed = JSON.parse(jsonMetadata);
    const configs = parsed.native_filter_configuration;
    if (Array.isArray(configs)) return configs as NativeFilterConfigRaw[];
    return [];
  } catch {
    return [];
  }
}

function normalizeFilterType(rawType: string): FilterConfig["filterType"] {
  switch (rawType) {
    case "filter_select":
    case "value":
      return "value";
    case "text":
      return "text";
    case "numerical_range":
      return "numerical_range";
    case "time_range":
    case "time_column":
    case "time_grain":
      return "time_range";
    default:
      return "value";
  }
}

interface AutoDimension {
  datasetId: number;
  column: string;
  name: string;
  columnType?: "time" | "string" | "numeric";
}

export default function useDashboardFilters(
  jsonMetadata: string | undefined | null,
  autoDimensions: AutoDimension[],
): UseDashboardFiltersResult {
  const nativeConfigs = useMemo(
    () => parseJsonMetadata(jsonMetadata),
    [jsonMetadata],
  );

  const filters = useMemo<FilterConfig[]>(() => {
    if (nativeConfigs.length > 0) {
      return nativeConfigs.map((cfg) => {
        const target = cfg.targets?.[0];
        return {
          id: cfg.id,
          name:
            cfg.name ||
            target?.column?.displayName ||
            target?.column?.name ||
            "Filter",
          filterType: normalizeFilterType(cfg.filterType),
          datasetId: target?.datasetId ?? 0,
          column: target?.column?.name || "",
          controlValues: cfg.controlValues,
          chartsInScope: cfg.chartsInScope,
          defaultDataMask: cfg.defaultDataMask,
          description: cfg.description,
          cascadeParentIds: cfg.cascadeParentIds,
        };
      });
    }

    return autoDimensions.map((dim, idx) => ({
      id: `dim_${idx}`,
      name: dim.name,
      filterType: dim.columnType === "time" ? "time_range" : "value",
      datasetId: dim.datasetId,
      column: dim.column,
      columnType: dim.columnType,
    }));
  }, [nativeConfigs, autoDimensions]);

  const [filterState, setFilterState] = useState<FilterState>({});

  const now = useMemo(() => new Date(), []);
  const currentMonthRange = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return [
      `${y}/${m}/01`,
      `${y}/${m}/${String(lastDay).padStart(2, "0")}`,
    ] as [string, string];
  }, [now]);

  useLayoutEffect(() => {
    setFilterState((prev) => {
      let updated = false;
      const next = { ...prev };
      for (const filter of filters) {
        if (filter.filterType !== "time_range") continue;
        if (next[filter.id]?.value) continue;
        const defaultValue = filter.defaultDataMask?.filterState?.value;
        if (defaultValue !== undefined && defaultValue !== null) {
          next[filter.id] = { value: defaultValue };
        } else {
          next[filter.id] = { value: currentMonthRange };
        }
        updated = true;
      }
      return updated ? next : prev;
    });
  }, [filters, currentMonthRange]);

  useLayoutEffect(() => {
    setFilterState((prev) => {
      let updated = false;
      const next = { ...prev };
      for (const filter of filters) {
        const defaultValue = filter.defaultDataMask?.filterState?.value;
        if (defaultValue === undefined || defaultValue === null) continue;
        if (next[filter.id]?.value) continue;
        next[filter.id] = { value: defaultValue };
        updated = true;
      }
      return updated ? next : prev;
    });
  }, [filters]);

  const setFilter = useCallback(
    (id: string, value: unknown, extraFormData?: Record<string, unknown>) => {
      setFilterState((prev) => ({
        ...prev,
        [id]: {
          value,
          extraFormData: extraFormData || prev[id]?.extraFormData,
        },
      }));
    },
    [],
  );

  const clearAll = useCallback(() => {
    const defaults: FilterState = {};
    for (const filter of filters) {
      const defaultValue = filter.defaultDataMask?.filterState?.value;
      if (defaultValue !== undefined && defaultValue !== null) {
        defaults[filter.id] = { value: defaultValue };
      }
    }
    for (const filter of filters) {
      if (filter.filterType !== "time_range") continue;
      if (defaults[filter.id]?.value) continue;
      defaults[filter.id] = { value: currentMonthRange };
    }
    setFilterState(defaults);
  }, [filters, currentMonthRange]);

  const activeCount = useMemo(() => {
    let count = 0;
    for (const state of Object.values(filterState)) {
      const v = state.value;
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      count++;
    }
    return count;
  }, [filterState]);

  const buildAdhocFilters = useCallback(
    (datasetId?: number): AdhocFilter[] => {
      const result: AdhocFilter[] = [];

      for (const filter of filters) {
        if (
          datasetId !== undefined &&
          filter.datasetId !== 0 &&
          filter.datasetId !== datasetId
        ) {
          continue;
        }
        const state = filterState[filter.id];
        if (!state) continue;
        const v = state.value;
        if (v === undefined || v === null || v === "") continue;

        if (Array.isArray(v) && v.length === 0) continue;

        if (filter.filterType === "time_range" && Array.isArray(v)) {
          const [start, end] = v as [
            string | null | undefined,
            string | null | undefined,
          ];
          if (start) {
            result.push({
              clause: "WHERE",
              expressionType: "SIMPLE",
              subject: filter.column,
              operator: ">=",
              comparator: start,
            });
          }
          if (end) {
            result.push({
              clause: "WHERE",
              expressionType: "SIMPLE",
              subject: filter.column,
              operator: "<=",
              comparator: end,
            });
          }
        } else if (
          filter.filterType === "numerical_range" &&
          Array.isArray(v)
        ) {
          const [min, max] = v as [number | undefined, number | undefined];
          if (min !== undefined) {
            result.push({
              clause: "WHERE",
              expressionType: "SIMPLE",
              subject: filter.column,
              operator: ">=",
              comparator: String(min),
            });
          }
          if (max !== undefined) {
            result.push({
              clause: "WHERE",
              expressionType: "SIMPLE",
              subject: filter.column,
              operator: "<=",
              comparator: String(max),
            });
          }
        } else if (Array.isArray(v)) {
          result.push({
            clause: "WHERE",
            expressionType: "SIMPLE",
            subject: filter.column,
            operator: "IN",
            comparator: v,
          });
        } else {
          result.push({
            clause: "WHERE",
            expressionType: "SIMPLE",
            subject: filter.column,
            operator: "==",
            comparator: String(v),
          });
        }
      }

      return result;
    },
    [filters, filterState],
  );

  return {
    filters,
    filterState,
    setFilter,
    clearAll,
    buildAdhocFilters,
    activeCount,
    loading: false,
  };
}
