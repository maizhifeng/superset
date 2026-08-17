import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DashboardFavoritesState {
  ids: number[];
  toggle: (id: number) => void;
  isFavorite: (id: number) => boolean;
}

/**
 * 仪表板收藏（存在浏览器 localStorage）：按 id 收藏仪表板，
 * 便于在首页与仪表板列表快速访问常用仪表板。
 */
export const useDashboardFavorites = create<DashboardFavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((state) => ({
          ids: state.ids.includes(id)
            ? state.ids.filter((x) => x !== id)
            : [...state.ids, id],
        })),
      isFavorite: (id) => get().ids.includes(id),
    }),
    {
      name: "superset-dashboard-favorites",
      version: 1,
    },
  ),
);
