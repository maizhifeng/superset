import { create } from 'zustand';

/**
 * Dataset state store
 * Manages datasets list, selected dataset, and preview data
 */
export const useDatasetStore = create((set) => ({
  datasets: [],
  selectedDataset: null,
  currentConfig: null,
  previewSQL: '',
  previewData: null,

  setDatasets: (datasets) => set({ datasets }),
  setSelectedDataset: (dataset) => set({ selectedDataset: dataset }),
  setCurrentConfig: (config) => set({ currentConfig: config }),
  setPreviewSQL: (sql) => set({ previewSQL: sql }),
  setPreviewData: (data) => set({ previewData: data }),
}));