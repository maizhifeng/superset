import { useEffect, useState } from 'react';
import { ensureChartType } from '@/utils/echarts';

export function useEChartsType(vizType: string): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    ensureChartType(vizType).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [vizType]);

  return ready;
}
