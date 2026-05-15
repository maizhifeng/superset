export interface NativeFilterColumn {
  name: string;
  displayName?: string;
}

export interface NativeFilterTarget {
  datasetId: number;
  column: NativeFilterColumn;
}

export interface NativeFilterScope {
  rootPath: string[];
  excluded: number[];
}

export interface FilterConfig {
  id: string;
  name: string;
  filterType: 'filter_select' | 'text' | 'value' | 'numerical_range' | 'time_range' | 'time_column' | 'time_grain';
  datasetId: number;
  column: string;
  columnType?: 'time' | 'string' | 'numeric';
  controlValues?: Record<string, unknown>;
  chartsInScope?: number[];
  defaultDataMask?: DataMask;
  description?: string;
  cascadeParentIds?: string[];
}

export interface DataMask {
  extraFormData?: {
    filters?: AdhocFilter[];
    adhoc_filters?: AdhocFilter[];
    time_range?: string;
    granularity_sqla?: string;
    [key: string]: unknown;
  };
  filterState?: {
    value?: unknown;
    [key: string]: unknown;
  };
  ownState?: Record<string, unknown>;
}

export interface AdhocFilter {
  clause: 'WHERE' | 'HAVING';
  expressionType: 'SIMPLE' | 'SQL';
  subject: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'NOT IN' | 'LIKE' | 'IS NULL' | 'IS NOT NULL';
  comparator: string;
}

export interface FilterState {
  [filterId: string]: {
    value: unknown;
    extraFormData?: Record<string, unknown>;
  };
}

export interface UseDashboardFiltersResult {
  filters: FilterConfig[];
  filterState: FilterState;
  setFilter: (id: string, value: unknown, extraFormData?: Record<string, unknown>) => void;
  clearAll: () => void;
  buildAdhocFilters: (datasetId?: number) => AdhocFilter[];
  activeCount: number;
  loading: boolean;
}

export interface NativeFilterConfigRaw {
  id: string;
  name: string;
  filterType: string;
  targets?: { datasetId?: number; column?: { name: string; displayName?: string } }[];
  controlValues?: Record<string, unknown>;
  scope?: NativeFilterScope;
  defaultDataMask?: DataMask;
  chartsInScope?: number[];
  description?: string;
  cascadeParentIds?: string[];
  type?: string;
}

export interface ChartFormData {
  metrics?: unknown;
  metric?: unknown;
  groupby?: string[];
  columns?: string[];
  x?: string;
  y?: string;
  series?: string;
  size?: string;
  datasource?: string | { id?: number; type?: string };
  granularity_sqla?: string;
  time_range?: string;
  [key: string]: unknown;
}
