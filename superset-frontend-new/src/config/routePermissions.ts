/**
 * Route-level permission configuration.
 *
 * Maps route paths to the roles that are allowed to access them.
 * Routes not listed here are accessible to all authenticated users.
 *
 * Note: the full set of routes controllable per user (and globally through the
 * menu switches) lives in ``src/config/menuRoutes.ts``.
 */
export const routePermissions: Record<string, string[]> = {
  "/project/config": ["Admin"],
  "/project/channel": ["Admin"],
  "/project/profit-sharing": ["Admin"],
  "/project/settings": ["Admin"],
  "/system/admin": ["Admin"],
  "/settings": ["Admin"],
  "/admin/users": ["Admin"],
  "/admin/roles": ["Admin"],
};

/**
 * Check whether the user's roles satisfy the requirement for a given route.
 * Per-user overrides are handled by the route guard before this check.
 */
export function hasRoutePermission(
  path: string,
  userRoles: Record<string, boolean>,
): boolean {
  const required = routePermissions[path];
  if (!required || required.length === 0) return true;
  return required.some((role) => userRoles[role] === true);
}
