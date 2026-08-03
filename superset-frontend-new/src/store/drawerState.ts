import { create } from "zustand";
import type { ChartData, DashboardFilterValue } from "@/types/api";

export type AiDrawerMode = "assistant" | "insight";

interface OpenInsightOpts {
  chartId: number;
  chartMeta?: ChartData;
  filters?: Record<string, DashboardFilterValue>;
  dashboardId?: string;
}

interface DrawerState {
  aiDrawerOpen: boolean;
  aiDrawerMode: AiDrawerMode;
  drawerWidth: number;
  insightChartId: number | null;
  insightChartMeta: ChartData | undefined;
  insightFilters: Record<string, DashboardFilterValue>;
  openAiDrawer: (mode: AiDrawerMode, insightOpts?: OpenInsightOpts) => void;
  closeAiDrawer: () => void;
  setDrawerWidth: (width: number) => void;
}

export const useDrawerStore = create<DrawerState>()((set) => ({
  aiDrawerOpen: false,
  aiDrawerMode: "assistant",
  drawerWidth: Math.round(
    typeof window !== "undefined" ? window.innerWidth * 0.4 : 640,
  ),

  insightChartId: null,
  insightChartMeta: undefined,
  insightFilters: {},

  openAiDrawer: (mode, insightOpts) =>
    set({
      aiDrawerOpen: true,
      aiDrawerMode: mode,
      insightChartId: insightOpts?.chartId ?? null,
      insightChartMeta: insightOpts?.chartMeta ?? undefined,
      insightFilters: insightOpts?.filters ?? {},
    }),

  closeAiDrawer: () =>
    set({
      aiDrawerOpen: false,
      insightChartId: null,
      insightChartMeta: undefined,
      insightFilters: {},
    }),

  setDrawerWidth: (width) => set({ drawerWidth: width }),
}));
