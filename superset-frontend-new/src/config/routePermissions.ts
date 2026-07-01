/**
 * Route-level permission configuration.
 *
 * Maps route paths to the roles that are allowed to access them.
 * Routes not listed here are accessible to all authenticated users.
 */
export const routePermissions: Record<string, string[]> = {
  "/project/config": ["Admin"],
  "/project/channel": ["Admin"],
  "/project/profit-sharing": ["Admin"],
  "/admin/users": ["Admin"],
  "/admin/roles": ["Admin"],
};

/** All routes that have permission restrictions. */
export const protectedRoutePaths = Object.keys(routePermissions);

/**
 * Check whether the user's roles satisfy the requirement for a given route.
 * Supports per-user overrides stored in userRouteOverrides store.
 */
export function hasRoutePermission(
  path: string,
  userRoles: Record<string, boolean>,
): boolean {
  const required = routePermissions[path];
  if (!required || required.length === 0) return true;
  return required.some((role) => userRoles[role] === true);
}
