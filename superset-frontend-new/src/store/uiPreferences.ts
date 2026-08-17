import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GridDensity = "compact" | "standard" | "comfortable";

interface UiPreferencesState {
  /** 全局数据表格密度，用于列表页更高效地浏览行数。 */
  gridDensity: GridDensity;
  setGridDensity: (density: GridDensity) => void;
}

/**
 * 用户界面偏好（localStorage 持久化）：
 * 目前用于全局数据表格的行密度，之后可扩展其他跨页面偏好。
 */
export const useUiPreferences = create<UiPreferencesState>()(
  persist(
    (set) => ({
      gridDensity: "compact",
      setGridDensity: (gridDensity) => set({ gridDensity }),
    }),
    {
      name: "superset-ui-preferences",
      version: 1,
    },
  ),
);
