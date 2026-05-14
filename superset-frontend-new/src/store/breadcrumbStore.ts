import { create } from 'zustand';

interface BreadcrumbCustom {
  label: string;
  actions?: React.ReactNode;
  status?: 'published' | 'draft';
}

interface BreadcrumbState {
  custom: BreadcrumbCustom | null;
  setCustom: (value: BreadcrumbCustom | null) => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>()((set) => ({
  custom: null,
  setCustom: (value) => set({ custom: value }),
}));
