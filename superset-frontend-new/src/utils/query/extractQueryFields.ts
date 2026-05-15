import type { VizType, AdhocMetric, QueryObject } from './types';

const NO_GROUPBY_VIZ: VizType[] = ['big_number'];

function isVizType(v: string): v is VizType {
  return ['line', 'bar', 'pie', 'table', 'big_number', 'auto'].includes(v);
}

export function extractQueryFields(
  formData: Record<string, unknown>,
  vizType?: string,
): { metrics: (string | AdhocMetric)[]; groupby: string[]; columns: string[] } {
  const vt = vizType && isVizType(vizType) ? vizType : undefined;

  const rawMetrics = formData.metrics ?? formData.metric ?? [];
  const metrics = Array.isArray(rawMetrics) ? rawMetrics : [rawMetrics];

  const rawGroupby = formData.groupby ?? formData.columns ?? [];
  let groupby = Array.isArray(rawGroupby) ? rawGroupby : [];

  const rawColumns = formData.columns ?? [];
  const columns = Array.isArray(rawColumns) ? rawColumns : [];

  if (vt && NO_GROUPBY_VIZ.includes(vt)) {
    groupby = [];
  }

  return {
    metrics: metrics.filter(Boolean),
    groupby: groupby.filter(Boolean),
    columns: columns.filter(Boolean),
  };
}

export function buildQueryObject(
  formData: Record<string, unknown>,
  vizType?: string,
): QueryObject {
  const { metrics, groupby, columns } = extractQueryFields(formData, vizType);

  const query: QueryObject = {
    result_type: 'full',
    metrics,
    groupby,
    columns,
  };

  if (formData.granularity_sqla) query.granularity = formData.granularity_sqla as string;
  if (formData.time_range) query.time_range = formData.time_range as string;
  if (formData.adhoc_filters) query.adhoc_filters = formData.adhoc_filters as QueryObject['adhoc_filters'];
  if (formData.row_limit) query.row_limit = formData.row_limit as number;

  return query;
}

export function buildChartQuery(
  formData: Record<string, unknown>,
  vizType?: string,
): { datasource: { id: number; type: 'table' }; queries: QueryObject[]; form_data: Record<string, unknown> } {
  const datasourceStr = formData.datasource as string | undefined;
  let dsId = 0;
  let dsType: 'table' = 'table';
  if (datasourceStr) {
    const parts = datasourceStr.split('__');
    dsId = Number(parts[0]) || 0;
    if (parts[1] === 'query') dsType = 'table';
  }

  const query = buildQueryObject(formData, vizType);

  return {
    datasource: { id: dsId, type: dsType },
    queries: [query],
    form_data: formData,
  };
}
