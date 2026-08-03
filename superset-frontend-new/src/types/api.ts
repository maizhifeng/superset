export interface ApiResponse<T> {
  result: T;
  count?: number;
  id?: number;
}

export type ChartDataRow = Record<string, string | number>;

export interface ChartDataPayload {
  data?: ChartDataRow[];
  colnames?: string[];
  coltypes?: number[];
  rowcount?: number;
  status?: string;
  error?: string | null;
  query?: string;
  applied_filters?: { column: string }[];
  rejected_filters?: { column: string; reason: string }[];
  [key: string]: unknown;
}

export interface FormData {
  viz_type?: string;
  datasource?: string;
  metrics?: unknown[];
  metric?: unknown;
  groupby?: string[];
  columns?: string[];
  orderby?: unknown[];
  order_desc?: boolean;
  timeseries_limit_metric?: unknown;
  granularity_sqla?: string;
  time_range?: string;
  adhoc_filters?: unknown[];
  row_limit?: number;
  row_offset?: number;
  extra?: string;
  [key: string]: unknown;
}

export interface DashboardFilterValue {
  value: unknown;
  column: string;
  filterType: string;
}

export interface DashboardPosition {
  [nodeId: string]: {
    id?: string;
    type?: string;
    children?: string[];
    meta?: {
      chartId?: number;
      width?: number;
      height?: number;
      x?: number;
      y?: number;
      sliceName?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
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

export interface DatabaseDetail {
  id: number;
  database_name: string;
  backend: string;
  driver: string;
  expose_in_sqllab: boolean;
  allow_dml: boolean;
  allow_ctas: boolean;
  allow_cvas: boolean;
  allow_file_upload: boolean;
  allow_run_async: boolean;
  configuration_method: string;
  cache_timeout: number | null;
  force_ctas_schema: string | null;
  impersonate_user: boolean;
  is_managed_externally: boolean;
  engine_information: {
    disable_ssh_tunneling: boolean;
    supports_dynamic_catalog: boolean;
    supports_file_upload: boolean;
    supports_oauth2: boolean;
  };
  uuid: string;
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
  extra: string | null;
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

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  last_login: string | null;
  login_count: number;
  fail_login_count: number;
  created_on: string;
  changed_on: string;
  roles?: { id: number; name: string }[];
}

export interface AdminRole {
  id: number;
  name: string;
  user_ids?: number[];
  permission_ids?: number[];
  group_ids?: number[];
  users?: { id: number; username: string }[];
  permissions?: {
    id: number;
    permission: { name: string };
    view_menu: { name: string };
  }[];
}

export interface AdminPermission {
  id: number;
  permission: { id: number; name: string };
  view_menu: { id: number; name: string };
}
