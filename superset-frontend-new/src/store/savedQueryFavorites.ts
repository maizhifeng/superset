import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SavedQueryFavoritesState {
  ids: number[];
  toggle: (id: number) => void;
}

/**
 * 保存的查询收藏（localStorage 持久化），与其他模块的收藏一致。
 */
export const useSavedQueryFavorites = create<SavedQueryFavoritesState>()(
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
      name: "superset-saved-query-favorites",
      version: 1,
    },
  ),
);
