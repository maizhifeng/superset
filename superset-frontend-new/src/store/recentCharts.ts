import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecentItem {
  id: number;
  /** Unix 毫秒时间戳，用于排序与展示。 */
  viewedAt: number;
}

interface RecentChartsState {
  items: RecentItem[];
  /** 记录一次查看：把 id 移到列表头部，并裁剪到上限。 */
  record: (id: number) => void;
  /** 按最近到最旧返回 id 列表（仅用于读取）。 */
  recentIds: () => number[];
  /** 清空最近记录。 */
  clear: () => void;
}

const MAX_RECENT = 8;

/**
 * 最近打开的图表（localStorage 持久化）：
 * 记录用户在本端实际打开编辑过的图表，作为首页的快捷跳转入口。
 */
export const useRecentCharts = create<RecentChartsState>()(
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
      name: "superset-recent-charts",
      version: 1,
    },
  ),
);
