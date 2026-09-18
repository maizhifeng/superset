/**
 * Registry of controllable route points.
 *
 * A route point groups one or more SPA paths (list + detail/child routes) that
 * share the same access control:
 *
 * - global menu switches on ``/system/admin?tab=menu`` (``menuId``)
 * - per-user route permission overrides in the user admin dialog (``path``)
 *
 * Routes not listed here are always reachable (home, login, legacy redirects).
 */
import { matchPath } from "react-router-dom";

export interface RoutePoint {
  /** Stable id; equal to the global menu switch id when ``menuId`` is set. */
  id: string;
  /** Canonical path used as the per-user override key. */
  path: string;
  label: string;
  /** Route patterns governed by this point, including detail/child routes. */
  patterns: string[];
  /** Global menu switch controlling this point, when applicable. */
  menuId?: string;
}

export const routePoints: RoutePoint[] = [
  {
    id: "dashboards",
    menuId: "dashboards",
    path: "/dashboard/list",
    label: "仪表板",
    patterns: ["/dashboard/list", "/dashboard/:id"],
  },
  {
    id: "charts",
    menuId: "charts",
    path: "/chart/list",
    label: "图表",
    patterns: ["/chart/list", "/explore", "/explore/*"],
  },
  {
    id: "sqllab",
    menuId: "sqllab",
    path: "/sqllab",
    label: "SQL 实验室",
    patterns: ["/sqllab"],
  },
  {
    id: "datasets",
    menuId: "datasets",
    path: "/dataset/list",
    label: "数据集",
    patterns: ["/dataset/list", "/dataset/create", "/dataset/edit/:id"],
  },
  {
    id: "database/list",
    menuId: "database/list",
    path: "/database/list",
    label: "数据库",
    patterns: ["/database/list", "/database/:id"],
  },
  {
    id: "saved_query/list",
    menuId: "saved_query/list",
    path: "/saved_query/list",
    label: "已保存查询",
    patterns: ["/saved_query/list"],
  },
  {
    id: "alert/list",
    menuId: "alert/list",
    path: "/alert/list",
    label: "告警",
    patterns: ["/alert/list"],
  },
  {
    id: "query_history",
    menuId: "query_history",
    path: "/query_history",
    label: "历史记录",
    patterns: ["/query_history"],
  },
  {
    id: "project_config",
    menuId: "project_config",
    path: "/project/settings",
    label: "项目配置",
    patterns: ["/project/settings"],
  },
  {
    id: "briefing",
    menuId: "briefing",
    path: "/briefing",
    label: "简报",
    patterns: ["/briefing", "/briefing/:id"],
  },
  {
    id: "system_admin",
    path: "/system/admin",
    label: "系统管理",
    patterns: ["/system/admin"],
  },
];

/** Route point governing ``pathname``, or ``null`` when not controlled. */
export function resolveRoutePoint(pathname: string): RoutePoint | null {
  for (const point of routePoints) {
    for (const pattern of point.patterns) {
      if (matchPath({ path: pattern, end: true }, pathname)) {
        return point;
      }
    }
  }
  return null;
}

/** Global menu switch id controlling ``pathname``, or ``null`` when ungated. */
export function resolveMenuId(pathname: string): string | null {
  return resolveRoutePoint(pathname)?.menuId ?? null;
}
