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
  database: "database_name",
};

const cache = new Map<string, { data: NavItem[]; ts: number }>();
const CACHE_TTL = 30_000;

export async function fetchNavItems(category: NavCategory): Promise<NavItem[]> {
  const cached = cache.get(category);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const res = await api.get(`/${category}/?q=(page_size:200,page:0)`);
  const items = (res.data?.result ?? []) as { id: number; [key: string]: unknown }[];
  const nameField = nameFieldMap[category];
  const navItems = items.map((item) => ({
    id: Number(item.id),
    label: String(nameField && item[nameField] ? item[nameField] : item.id ?? ""),
  }));
  cache.set(category, { data: navItems, ts: Date.now() });
  return navItems;
}
