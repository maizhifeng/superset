import { create } from "zustand";
import type { ChartData } from "@/types/api";

interface DrawerState {
  aiAssistantOpen: boolean;
  setAiAssistantOpen: (open: boolean) => void;
  insightOpen: boolean;
  insightChartId: number | null;
  insightChartMeta: ChartData | undefined;
  insightFilters: Record<string, unknown>;
  openInsight: (
    chartId: number,
    chartMeta?: ChartData,
    filters?: Record<string, unknown>,
  ) => void;
  closeInsight: () => void;
}

export const useDrawerStore = create<DrawerState>()((set) => ({
  aiAssistantOpen: false,
  setAiAssistantOpen: (open) => set({ aiAssistantOpen: open }),

  insightOpen: false,
  insightChartId: null,
  insightChartMeta: undefined,
  insightFilters: {},
  openInsight: (chartId, chartMeta, filters) =>
    set({
      insightOpen: true,
      insightChartId: chartId,
      insightChartMeta: chartMeta,
      insightFilters: filters ?? {},
    }),
  closeInsight: () =>
    set({
      insightOpen: false,
      insightChartId: null,
      insightChartMeta: undefined,
      insightFilters: {},
    }),
}));
