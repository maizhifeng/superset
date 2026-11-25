/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

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
 */
export function hasRoutePermission(
  path: string,
  userRoles: Record<string, boolean>,
): boolean {
  const required = routePermissions[path];
  if (!required || required.length === 0) return true;
  return required.some((role) => userRoles[role] === true);
}
