import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface ToolEntry {
  id: string;
  priority: number;
  render: ReactNode;
  showOnMobile: boolean;
  primary?: boolean;
  fabIcon?: ReactNode;
  fabLabel?: string;
  action?: () => void;
  fabColor?: 'primary' | 'error' | 'inherit' | 'default' | 'secondary' | 'info' | 'success' | 'warning';
}

interface ToolbarState {
  registry: Record<string, ToolEntry[]>;
  registerTools: (page: string, entries: Omit<ToolEntry, 'page'>[]) => void;
  unregisterTools: (page: string) => void;
}

export const useToolbarStore = create<ToolbarState>()((set) => ({
  registry: {},
  registerTools: (page, entries) =>
    set(state => {
      const existing = state.registry[page] || [];
      const merged = new Map(existing.map(e => [e.id, e]));
      for (const e of entries) merged.set(e.id, { ...e });
      return { registry: { ...state.registry, [page]: Array.from(merged.values()) } };
    }),
  unregisterTools: (page) =>
    set(state => {
      const next = { ...state.registry };
      delete next[page];
      return { registry: next };
    }),
}));

export function useToolbar() {
  const registry = useToolbarStore(s => s.registry);
  const allTools = Object.values(registry).flat().sort((a, b) => a.priority - b.priority);
  return allTools;
}

export function useFabTools() {
  const registry = useToolbarStore(s => s.registry);
  return Object.values(registry).flat().filter(t => t.fabIcon).sort((a, b) => a.priority - b.priority);
}

export function ToolbarProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
