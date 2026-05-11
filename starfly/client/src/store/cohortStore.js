import { create } from 'zustand';

function getDefaultDateRange() {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { start, end };
}

export const useCohortStore = create((set) => ({
  config: {
    userTable: 'users',
    activityTable: 'user_daily_activity',
    cohortDateField: 'registration_date',
    cohortPeriod: 'week',
    metric: 'retention_rate',
    maxPeriods: 12,
    dateRange: getDefaultDateRange(),
    dateMode: 'absolute',
    relativeConfig: {
      startPeriod: 1,
      endPeriod: 12,
    },
    firstXDays: 30,
    firstXDaysEnabled: false,
    dimensions: [],
    dimensionFilters: {},
  },
  setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),

  results: null,
  isLoading: false,
  error: null,
  setResults: (results) => set({ results, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  templates: [],
  setTemplates: (templates) => set({ templates }),
  uploadModalOpen: false,
  showTemplates: false,
  setUploadModalOpen: (open) => set({ uploadModalOpen: open }),
  setShowTemplates: (show) => set({ showTemplates: show }),
}));
