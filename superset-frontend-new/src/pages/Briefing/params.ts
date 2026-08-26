/**
 * Briefing configuration parameters a user can edit.
 *
 * Field mapping (which dataset columns map to date / project / channel /
 * metrics) is resolved automatically by the backend from the dataset; it is
 * NOT a briefing parameter.  What remains here are behaviour-level knobs plus
 * the chosen Superset dataset (datasource) the briefing runs against.
 */

export type ReportType = "daily" | "weekly";

export interface ReportParamValues {
  /** "daily" reports on one day; "weekly" aggregates a natural week (Sunday–Saturday). */
  report_type: ReportType;
  name: string;
  description: string;
  /** Selected Superset dataset id (null => backend default dataset). */
  datasource_id: number | "";
  /**
   * Multi-dataset selection: rows from every listed dataset are fetched and
   * merged (UNION ALL) before computation.  Empty => single-dataset mode.
   */
  datasource_ids: number[];
  /** Dataset coordinates, persisted alongside the id for run-time resolution. */
  table_name: string;
  schema: string;
  database_name: string;
  top_projects_count: number | "";
  days_of_history: number | "";
  weeks_of_history: number | "";
  alert_critical_threshold: number | "";
  alert_warning_threshold: number | "";
  roi_critical_line: number | "";
  roi_warning_line: number | "";
}

export const EMPTY_PARAMS: ReportParamValues = {
  report_type: "daily",
  name: "",
  description: "",
  datasource_id: "",
  datasource_ids: [],
  table_name: "",
  schema: "",
  database_name: "",
  top_projects_count: "",
  days_of_history: "",
  weeks_of_history: "",
  alert_critical_threshold: "",
  alert_warning_threshold: "",
  roi_critical_line: "",
  roi_warning_line: "",
};

/** Normalize an unknown/legacy stored type onto a supported one. */
export function normalizeReportType(value: unknown): ReportType {
  return value === "weekly" ? "weekly" : "daily";
}

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
  const idList = Array.isArray(cfg?.datasource_ids)
    ? (cfg.datasource_ids as unknown[])
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    : [];
  const legacyId = Number(cfg?.datasource_id);
  const datasourceIds = idList.length
    ? idList
    : Number.isFinite(legacyId) && legacyId > 0
      ? [legacyId]
      : [];
  return {
    report_type: normalizeReportType(cfg?.report_type),
    name: String(cfg?.name ?? ""),
    description: String(cfg?.description ?? ""),
    datasource_id: num("datasource_id"),
    datasource_ids: datasourceIds,
    table_name: str("table_name"),
    schema: str("schema"),
    database_name: str("database_name"),
    top_projects_count: num("top_projects_count"),
    days_of_history: num("days_of_history"),
    weeks_of_history: num("weeks_of_history"),
    alert_critical_threshold: num("alert_critical_threshold"),
    alert_warning_threshold: num("alert_warning_threshold"),
    roi_critical_line: num("roi_critical_line"),
    roi_warning_line: num("roi_warning_line"),
  };
}

/** Resolve the form shape back into a JSON payload suitable for the API. */
export function paramsToConfig(p: ReportParamValues): Record<string, unknown> {
  const val = (v: number | ""): number | null => (v === "" ? null : Number(v));
  // The multi-select is the single source of truth; ``datasource_id`` mirrors
  // the first selection so legacy display and the backend's run-time fallback
  // keep working.
  const ids = p.datasource_ids;
  return {
    report_type: normalizeReportType(p.report_type),
    name: p.name,
    description: p.description,
    datasource_id: ids.length ? ids[0] : null,
    datasource_ids: ids,
    table_name: p.table_name || null,
    schema: p.schema || null,
    database_name: p.database_name || null,
    top_projects_count: val(p.top_projects_count),
    days_of_history: val(p.days_of_history),
    weeks_of_history: val(p.weeks_of_history),
    alert_critical_threshold: val(p.alert_critical_threshold),
    alert_warning_threshold: val(p.alert_warning_threshold),
    roi_critical_line: val(p.roi_critical_line),
    roi_warning_line: val(p.roi_warning_line),
  };
}
