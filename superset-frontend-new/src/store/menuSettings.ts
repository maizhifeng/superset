import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NavItem {
  id: string;
  path: string;
  label: string;
  builtIn: boolean;
  /** Optional role names required to see this menu item. */
  roles?: string[];
}

const defaultItems: NavItem[] = [
  {
    id: "dashboards",
    path: "/dashboard/list",
    label: "仪表板",
    builtIn: true,
  },
  { id: "charts", path: "/chart/list", label: "图表", builtIn: true },
  { id: "sqllab", path: "/sqllab", label: "SQL 实验室", builtIn: true },
  { id: "datasets", path: "/dataset/list", label: "数据集", builtIn: true },
  {
    id: "database/list",
    path: "/database/list",
    label: "数据库",
    builtIn: true,
  },
  {
    id: "saved_query/list",
    path: "/saved_query/list",
    label: "已保存查询",
    builtIn: true,
  },
  { id: "alert/list", path: "/alert/list", label: "告警", builtIn: true },
  {
    id: "query_history",
    path: "/query_history",
    label: "历史记录",
    builtIn: true,
  },
  {
    id: "project_config",
    path: "/project/config",
    label: "游戏配置",
    builtIn: true,
    roles: ["Admin"],
  },
  {
    id: "channel_config",
    path: "/project/channel",
    label: "渠道商配置",
    builtIn: true,
    roles: ["Admin"],
  },
  {
    id: "profit_sharing_config",
    path: "/project/profit-sharing",
    label: "分成配置",
    builtIn: true,
    roles: ["Admin"],
  },
  {
    id: "admin_users",
    path: "/admin/users",
    label: "用户管理",
    builtIn: true,
    roles: ["Admin"],
  },
  {
    id: "admin_roles",
    path: "/admin/roles",
    label: "角色管理",
    builtIn: true,
    roles: ["Admin"],
  },
];

const defaultEnabled: Record<string, boolean> = {
  dashboards: true,
  charts: true,
  sqllab: false,
  datasets: true,
  "database/list": true,
  "saved_query/list": false,
  "alert/list": false,
  query_history: false,
  project_config: true,
  channel_config: true,
  profit_sharing_config: true,
  admin_users: true,
  admin_roles: true,
};

interface MenuSettingsState {
  items: NavItem[];
  enabled: Record<string, boolean>;
  toggle: (id: string) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, direction: "up" | "down") => void;
}

function mergeDefaults(
  persisted: { items: NavItem[]; enabled: Record<string, boolean> } | undefined,
): { items: NavItem[]; enabled: Record<string, boolean> } {
  const items = persisted?.items ?? [...defaultItems];
  const enabled = { ...(persisted?.enabled ?? defaultEnabled) };
  const knownIds = new Set(items.map((i) => i.id));
  const defaultsById = new Map(defaultItems.map((d) => [d.id, d]));
  for (const item of items) {
    const def = defaultsById.get(item.id);
    if (def) {
      item.label = def.label;
      item.path = def.path;
      if (def.roles) {
        item.roles = def.roles;
      }
    }
  }
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
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        ...mergeDefaults(
          persisted as
            { items: NavItem[]; enabled: Record<string, boolean> } | undefined,
        ),
      }),
    },
  ),
);
