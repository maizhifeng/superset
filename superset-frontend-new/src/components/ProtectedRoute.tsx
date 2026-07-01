import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuthStore } from "@/store/authStore";
import { useUserRouteOverrides } from "@/store/userRouteOverrides";
import { hasRoutePermission } from "@/config/routePermissions";
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
  const getOverrides = useUserRouteOverrides((s) => s.getOverrides);

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
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requiredRoles && requiredRoles.length > 0) {
    const userRoles = user?.roles ?? {};
    const username = user?.username;

    // Check user-specific override first
    if (username) {
      const overrides = getOverrides(username);
      const override = overrides[location.pathname];
      if (override !== undefined) {
        if (!override) {
          return <Forbidden />;
        }
        return <>{children}</>;
      }
    }

    const hasPermission = hasRoutePermission(location.pathname, userRoles);
    if (!hasPermission) {
      return <Forbidden />;
    }
  }

  return <>{children}</>;
}
