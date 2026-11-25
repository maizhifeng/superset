/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ECElementEvent, EChartsOption, EChartsType } from "echarts";
import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { getECharts, loadECharts } from "@/utils/echarts";
import ChartLoadingSkeleton from "@/components/ChartLoadingSkeleton";
import useReducedMotion from "@/hooks/useReducedMotion";
import { chartMotion } from "@/theme/motion";
import { duration, ease } from "@/theme/tokens";

export default function EChart({
  option,
  height = 300,
  onEvents,
  ariaLabel,
  onChartReady,
  overlay,
}: {
  option: EChartsOption;
  height?: number | string;
  onEvents?: Record<string, (params: ECElementEvent) => void>;
  /** Text alternative for the canvas, exposed through ECharts' aria label. */
  ariaLabel?: string;
  /** Receives the ECharts instance once the canvas is ready. */
  onChartReady?: (instance: EChartsType) => void;
  /** Absolutely-positioned layer above the canvas (coach marks, gestures). */
  overlay?: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [skeletonMounted, setSkeletonMounted] = useState(true);
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReactEChartsCore | null>(null);

  // Chart animation follows the page's motion tokens instead of ECharts' 1s
  // default, and stops entirely when the user asked for reduced motion.
  //
  // The option is only merged when its inputs change: keeping a stable object
  // identity is what stops echarts-for-react from calling ``setOption`` on
  // every parent render, which used to wipe hover/tooltip state mid-read.
  const chartOption = useMemo<EChartsOption>(
    () =>
      reduced
        ? { ...chartMotion, ...option, animation: false }
        : { ...chartMotion, ...option },
    [option, reduced],
  );

  // echarts-for-react only listens for window resize. When the surrounding
  // layout folds (sidebar collapse, grid columns stacking) the container
  // changes size without a window event, so observe the element directly.
  // Resizes are coalesced into one animation frame.
  useEffect(() => {
    if (!ready) return undefined;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        chartRef.current?.getEchartsInstance()?.resize();
      });
    });
    observer.observe(el);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
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

  // Cross-fade the skeleton into the chart instead of swapping abruptly.
  useEffect(() => {
    if (!ready) return undefined;
    if (reduced) {
      setSkeletonMounted(false);
      return undefined;
    }
    const timer = setTimeout(() => setSkeletonMounted(false), duration.quick);
    return () => clearTimeout(timer);
  }, [ready, reduced]);

  return (
    <Box
      ref={containerRef}
      // The canvas carries no text of its own; role+label give assistive tech
      // a description of the chart, and a sibling data table (where one exists)
      // carries the numbers.
      role="img"
      aria-label={ariaLabel}
      sx={{ width: "100%", position: "relative" }}
    >
      {ready && (
        <ReactEChartsCore
          ref={chartRef}
          echarts={getECharts()}
          option={chartOption}
          lazyUpdate
          onEvents={onEvents}
          onChartReady={onChartReady}
          style={{ height, width: "100%" }}
        />
      )}
      {overlay && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          {overlay}
        </Box>
      )}
      {skeletonMounted && (
        <Box
          aria-hidden
          sx={{
            position: ready ? "absolute" : "relative",
            inset: ready ? 0 : undefined,
            width: "100%",
            height: ready ? "100%" : height,
            display: "flex",
            opacity: ready ? 0 : 1,
            pointerEvents: "none",
            transition: reduced
              ? "none"
              : `opacity ${duration.quick}ms ${ease.standard}`,
          }}
        >
          <ChartLoadingSkeleton />
        </Box>
      )}
    </Box>
  );
}
