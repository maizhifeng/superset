export interface CrumbItem {
  label: string;
  path: string;
  isId: boolean;
  options?: { label: string; path: string }[];
}

export const knownSections: Record<
  string,
  { label: string; listPath: string }
> = {
  dashboard: { label: "Dashboard", listPath: "/dashboard/list" },
  chart: { label: "Chart", listPath: "/chart/list" },
  dataset: { label: "Dataset", listPath: "/dataset/list" },
  database: { label: "Database", listPath: "/database/list" },
  saved_query: { label: "Saved Query", listPath: "/saved_query/list" },
  alert: { label: "Alert", listPath: "/alert/list" },
  query_history: { label: "History", listPath: "/query_history" },
  explore: { label: "Explore", listPath: "/explore" },
  sqllab: { label: "SQL Lab", listPath: "/sqllab" },
};
