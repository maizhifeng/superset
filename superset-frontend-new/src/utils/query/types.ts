export type VizType = "line" | "bar" | "pie" | "table" | "big_number" | "auto";

export interface DatasourceKey {
  id: number;
  type: "table" | "query";
}

export interface AdhocMetric {
  expressionType: "SIMPLE" | "SQL";
  column?: { column_name: string };
  aggregate?: string;
  label?: string;
  sqlExpression?: string;
}

export type QueryOrderBy = [string | AdhocMetric, boolean];

export interface SimpleFilter {
  col: string;
  op: string;
  val: string | string[];
}

export interface QueryObject {
  result_type?: "full" | "columns" | "post_processed";
  metrics?: (string | AdhocMetric)[];
  groupby?: string[];
  columns?: string[];
  adhoc_filters?: {
    clause: "WHERE" | "HAVING";
    expressionType: "SIMPLE" | "SQL";
    subject: string;
    operator: string;
    comparator: string;
  }[];
  filters?: SimpleFilter[];
  extras?: Record<string, unknown>;
  granularity?: string;
  time_range?: string;
  row_limit?: number;
  orderby?: QueryOrderBy[];
  order_desc?: boolean;
  timeseries_limit_metric?: string | AdhocMetric;
}

export interface QueryContext {
  datasource: DatasourceKey;
  queries: QueryObject[];
  form_data?: Record<string, unknown>;
  result_type: string;
  result_format: string;
  force: boolean;
}

export interface ChartDataResponseResult {
  data: Record<string, unknown>[];
  colnames: string[];
  coltypes: number[];
  rowcount: number;
  status: string;
  error?: string | null;
  query?: string;
}

export interface ChartDataResponse {
  result: ChartDataResponseResult[];
}
