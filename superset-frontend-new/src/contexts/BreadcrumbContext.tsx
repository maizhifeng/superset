import { createContext, useContext, type ReactNode } from 'react';
import { useBreadcrumbStore } from '@/store/breadcrumbStore';

interface BreadcrumbCustom {
  label: string;
  actions?: React.ReactNode;
}

interface BreadcrumbContextType {
  custom: BreadcrumbCustom | null;
  setCustom: (value: BreadcrumbCustom | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType>({ custom: null, setCustom: () => {} });

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const custom = useBreadcrumbStore(s => s.custom);
  const setCustom = useBreadcrumbStore(s => s.setCustom);
  return (
    <BreadcrumbContext.Provider value={{ custom, setCustom }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}
