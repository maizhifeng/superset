import { create } from 'zustand';

/**
 * Metric state store
 * Manages metrics list, selected metric, and preview data
 */
export const useMetricStore = create((set) => ({
  metrics: [],
  selectedMetric: null,
  currentConfig: null,
  previewSQL: '',
  previewData: null,

  setMetrics: (metrics) => set({ metrics }),
  setSelectedMetric: (metric) => set({ selectedMetric: metric }),
  setCurrentConfig: (config) => set({ currentConfig: config }),
  setPreviewSQL: (sql) => set({ previewSQL: sql }),
  setPreviewData: (data) => set({ previewData: data }),
}));