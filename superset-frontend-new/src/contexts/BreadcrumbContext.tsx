import { useBreadcrumbStore } from '@/store/breadcrumbStore';

export function useBreadcrumb() {
  const custom = useBreadcrumbStore(s => s.custom);
  const setCustom = useBreadcrumbStore(s => s.setCustom);
  return { custom, setCustom };
}

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
