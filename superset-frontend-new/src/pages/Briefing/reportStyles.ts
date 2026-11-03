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
 * CSS-facing values resolve through the MUI theme variables, so the briefing
 * follows whichever palette is active (paper or notion) instead of pinning the
 * paper colors.  Canvas-facing values (ECharts series and axis chrome) stay
 * literal hexes: a canvas cannot resolve a CSS variable, so the detail page
 * derives those from `useTheme()` at render time and the constants below remain
 * the static paper fallback.
 *
 * Chart series colors follow the charts skill rules: hex only, one stable color
 * per metric across every chart in the page, and no two metrics sharing a hue.
 */
import type { CSSProperties } from "react";
import { supersetPalette } from "@/theme/palette";

const paletteVar = (path: string) => `var(--mui-palette-${path})`;

/**
 * Color tokens for plain inline styles and native table cells, where an `sx`
 * theme lookup is unavailable.  MUI emits one `--mui-palette-*` variable per
 * palette path, so these resolve to the active theme's value.
 */
export const BRIEFING_CSS_COLORS = {
  textPrimary: paletteVar("text-primary"),
  textSecondary: paletteVar("text-secondary"),
  textDisabled: paletteVar("text-disabled"),
  divider: paletteVar("divider"),
  outline: paletteVar("outline"),
  surfaceMain: paletteVar("surface-main"),
  surfaceVariant: paletteVar("surface-variant"),
  backgroundPaper: paletteVar("background-paper"),
  bgMuted: paletteVar("bg-muted"),
  bgSelected: paletteVar("bg-selected"),
  actionHover: paletteVar("action-hover"),
  borderLight: paletteVar("border-light"),
  borderMedium: paletteVar("border-medium"),
  primaryMain: paletteVar("primary-main"),
  primaryContainer: paletteVar("primary-container"),
  primaryOnContainer: paletteVar("primary-onContainer"),
  primaryContrastText: paletteVar("primary-contrastText"),
  statusSuccess: paletteVar("status-success"),
  statusWarning: paletteVar("status-warning"),
  statusError: paletteVar("status-error"),
  statusInfo: paletteVar("status-info"),
} as const;

/**
 * Metric → ECharts series color, in the paper palette.
 *
 * Kept for the canvas contract and as the deterministic fallback; the detail
 * page reads the active theme instead (see `useBriefingColors`) so charts turn
 * blue/green with the notion theme.
 */
export const BRIEFING_CHART_COLORS = {
  /** 返点后消耗 bars. */
  spend: supersetPalette.primary.main,
  /** 新增进入 bars (teal; deliberately distinct from ROI1's green). */
  newUsers: supersetPalette.chart[1],
  /** ROI1 line. */
  roi1: supersetPalette.success.main,
  /**
   * LTV1 line.  A violet rather than the palette's blue-grey info tone: ROI1
   * (green) and LTV1 are 2px lines on the same plot and the two used to sit
   * 1.3:1 apart, which made them hard to tell apart.
   */
  ltv1: supersetPalette.chart[5],
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
  idle: BRIEFING_CSS_COLORS.textDisabled,
  running: BRIEFING_CSS_COLORS.statusInfo,
  done: BRIEFING_CSS_COLORS.statusSuccess,
  error: BRIEFING_CSS_COLORS.statusError,
  cancelled: BRIEFING_CSS_COLORS.statusWarning,
};

/** Report alert / job-log level → semantic token color. */
export const ALERT_LEVEL_COLOR: Record<string, string> = {
  critical: BRIEFING_CSS_COLORS.statusError,
  error: BRIEFING_CSS_COLORS.statusError,
  warning: BRIEFING_CSS_COLORS.statusWarning,
  info: BRIEFING_CSS_COLORS.statusInfo,
};

/** Report alert background washes keyed by MUI Alert severity. */
export const CALLOUT_BG: Record<string, string> = {
  error: paletteVar("status-errorBg"),
  warning: paletteVar("status-warningBg"),
  info: paletteVar("status-infoBg"),
  success: paletteVar("status-successBg"),
};

/**
 * Shared table styling for briefing tables. Plain `CSSProperties` factories so
 * native `<th>`/`<td>`/`<tr>` elements stay inline-styled while sourcing every
 * color from the active theme.
 *
 * Numeric columns are right-aligned so digits line up under their header, and
 * the row hover wash lives in the theme (keyed off ``BRIEFING_TABLE_CLASS``).
 */
export const BRIEFING_TABLE_CLASS = "briefing-table";

/**
 * Applied to the cells pinned with ``position: sticky`` (the frozen dimension
 * columns and their headers), so themes and tests can target the frozen block
 * without reading inline styles.
 */
export const BRIEFING_STICKY_CELL_CLASS = "briefing-sticky-cell";

/**
 * Applied to the 「合计 N 天」 row that opens a channel block.  It sticks below
 * the table header through plain CSS, so the block summary is always visible
 * while its day rows scroll under it (the next block's header replaces it).
 */
export const BRIEFING_BLOCK_HEADER_CLASS = "briefing-block-header";

/**
 * Opaque paper-backed fill for a frozen cell.
 *
 * A pinned cell has to paint its own background because it overlays the cells
 * that scroll underneath it, while rows tint the paper with translucent washes.
 * Layering the row wash over the paper surface keeps zebra / subtotal rows
 * intact once their leading cells are pinned.
 */
export function frozenCellBackground(overlay?: string): string {
  return overlay
    ? `linear-gradient(${overlay}, ${overlay}), ${BRIEFING_CSS_COLORS.backgroundPaper}`
    : BRIEFING_CSS_COLORS.backgroundPaper;
}

