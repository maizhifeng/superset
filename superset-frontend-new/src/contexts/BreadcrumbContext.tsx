import { createContext, useContext, useState, type ReactNode } from 'react';

interface BreadcrumbCustom {
  label: string;
  actions?: ReactNode;
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
  const [custom, setCustom] = useState<BreadcrumbCustom | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ custom, setCustom }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}
