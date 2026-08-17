import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AlertFavoritesState {
  ids: number[];
  toggle: (id: number) => void;
}

/**
 * 警报/报告收藏（localStorage 持久化），与其他模块的收藏一致。
 */
export const useAlertFavorites = create<AlertFavoritesState>()(
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
      name: "superset-alert-favorites",
      version: 1,
    },
  ),
);