export const briefingTable = {
  headCell(
    padding = "5px 8px",
    options?: { numeric?: boolean },
  ): CSSProperties {
    return {
      padding,
      borderBottom: `1px solid ${BRIEFING_CSS_COLORS.outline}`,
      fontWeight: 600,
      color: BRIEFING_CSS_COLORS.textSecondary,
      whiteSpace: "nowrap",
      textAlign: options?.numeric ? "right" : "left",
    };
  },
  bodyCell(options?: { numeric?: boolean; padding?: string }): CSSProperties {
    return {
      padding: options?.padding ?? "5px 8px",
      fontVariantNumeric: options?.numeric ? "tabular-nums" : undefined,
      textAlign: options?.numeric ? "right" : undefined,
      whiteSpace: "nowrap",
    };
  },
  zebraRow(index: number): CSSProperties {
    return {
      backgroundColor:
        index % 2 === 1 ? BRIEFING_CSS_COLORS.bgMuted : "transparent",
      borderBottom: `1px solid ${BRIEFING_CSS_COLORS.borderLight}`,
    };
  },
  /**
   * The first row of a 主游戏 block: the usual zebra plus a heavy ink divider
   * above, so neighbouring groups do not read as one run of rows — the 小计
   * closing a block would otherwise look attached to whichever side is closer.
   */
  groupStartRow(index: number): CSSProperties {
    return {
      ...this.zebraRow(index),
      borderTop: `3px solid ${BRIEFING_CSS_COLORS.textPrimary}`,
    };
  },
  /**
   * Header cell frozen to the top of the table viewport.  Dimension headers
   * pass ``left`` to also pin to their measured column offset.
   *
   * With ``border-collapse: collapse`` the grid draws the borders, so a sticky
   * header's own border scrolls away with the table; the separators are drawn
   * with inset shadows instead so they stay attached while scrolling.
   */
  frozenHeadCell(options?: {
    left?: number;
    numeric?: boolean;
    /** Marks the right edge of the frozen dimension block. */
    boundary?: boolean;
  }): CSSProperties {
    const pinnedLeft = options?.left !== undefined;
    const shadows = [`inset 0 -1px 0 ${BRIEFING_CSS_COLORS.outline}`];
    if (options?.boundary) {
      shadows.push(`inset -1px 0 0 ${BRIEFING_CSS_COLORS.outline}`);
    }
    return {
      ...this.headCell(undefined, { numeric: options?.numeric }),
      position: "sticky",
      top: 0,
      ...(pinnedLeft ? { left: options?.left } : {}),
      zIndex: pinnedLeft ? 4 : 3,
      background: frozenCellBackground(),
      borderBottom: "none",
      boxShadow: shadows.join(", "),
    };
  },
  /**
   * 小计 row cell.  The row is opaque because it may float over the rows above
   * it (transformed to the viewport's bottom edge, see ``floatingSubtotal.ts``),
   * and its separators are inset shadows so they travel with the floating cell.
   */
  subtotalCell(options?: {
    numeric?: boolean;
    padding?: string;
  }): CSSProperties {
    return {
      ...this.bodyCell({
        numeric: options?.numeric,
        padding: options?.padding,
      }),
      // Longhand layers instead of the ``background`` shorthand: the floating
      // copy of this row must stay fully opaque in every engine.
      backgroundColor: BRIEFING_CSS_COLORS.backgroundPaper,
      backgroundImage: `linear-gradient(${BRIEFING_CSS_COLORS.bgSelected}, ${BRIEFING_CSS_COLORS.bgSelected})`,
      backgroundClip: "border-box",
      boxShadow: `inset 0 2px 0 ${BRIEFING_CSS_COLORS.borderMedium}, inset 0 -1px 0 ${BRIEFING_CSS_COLORS.borderLight}`,
    };
  },
  /**
   * A 「合计 N 天」 row cell.  Those rows can be pinned below the header, so the
   * cell paints its own opaque background instead of relying on the row's
   * translucent zebra fill; ``overlay`` keeps the zebra wash of the natural row.
   */
  summaryCell(options?: {
    numeric?: boolean;
    padding?: string;
    overlay?: string;
  }): CSSProperties {
    return {
      ...this.bodyCell({
        numeric: options?.numeric,
        padding: options?.padding,
      }),
      backgroundColor: BRIEFING_CSS_COLORS.backgroundPaper,
      ...(options?.overlay
        ? {
            backgroundImage: `linear-gradient(${options.overlay}, ${options.overlay})`,
          }
        : {}),
      backgroundClip: "border-box",
      boxShadow: `inset 0 -1px 0 ${BRIEFING_CSS_COLORS.borderLight}`,
    };
  },
  /**
   * Body cell frozen to the left edge while the metric columns scroll
   * horizontally.  ``overlay`` reproduces the row's zebra / subtotal wash on
   * top of the opaque paper fill.
   */
  frozenBodyCell(options: {
    left: number;
    overlay?: string;
    numeric?: boolean;
    padding?: string;
    /** Marks the right edge of the frozen dimension block. */
    boundary?: boolean;
  }): CSSProperties {
    return {
      ...this.bodyCell({ numeric: options.numeric, padding: options.padding }),
      position: "sticky",
      left: options.left,
      zIndex: 2,
      background: frozenCellBackground(options.overlay),
      ...(options.boundary
        ? { boxShadow: `inset -1px 0 0 ${BRIEFING_CSS_COLORS.outline}` }
        : {}),
    };
  },
} as const;
