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
  dashboard: { label: "仪表板", listPath: "/dashboard/list" },
  chart: { label: "图表", listPath: "/chart/list" },
  dataset: { label: "数据集", listPath: "/dataset/list" },
  database: { label: "数据库", listPath: "/database/list" },
  saved_query: { label: "已保存查询", listPath: "/saved_query/list" },
  alert: { label: "告警", listPath: "/alert/list" },
  query_history: { label: "历史记录", listPath: "/query_history" },
  explore: { label: "探索", listPath: "/explore" },
  sqllab: { label: "SQL 实验室", listPath: "/sqllab" },
};
