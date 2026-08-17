import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DatasetFavoritesState {
  ids: number[];
  toggle: (id: number) => void;
}

/**
 * 数据集收藏（localStorage 持久化），与其他模块的收藏一致。
 */
export const useDatasetFavorites = create<DatasetFavoritesState>()(
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
      name: "superset-dataset-favorites",
      version: 1,
    },
  ),
);
