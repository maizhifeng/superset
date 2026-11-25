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

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Stores per-user route access overrides.
 *
 * Data shape: Record<username, Record<routePath, boolean>>
 *   true  = legacy allow for routes without role requirements
 *   false = explicitly deny access to this route
 *   undefined = fall back to role-based permission check
 */
interface UserRouteOverridesState {
  overrides: Record<string, Record<string, boolean>>;
  setOverride: (username: string, path: string, granted: boolean) => void;
  /** Drop a single route override so the route falls back to its defaults. */
  clearOverride: (username: string, path: string) => void;
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

      clearOverride: (username, path) =>
        set((state) => {
          const existing = state.overrides[username];
          if (!existing || existing[path] === undefined) return state;
          const userOverrides = { ...existing };
          delete userOverrides[path];
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
