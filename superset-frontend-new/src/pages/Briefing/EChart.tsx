import { useEffect, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { getECharts, loadECharts } from "@/utils/echarts";
import ChartLoadingSkeleton from "@/components/ChartLoadingSkeleton";

export default function EChart({
  option,
  height = 300,
  onEvents,
}: {
  option: EChartsOption;
  height?: number | string;
  onEvents?: Record<string, (params: any) => void>;
}) {
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReactEChartsCore | null>(null);

  // echarts-for-react only listens for window resize. When the surrounding
  // layout folds (sidebar collapse, grid columns stacking) the container
  // changes size without a window event, so observe the element directly.
  useEffect(() => {
    if (!ready) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      chartRef.current?.getEchartsInstance()?.resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    let active = true;
    void loadECharts().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <Box sx={{ height, width: "100%", display: "flex" }}>
        <ChartLoadingSkeleton />
      </Box>
    );
  }

  return (
    <Box ref={containerRef} sx={{ width: "100%" }}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={getECharts()}
        option={option}
        notMerge
        lazyUpdate
        onEvents={onEvents}
        style={{ height, width: "100%" }}
      />
    </Box>
  );
}
