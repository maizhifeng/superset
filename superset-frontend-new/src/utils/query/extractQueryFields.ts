import type { VizType, AdhocMetric, QueryObject, QueryOrderBy } from "./types";
import type { FormData } from "@/types/api";

const NO_GROUPBY_VIZ: VizType[] = ["big_number"];

const PIVOT_VIZ: VizType[] = ["pivot_table_v2"];

function isVizType(v: string): v is VizType {
  return [
    "line",
    "bar",
    "pie",
    "table",
    "big_number",
    "pivot_table_v2",
    "auto",
  ].includes(v);
}

export function extractQueryFields(
  formData: FormData,
  vizType?: string,
): {
  metrics: (string | AdhocMetric)[];
  groupby: string[];
  columns: string[];
  orderby: QueryOrderBy[];
  order_desc: boolean;
  timeseries_limit_metric: string | AdhocMetric | undefined;
} {
  const vt = vizType && isVizType(vizType) ? vizType : undefined;
  const isPivot = vt ? PIVOT_VIZ.includes(vt) : false;

  const rawMetrics = formData.metrics ?? formData.metric ?? [];
  const metrics = Array.isArray(rawMetrics) ? rawMetrics : [rawMetrics];

  const pivotRows = isPivot
    ? Array.isArray(formData.groupbyRows)
      ? formData.groupbyRows
      : Array.isArray(formData.groupby)
        ? formData.groupby
        : []
    : [];

  let groupby = isPivot
    ? pivotRows
    : Array.isArray(formData.groupby)
      ? formData.groupby
      : [];

  const columns = isPivot
    ? Array.isArray(formData.groupbyColumns)
      ? formData.groupbyColumns
      : Array.isArray(formData.columns)
        ? formData.columns
        : []
    : Array.isArray(formData.columns)
      ? formData.columns
      : [];

  if (vt && NO_GROUPBY_VIZ.includes(vt)) {
    groupby = [];
  }

  if (isPivot) {
    // Superset's query builder collapses `columns = groupby or columns` when a
    // GROUP BY is present (models/helpers.py), which would drop the pivot
    // column dimensions from the generated SQL. Keep `groupby` empty and carry
    // every dimension in `columns` so both row and column dims are grouped on.
    groupby = [];
  }

  const rawOrderby = formData.orderby;
  const orderby = Array.isArray(rawOrderby)
    ? (rawOrderby as QueryOrderBy[])
    : [];

  const order_desc =
    formData.order_desc !== undefined ? Boolean(formData.order_desc) : true;

  const timeseries_limit_metric = formData.timeseries_limit_metric
    ? (formData.timeseries_limit_metric as string | AdhocMetric)
    : undefined;

  return {
    metrics: metrics.filter(Boolean),
    groupby: groupby.filter(Boolean),
    columns: (isPivot
      ? Array.from(new Set([...pivotRows, ...columns]))
      : columns
    ).filter(Boolean),
    orderby,
    order_desc,
    timeseries_limit_metric,
  };
}

export function buildQueryObject(
  formData: FormData,
  vizType?: string,
): QueryObject {
  const {
    metrics,
    groupby,
    columns,
    orderby,
    order_desc,
    timeseries_limit_metric,
  } = extractQueryFields(formData, vizType);

  const query: QueryObject = {
    result_type: "full",
    metrics,
    groupby,
    columns,
  };

  if (formData.granularity_sqla) query.granularity = formData.granularity_sqla;
  if (formData.time_range) query.time_range = formData.time_range;
  if (formData.adhoc_filters)
    query.adhoc_filters =
      formData.adhoc_filters as QueryObject["adhoc_filters"];
  if (formData.row_limit) query.row_limit = formData.row_limit;
  if (formData.row_offset != null) query.row_offset = formData.row_offset;

  if (orderby.length > 0) {
    query.orderby = orderby;
  } else if (groupby.length > 0) {
    query.orderby = [[groupby[0], true]];
  } else if (metrics.length > 0) {
    const ascending = !order_desc;
    query.orderby = [[metrics[0], ascending]];
  }

  if ("order_desc" in formData) query.order_desc = order_desc;
  if (timeseries_limit_metric)
    query.timeseries_limit_metric = timeseries_limit_metric;

  return query;
}

export function buildChartQuery(
  formData: FormData,
  vizType?: string,
): {
  datasource: { id: number; type: "table" };
  queries: QueryObject[];
  form_data: FormData;
} {
  const datasourceStr = formData.datasource;
  let dsId = 0;
  let dsType = "table" as const;
  if (datasourceStr) {
    const parts = datasourceStr.split("__");
    dsId = Number(parts[0]) || 0;
    if (parts[1] === "query") dsType = "table";
  }

  const query = buildQueryObject(formData, vizType);

  return {
    datasource: { id: dsId, type: dsType },
    queries: [query],
    form_data: formData,
  };
}
