import { useState, useMemo, useCallback } from 'react';
import type {
  FilterConfig,
  FilterState,
  UseDashboardFiltersResult,
  NativeFilterConfigRaw,
  ChartFormData,
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

function extractDimensionsFromCharts(
  charts: { id: number; form_data?: Record<string, unknown> | string }[],
): { datasetId: number; column: string; name: string }[] {
  const seen = new Set<string>();
  const result: { datasetId: number; column: string; name: string }[] = [];

  for (const chart of charts) {
    const fd: ChartFormData = typeof chart.form_data === 'string'
      ? JSON.parse(chart.form_data)
      : (chart.form_data || {});
    let dsId = fd.datasource
      ? (typeof fd.datasource === 'string'
        ? Number(fd.datasource.split('__')[0])
        : (fd.datasource as { id?: number }).id ?? 0)
      : 0;
    if (!dsId) dsId = 0;

    const dimensions = fd.groupby || fd.columns || [];
    const dimList = Array.isArray(dimensions) ? dimensions : [];

    for (const dim of dimList) {
      const key = `${dsId}:${dim}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ datasetId: dsId, column: dim, name: dim });
      }
    }
  }
  return result;
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

export default function useDashboardFilters(
  jsonMetadata: string | undefined | null,
  charts: { id: number; form_data?: Record<string, unknown> | string }[],
): UseDashboardFiltersResult {
  const nativeConfigs = useMemo(() => parseJsonMetadata(jsonMetadata), [jsonMetadata]);
  const dimensionSources = useMemo(() => extractDimensionsFromCharts(charts), [charts]);

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

    return dimensionSources.map((dim, idx) => ({
      id: `dim_${idx}`,
      name: dim.name,
      filterType: 'value' as FilterConfig['filterType'],
      datasetId: dim.datasetId,
      column: dim.column,
    }));
  }, [nativeConfigs, dimensionSources]);

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
