import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NavItem {
  id: string;
  path: string;
  label: string;
  builtIn: boolean;
}

const defaultItems: NavItem[] = [
  {
    id: "dashboards",
    path: "/dashboard/list",
    label: "Dashboards",
    builtIn: true,
  },
  { id: "charts", path: "/chart/list", label: "Charts", builtIn: true },
  { id: "sqllab", path: "/sqllab", label: "SQL Lab", builtIn: true },
  { id: "datasets", path: "/dataset/list", label: "Datasets", builtIn: true },
  {
    id: "database/list",
    path: "/database/list",
    label: "Databases",
    builtIn: true,
  },
  {
    id: "saved_query/list",
    path: "/saved_query/list",
    label: "Saved Queries",
    builtIn: true,
  },
  { id: "alert/list", path: "/alert/list", label: "Alerts", builtIn: true },
  {
    id: "query_history",
    path: "/query_history",
    label: "History",
    builtIn: true,
  },
  {
    id: "project_config",
    path: "/project/config",
    label: "Config",
    builtIn: true,
  },
];

const defaultEnabled: Record<string, boolean> = {
  dashboards: true,
  charts: true,
  sqllab: true,
  datasets: true,
  "database/list": true,
  "saved_query/list": true,
  "alert/list": true,
  query_history: true,
  project_config: true,
};

interface MenuSettingsState {
  items: NavItem[];
  enabled: Record<string, boolean>;
  toggle: (id: string) => void;
  addItem: (path: string, label: string) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, direction: "up" | "down") => void;
}

function mergeDefaults(
  persisted: { items: NavItem[]; enabled: Record<string, boolean> } | undefined,
): { items: NavItem[]; enabled: Record<string, boolean> } {
  const items = persisted?.items ?? [...defaultItems];
  const enabled = { ...(persisted?.enabled ?? defaultEnabled) };
  const knownIds = new Set(items.map((i) => i.id));
  for (const def of defaultItems) {
    if (!knownIds.has(def.id)) {
      items.push(def);
      enabled[def.id] = defaultEnabled[def.id] ?? true;
    }
  }
  return { items, enabled };
}

export const useMenuSettings = create<MenuSettingsState>()(
  persist(
    (set) => ({
      items: [...defaultItems],
      enabled: { ...defaultEnabled },
      toggle: (id) =>
        set((state) => ({
          enabled: { ...state.enabled, [id]: !state.enabled[id] },
        })),
      addItem: (path, label) => {
        const id = `custom_${Date.now()}`;
        set((state) => ({
          items: [...state.items, { id, path, label, builtIn: false }],
          enabled: { ...state.enabled, [id]: true },
        }));
      },
      removeItem: (id) =>
        set((state) => {
          const { [id]: _removed, ...rest } = state.enabled;
          return {
            items: state.items.filter((item) => item.id !== id),
            enabled: rest,
          };
        }),
      moveItem: (id, direction) =>
        set((state) => {
          const idx = state.items.findIndex((item) => item.id === id);
          if (idx === -1) return state;
          const targetIdx = direction === "up" ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= state.items.length) return state;
          const items = [...state.items];
          [items[idx], items[targetIdx]] = [items[targetIdx], items[idx]];
          return { items };
        }),
    }),
    {
      name: "superset-menu-settings",
      merge: (persisted, current) => ({
        ...current,
        ...mergeDefaults(
          persisted as
            | { items: NavItem[]; enabled: Record<string, boolean> }
            | undefined,
        ),
      }),
    },
  ),
);
