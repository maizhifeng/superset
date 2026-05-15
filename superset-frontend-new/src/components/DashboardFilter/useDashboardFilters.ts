import { useState, useMemo, useCallback } from 'react';
import type {
  FilterConfig,
  FilterState,
  UseDashboardFiltersResult,
  NativeFilterConfigRaw,
  AdhocFilter,
} from './types';

function parseJsonMetadata(jsonMetadata: string | undefined | null): NativeFilterConfigRaw[] {
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

function normalizeFilterType(rawType: string): FilterConfig['filterType'] {
  switch (rawType) {
    case 'filter_select':
    case 'value':
      return 'value';
    case 'text':
      return 'text';
    case 'numerical_range':
      return 'numerical_range';
    case 'time_range':
      return 'time_range';
    default:
      return 'value';
  }
}

interface AutoDimension {
  datasetId: number; column: string; name: string; columnType?: 'time' | 'string' | 'numeric';
}

export default function useDashboardFilters(
  jsonMetadata: string | undefined | null,
  autoDimensions: AutoDimension[],
): UseDashboardFiltersResult {
  const nativeConfigs = useMemo(() => parseJsonMetadata(jsonMetadata), [jsonMetadata]);

  const filters = useMemo<FilterConfig[]>(() => {
    if (nativeConfigs.length > 0) {
      return nativeConfigs.map(cfg => {
        const target = cfg.targets?.[0];
        return {
          id: cfg.id,
          name: cfg.name || target?.column?.displayName || target?.column?.name || 'Filter',
          filterType: normalizeFilterType(cfg.filterType),
          datasetId: target?.datasetId ?? 0,
          column: target?.column?.name || '',
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
      filterType: 'value' as FilterConfig['filterType'],
      datasetId: dim.datasetId,
      column: dim.column,
      columnType: dim.columnType,
    }));
  }, [nativeConfigs, autoDimensions]);

  const [filterState, setFilterState] = useState<FilterState>({});

  const setFilter = useCallback((id: string, value: unknown, extraFormData?: Record<string, unknown>) => {
    setFilterState(prev => ({
      ...prev,
      [id]: {
        value,
        extraFormData: extraFormData || prev[id]?.extraFormData,
      },
    }));
  }, []);

  const clearAll = useCallback(() => {
    setFilterState({});
  }, []);

  const activeCount = useMemo(() => {
    let count = 0;
    for (const state of Object.values(filterState)) {
      const v = state.value;
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      count++;
    }
    return count;
  }, [filterState]);

  const buildAdhocFilters = useCallback((datasetId?: number): AdhocFilter[] => {
    const result: AdhocFilter[] = [];

    for (const filter of filters) {
      if (datasetId !== undefined && filter.datasetId !== 0 && filter.datasetId !== datasetId) {
        continue;
      }
      const state = filterState[filter.id];
      if (!state) continue;
      const v = state.value;
      if (v === undefined || v === null || v === '') continue;

      if (Array.isArray(v) && v.length === 0) continue;

      if (Array.isArray(v)) {
        result.push({
          clause: 'WHERE',
          expressionType: 'SIMPLE',
          subject: filter.column,
          operator: 'IN',
          comparator: v.join(','),
        });
      } else {
        result.push({
          clause: 'WHERE',
          expressionType: 'SIMPLE',
          subject: filter.column,
          operator: '==',
          comparator: String(v),
        });
      }
    }

    return result;
  }, [filters, filterState]);

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
