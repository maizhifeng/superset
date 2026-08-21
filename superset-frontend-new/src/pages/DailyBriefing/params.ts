/**
 * Report configuration parameters a user can edit.
 *
 * Field mapping (which dataset columns map to date / project / channel /
 * metrics) is resolved automatically by the backend from the dataset; it is
 * NOT a report parameter.  What remains here are behaviour-level knobs plus
 * the chosen Superset dataset (datasource) the report runs against.
 */
export interface ReportParamValues {
  name: string;
  description: string;
  /** Selected Superset dataset id (null => backend default dataset). */
  datasource_id: number | "";
  /** Dataset coordinates, persisted alongside the id for run-time resolution. */
  table_name: string;
  schema: string;
  database_name: string;
  top_projects_count: number | "";
  days_of_history: number | "";
  alert_critical_threshold: number | "";
  alert_warning_threshold: number | "";
  roi_critical_line: number | "";
  roi_warning_line: number | "";
}

export const EMPTY_PARAMS: ReportParamValues = {
  name: "",
  description: "",
  datasource_id: "",
  table_name: "",
  schema: "",
  database_name: "",
  top_projects_count: "",
  days_of_history: "",
  alert_critical_threshold: "",
  alert_warning_threshold: "",
  roi_critical_line: "",
  roi_warning_line: "",
};

/** Fold a stored config payload (JSON) into the form's param shape. */
export function paramsFromConfig(
  cfg: Record<string, unknown> | undefined | null,
): ReportParamValues {
  const num = (key: string): number | "" => {
    const v = cfg?.[key];
    if (v === undefined || v === null) return "";
    return Number(v);
  };
  const str = (key: string): string => String(cfg?.[key] ?? "");
  return {
    name: String(cfg?.name ?? ""),
    description: String(cfg?.description ?? ""),
    datasource_id: num("datasource_id"),
    table_name: str("table_name"),
    schema: str("schema"),
    database_name: str("database_name"),
    top_projects_count: num("top_projects_count"),
    days_of_history: num("days_of_history"),
    alert_critical_threshold: num("alert_critical_threshold"),
    alert_warning_threshold: num("alert_warning_threshold"),
    roi_critical_line: num("roi_critical_line"),
    roi_warning_line: num("roi_warning_line"),
  };
}

/** Resolve the form shape back into a JSON payload suitable for the API. */
export function paramsToConfig(p: ReportParamValues): Record<string, unknown> {
  const val = (v: number | ""): number | null => (v === "" ? null : Number(v));
  return {
    name: p.name,
    description: p.description,
    datasource_id: val(p.datasource_id),
    table_name: p.table_name || null,
    schema: p.schema || null,
    database_name: p.database_name || null,
    top_projects_count: val(p.top_projects_count),
    days_of_history: val(p.days_of_history),
    alert_critical_threshold: val(p.alert_critical_threshold),
    alert_warning_threshold: val(p.alert_warning_threshold),
    roi_critical_line: val(p.roi_critical_line),
    roi_warning_line: val(p.roi_warning_line),
  };
}
