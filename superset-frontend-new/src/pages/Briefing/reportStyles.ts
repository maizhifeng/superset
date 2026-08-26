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

/**
 * Presentation tokens shared by the briefing list and detail pages.
 *
 * Every color is derived from `@/theme/palette` so the briefing keeps a single
 * visual language with the rest of the app. Chart series colors follow the
 * charts skill rules: hex only, one stable color per metric across every chart
 * in the page, and no two metrics sharing a hue.
 */
import type { CSSProperties } from "react";
import { supersetPalette } from "@/theme/palette";

/** Metric → ECharts series color. Defined once; every chart reuses it. */
export const BRIEFING_CHART_COLORS = {
  /** 返点后消耗 bars. */
  spend: supersetPalette.primary.main,
  /** 新增进入 bars (teal; deliberately distinct from ROI1's green). */
  newUsers: supersetPalette.chart[1],
  /** ROI1 line. */
  roi1: supersetPalette.success.main,
  /** LTV1 line. */
  ltv1: supersetPalette.info.main,
  /** Breakeven / threshold mark lines. */
  breakevenLine: supersetPalette.error.main,
} as const;

/** Axis-label and grid-line chrome shared by all briefing charts. */
export const BRIEFING_CHART_CHROME = {
  axisLabel: supersetPalette.text.secondary,
  gridLine: supersetPalette.divider,
} as const;

/** Job run lifecycle, shared by the detail state machine and its chrome. */
export type JobStatus = "idle" | "running" | "done" | "error" | "cancelled";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  idle: "待执行",
  running: "执行中",
  done: "已完成",
  error: "失败",
  cancelled: "已停止",
};

export const JOB_STATUS_COLOR: Record<JobStatus, string> = {
  idle: supersetPalette.text.disabled,
  running: supersetPalette.status.info,
  done: supersetPalette.status.success,
  error: supersetPalette.status.error,
  cancelled: supersetPalette.status.warning,
};

/** Report alert / job-log level → semantic token color. */
export const ALERT_LEVEL_COLOR: Record<string, string> = {
  critical: supersetPalette.status.error,
  error: supersetPalette.status.error,
  warning: supersetPalette.status.warning,
  info: supersetPalette.status.info,
};

/** Report alert background washes keyed by MUI Alert severity. */
export const CALLOUT_BG: Record<string, string> = {
  error: supersetPalette.status.errorBg,
  warning: supersetPalette.status.warningBg,
  info: supersetPalette.status.infoBg,
  success: supersetPalette.status.successBg,
};

/**
 * Shared table styling for briefing tables. Plain `CSSProperties` factories so
 * native `<th>`/`<td>`/`<tr>` elements stay inline-styled while sourcing every
 * color from the theme palette.
 */
export const briefingTable = {
  headCell(padding = "6px 8px"): CSSProperties {
    return {
      padding,
      borderBottom: `1px solid ${supersetPalette.outline}`,
      fontWeight: 600,
      color: supersetPalette.text.secondary,
      whiteSpace: "nowrap",
    };
  },
  bodyCell(options?: { numeric?: boolean; padding?: string }): CSSProperties {
    return {
      padding: options?.padding ?? "6px 8px",
      fontVariantNumeric: options?.numeric ? "tabular-nums" : undefined,
      whiteSpace: "nowrap",
    };
  },
  zebraRow(index: number): CSSProperties {
    return {
      backgroundColor:
        index % 2 === 1 ? supersetPalette.bg.muted : "transparent",
      borderBottom: `1px solid ${supersetPalette.border.light}`,
    };
  },
} as const;
