import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChartFavoritesState {
  ids: number[];
  toggle: (id: number) => void;
}

/**
 * 图表收藏（localStorage 持久化），与仪表板收藏一致。
 */
export const useChartFavorites = create<ChartFavoritesState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) =>
        set((state) => ({
          ids: state.ids.includes(id)
            ? state.ids.filter((x) => x !== id)
            : [...state.ids, id],
        })),
    }),
    {
      name: "superset-chart-favorites",
      version: 1,
    },
  ),
);
