import type { ReactNode } from "react";
import { create } from "zustand";

export interface ToolEntry {
  id: string;
  priority: number;
  render: ReactNode;
  showOnMobile: boolean;
  primary?: boolean;
  fabIcon?: ReactNode;
  fabRender?: ReactNode;
  fabLabel?: string;
  action?: () => void;
  fabColor?:
    | "primary"
    | "error"
    | "inherit"
    | "default"
    | "secondary"
    | "info"
    | "success"
    | "warning";
  /**
   * ``inline`` (default) renders in the toolbar row; ``menu`` collects the
   * entry into the page's "更多" overflow menu. Utilities such as copy-all and
   * export live in the menu so they do not crowd the primary filters.
   */
  variant?: "inline" | "menu";
}

interface ToolbarState {
  registry: Record<string, ToolEntry[]>;
  /** Page currently rendering its tools inline (inside the content area). */
  inlinePage: string | null;
  registerTools: (page: string, entries: Omit<ToolEntry, "page">[]) => void;
  unregisterTools: (page: string) => void;
  setInlinePage: (page: string | null) => void;
}

export const useToolbarStore = create<ToolbarState>()((set) => ({
  registry: {},
  inlinePage: null,
  registerTools: (page, entries) =>
    set((state) => {
      const existing = state.registry[page] || [];
      const merged = new Map(existing.map((e) => [e.id, e]));
      for (const e of entries) merged.set(e.id, { ...e });
      return {
        registry: { ...state.registry, [page]: Array.from(merged.values()) },
      };
    }),
  unregisterTools: (page) =>
    set((state) => {
      const next = { ...state.registry };
      delete next[page];
      return { registry: next };
    }),
  setInlinePage: (page) => set({ inlinePage: page }),
}));

export function useToolbar() {
  const registry = useToolbarStore((s) => s.registry);
  const allTools = Object.values(registry)
    .flat()
    .sort((a, b) => a.priority - b.priority);
  return allTools;
}

export function useFabTools() {
  const registry = useToolbarStore((s) => s.registry);
  return Object.values(registry)
    .flat()
    .filter((t) => t.fabIcon || t.fabRender)
    .sort((a, b) => a.priority - b.priority);
}
