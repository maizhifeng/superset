import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecentTopicItem {
  /** Analysis topic id (for example `cost`). */
  id: string;
  /** Unix 毫秒时间戳，用于排序与展示。 */
  viewedAt: number;
}

interface RecentAnalysisTopicsState {
  items: RecentTopicItem[];
  /** Record a view: move the topic id to the head and trim to the cap. */
  record: (id: string) => void;
  /** Ids ordered from most to least recently viewed (read-only helper). */
  recentIds: () => string[];
  /** Drop every recorded view. */
  clear: () => void;
}

const MAX_RECENT = 8;

/**
 * Recently opened analysis topics (localStorage persisted).
 *
 * The analysis detail page records a view on mount; the hall page only reads
 * the list to render the "最近查看" shortcut row.
 */
export const useRecentAnalysisTopics = create<RecentAnalysisTopicsState>()(
  persist(
    (set, get) => ({
      items: [],
      record: (id) =>
        set((state) => {
          const others = state.items.filter((x) => x.id !== id);
          return {
            items: [{ id, viewedAt: Date.now() }, ...others].slice(0, MAX_RECENT),
          };
        }),
      recentIds: () => get().items.map((x) => x.id),
      clear: () => set({ items: [] }),
    }),
    {
      name: "superset-recent-analysis-topics",
      version: 1,
    },
  ),
);
