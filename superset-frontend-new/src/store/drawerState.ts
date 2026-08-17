import { create } from "zustand";
import type { ChartData, DashboardFilterValue } from "@/types/api";

export type AiDrawerMode = "assistant" | "insight";

interface OpenInsightOpts {
  chartId?: number;
  chartMeta?: ChartData;
  filters?: Record<string, DashboardFilterValue>;
  dashboardId?: string;
  /** 打开助手时预填到输入框的提问。 */
  initialQuestion?: string;
}

interface DrawerState {
  aiDrawerOpen: boolean;
  aiDrawerMode: AiDrawerMode;
  drawerWidth: number;
  insightChartId: number | null;
  insightChartMeta: ChartData | undefined;
  insightFilters: Record<string, DashboardFilterValue>;
  initialQuestion: string;
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
  initialQuestion: "",

  openAiDrawer: (mode, insightOpts) =>
    set({
      aiDrawerOpen: true,
      aiDrawerMode: mode,
      insightChartId: insightOpts?.chartId ?? null,
      insightChartMeta: insightOpts?.chartMeta ?? undefined,
      insightFilters: insightOpts?.filters ?? {},
      initialQuestion: insightOpts?.initialQuestion ?? "",
    }),

  closeAiDrawer: () =>
    set({
      aiDrawerOpen: false,
      insightChartId: null,
      insightChartMeta: undefined,
      insightFilters: {},
      initialQuestion: "",
    }),

  setDrawerWidth: (width) => set({ drawerWidth: width }),
}));
