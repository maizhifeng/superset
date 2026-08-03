import { useMemo } from "react";
import { useAuthStore } from "@/store/authStore";

/**
 * Hook for checking user permissions (roles).
 *
 * Returned helpers check whether the current user has one or more
 * of the required roles.
 */
export function usePermission() {
  const roles = useAuthStore((s) => s.user?.roles);

  return useMemo(
    () => ({
      /** True when the user has at least one of the given roles. */
      hasAny: (...required: string[]) =>
        required.length === 0 ||
        required.some((role) => roles?.[role] === true),

      /** True when the user has **all** of the given roles. */
      hasAll: (...required: string[]) =>
        required.length === 0 ||
        required.every((role) => roles?.[role] === true),

      /** The raw roles map (roleName → true). */
      roles: roles ?? {},
    }),
    [roles],
  );
}
