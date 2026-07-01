import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Stores per-user route access overrides.
 *
 * Data shape: Record<username, Record<routePath, boolean>>
 *   true  = explicitly grant access to this route
 *   false = explicitly deny access to this route
 *   undefined = fall back to role-based permission check
 */
interface UserRouteOverridesState {
  overrides: Record<string, Record<string, boolean>>;
  setOverride: (
    username: string,
    path: string,
    granted: boolean,
  ) => void;
  clearOverrides: (username: string) => void;
  getOverrides: (username: string) => Record<string, boolean>;
}

export const useUserRouteOverrides = create<UserRouteOverridesState>()(
  persist(
    (set, get) => ({
      overrides: {},

      setOverride: (username, path, granted) =>
        set((state) => {
          const userOverrides = { ...state.overrides[username] };
          if (granted) {
            userOverrides[path] = true;
          } else {
            userOverrides[path] = false;
          }
          return {
            overrides: { ...state.overrides, [username]: userOverrides },
          };
        }),

      clearOverrides: (username) =>
        set((state) => {
          const { [username]: _, ...rest } = state.overrides;
          return { overrides: rest };
        }),

      getOverrides: (username) => get().overrides[username] ?? {},
    }),
    {
      name: "superset-user-route-overrides",
      version: 1,
    },
  ),
);
