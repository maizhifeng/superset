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

import { type ReactNode, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuthStore } from "@/store/authStore";
import { useMenuSettings } from "@/store/menuSettings";
import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { hasRoutePermission } from "@/config/routePermissions";
import { resolveRoutePoint } from "@/config/menuRoutes";
import Forbidden from "@/pages/Forbidden";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: string[];
}

export default function ProtectedRoute({
  children,
  requiredRoles,
}: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const loginState = useMemo(
    () => ({ from: location.pathname }),
    [location.pathname],
  );
  const getOverrides = useUserRouteOverrides((s) => s.getOverrides);
  const menuEnabled = useMenuSettings((s) => s.enabled);

  const routePoint = resolveRoutePoint(location.pathname);
  // Canonical path used as the per-user override key; dynamic routes fall back
  // to their list route (e.g. /dashboard/:id -> /dashboard/list).
  const overrideKey = routePoint?.path ?? location.pathname;

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={loginState} replace />;
  }

  // Global menu switches win over role permissions and per-user overrides:
  // a disabled route is unreachable for everyone.
  if (routePoint?.menuId && menuEnabled[routePoint.menuId] === false) {
    return <Forbidden />;
  }

  const username = user?.username;
  if (username) {
    const override = getOverrides(username)[overrideKey];
    if (override === false) {
      return <Forbidden />;
    }
  }

  if (requiredRoles && requiredRoles.length > 0) {
    const userRoles = user?.roles ?? {};
    const hasPermission = hasRoutePermission(overrideKey, userRoles);
    if (!hasPermission) {
      return <Forbidden />;
    }
  }

  return <>{children}</>;
}
