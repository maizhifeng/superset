import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface ToolEntry {
  id: string;
  priority: number;
  render: ReactNode;
  showOnMobile: boolean;
}

interface ToolbarState {
  registry: Record<string, ToolEntry[]>;
  registerTools: (page: string, entries: Omit<ToolEntry, 'page'>[]) => void;
  unregisterTools: (page: string) => void;
}

export const useToolbarStore = create<ToolbarState>()((set) => ({
  registry: {},
  registerTools: (page, entries) =>
    set(state => ({
      registry: { ...state.registry, [page]: entries.map(e => ({ ...e })) },
    })),
  unregisterTools: (page) =>
    set(state => {
      const next = { ...state.registry };
      delete next[page];
      return { registry: next };
    }),
}));

export function useToolbar() {
  const registry = useToolbarStore(s => s.registry);
  const tools = Object.values(registry).flat().sort((a, b) => a.priority - b.priority);
  return tools;
}

export function ToolbarProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
