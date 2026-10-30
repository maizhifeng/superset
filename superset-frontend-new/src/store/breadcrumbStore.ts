import { create } from "zustand";

export interface BreadcrumbOption {
  label: string;
  path: string;
  selected?: boolean;
}

interface BreadcrumbCustom {
  label: string;
  actions?: React.ReactNode;
  status?: "published" | "draft";
  /** Hover dropdown entries shown on the current crumb (e.g. topic switcher). */
  options?: BreadcrumbOption[];
}

interface BreadcrumbState {
  custom: BreadcrumbCustom | null;
  setCustom: (value: BreadcrumbCustom | null) => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>()((set) => ({
  custom: null,
  setCustom: (value) => set({ custom: value }),
}));
