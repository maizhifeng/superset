import { useEffect, useState } from "react";
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
    <ReactEChartsCore
      echarts={getECharts()}
      option={option}
      notMerge
      lazyUpdate
      onEvents={onEvents}
      style={{ height, width: "100%" }}
    />
  );
}
