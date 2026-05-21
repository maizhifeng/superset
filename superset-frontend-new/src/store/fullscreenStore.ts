import { create } from "zustand";

interface FullscreenState {
  activeChartId: number | null;
  forceLandscape: boolean;
  setFullscreen: (chartId: number | null) => void;
  setForceLandscape: (force: boolean) => void;
  exit: () => void;
}

export const useFullscreenStore = create<FullscreenState>()((set) => ({
  activeChartId: null,
  forceLandscape: false,
  setFullscreen: (chartId) => set({ activeChartId: chartId }),
  setForceLandscape: (force) => set({ forceLandscape: force }),
  exit: () => set({ activeChartId: null, forceLandscape: false }),
}));
