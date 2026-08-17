import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DatabaseFavoritesState {
  ids: number[];
  toggle: (id: number) => void;
}

/**
 * 数据库收藏（localStorage 持久化），与其他模块的收藏一致。
 */
export const useDatabaseFavorites = create<DatabaseFavoritesState>()(
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
      name: "superset-database-favorites",
      version: 1,
    },
  ),
);
