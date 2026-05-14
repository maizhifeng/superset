import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ToolEntry {
  id: string;
  priority: number;
  render: ReactNode;
  showOnMobile: boolean;
}

interface ToolbarContextType {
  tools: ToolEntry[];
  registerTools: (page: string, entries: Omit<ToolEntry, 'page'>[]) => void;
  unregisterTools: (page: string) => void;
}

const ToolbarContext = createContext<ToolbarContextType>({
  tools: [],
  registerTools: () => {},
  unregisterTools: () => {},
});

export function useToolbar() {
  return useContext(ToolbarContext);
}

export function ToolbarProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<Record<string, ToolEntry[]>>({});

  const registerTools = useCallback((page: string, entries: Omit<ToolEntry, 'page'>[]) => {
    setRegistry(prev => ({
      ...prev,
      [page]: entries.map(e => ({ ...e, page })),
    }));
  }, []);

  const unregisterTools = useCallback((page: string) => {
    setRegistry(prev => {
      const next = { ...prev };
      delete next[page];
      return next;
    });
  }, []);

  const tools = Object.values(registry)
    .flat()
    .sort((a, b) => a.priority - b.priority);

  return (
    <ToolbarContext.Provider value={{ tools, registerTools, unregisterTools }}>
      {children}
    </ToolbarContext.Provider>
  );
}
