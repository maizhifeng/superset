export interface ApiResponse<T> {
  result: T;
  count?: number;
  id?: number;
}

export interface DashboardData {
  id: number;
  dashboard_title: string;
  published: boolean;
  description?: string;
  position_json: string;
  json_metadata: string;
  charts: string[];
  created_by?: {
    email?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
}

export interface ChartData {
  id: number;
  slice_name: string;
  viz_type: string;
  datasource_id?: number;
  datasource_type?: string;
  datasource_name_text?: string;
  form_data?: Record<string, unknown> | string;
  params?: Record<string, unknown> | string;
}

export interface Dataset {
  id: number;
  table_name: string;
}

export interface Database {
  id: number;
  database_name: string;
  backend?: string;
  expose_in_sqllab?: boolean;
  allow_dml?: boolean;
  changed_on_delta_humanized?: string;
}

export interface DashboardListItem {
  id: number;
  dashboard_title: string;
  published: boolean;
  changed_on_delta_humanized?: string;
}

export interface SavedQuery {
  id: number;
  label: string;
  sql: string;
  database: { database_name: string } | null;
  changed_on_delta_humanized: string;
}

export interface ChartRow {
  id: number;
  slice_name: string;
  viz_type: string;
  created_by: { username: string } | null;
  changed_on_delta_humanized: string;
  datasource_name_text?: string;
  datasource_type?: string;
  datasource_id?: number;
  table?: { table_name: string };
}

export interface DatasetRow {
  id: number;
  table_name: string;
  schema: string | null;
  database: { database_name: string } | null;
  kind: "physical" | "virtual";
  changed_on_delta_humanized: string;
}

export interface DatasetColumn {
  id: number;
  column_name: string;
  type: string;
  verbose_name: string | null;
  is_dttm: boolean;
  description: string | null;
  expression: string | null;
  filterable: boolean;
  groupby: boolean;
  is_active: boolean;
  type_generic: number | null;
  extra: string | null;
}

export interface DatasetMetric {
  id: number;
  metric_name: string;
  verbose_name: string | null;
  expression: string;
  description: string | null;
  d3format: string | null;
  currency: string | null;
}

export interface DatasetDetail {
  id: number;
  table_name: string;
  schema: string | null;
  description: string | null;
  sql: string | null;
  default_endpoint: string | null;
  fetch_values_predicate: string | null;
  template_params: string | null;
  catalog: string | null;
  kind: string;
  database: { database_name: string; id: number };
  columns: DatasetColumn[];
  metrics: DatasetMetric[];
}

export interface QueryResult {
  status: string;
  columns: { name: string; type?: string; displayName?: string }[];
  data: Record<string, unknown>[];
  query_id?: number;
  query?: {
    rows: number;
    sql: string;
    state: string;
    queryId: number;
    limit: number;
    limitingFactor: string;
    progress: number;
  };
}

export interface QueryLog {
  id: number;
  user: { username: string } | null;
  action: string;
  dttm: string;
  duration_ms: number;
}

export interface AlertReport {
  id: number;
  name: string;
  type: string;
  active: boolean;
  crontab: string;
  recipients: string;
}

export interface TableResult {
  value: string;
  type: string;
  extra?: Record<string, unknown>;
}
