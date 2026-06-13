import api from "@/api";
import type { NavCategory } from "@/store/navStore";

interface NavItem {
  id: number;
  label: string;
}

const nameFieldMap: Record<NavCategory, string> = {
  dashboard: "dashboard_title",
  chart: "slice_name",
  dataset: "table_name",
  saved_query: "label",
  sqllab: "label",
  settings: "label",
};

export async function fetchNavItems(category: NavCategory): Promise<NavItem[]> {
  const res = await api.get(`/${category}/?q=(page_size:200,page:0)`);
  const items = (res.data?.result ?? []) as Record<string, unknown>[];
  const nameField = nameFieldMap[category];
  return items.map((item) => ({
    id: Number(item.id),
    label: String(nameField && item[nameField] ? item[nameField] : item.id ?? ""),
  }));
}
