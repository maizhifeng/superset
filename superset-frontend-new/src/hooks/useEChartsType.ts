import { useEffect, useState } from "react";
import { loadECharts } from "@/utils/echarts";

export function useEChartsType(_vizType: string): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadECharts().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
