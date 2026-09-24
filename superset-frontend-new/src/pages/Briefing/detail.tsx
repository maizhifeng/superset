import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Collapse from "@mui/material/Collapse";
import Fade from "@mui/material/Fade";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import { keyframes } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import EditIcon from "@mui/icons-material/Edit";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import CategoryIcon from "@mui/icons-material/Category";
import TableChartIcon from "@mui/icons-material/TableChart";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import PageHeader from "@/components/PageHeader";
import { useNotificationStore } from "@/store/notificationStore";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import useReducedMotion, {
  prefersReducedMotion,
} from "@/hooks/useReducedMotion";
import type { EChartsOption } from "echarts";
import { supersetPalette } from "@/theme/palette";
import { duration as durationTokens, ease as easeTokens } from "@/theme/tokens";
import api from "@/api";
import ConfigForm from "./ConfigForm";
import EChart from "./EChart";
import {
  ALERT_LEVEL_COLOR,
  BRIEFING_CHART_CHROME,
  BRIEFING_CHART_COLORS,
  BRIEFING_TABLE_CLASS,
  CALLOUT_BG,
  JOB_STATUS_COLOR,
  JOB_STATUS_LABEL,
  briefingTable,
  type JobStatus,
} from "./reportStyles";
import {
  gamesByMedia,
  gamesOf,
  mediaByPlatform,
  mediaRowsByProject,
  platformsBySpend,
  roiQuality,
  rollupMediaRows,
  summarizeDailyRows,
  visibleLtvDays,
  type DailyTotals,
  type MediaRollupRow,
  type RoiQuality,
} from "./reportData";
import {
  normalizeReportType,
  paramsFromConfig,
  paramsToConfig,
  type ReportParamValues,
  type ReportType,
} from "./params";

// Chart chrome derives from the shared briefing tokens; the dark terminal
// panel below keeps two local neutrals because the palette is light-only and
// the log view intentionally reads as a terminal surface.
const TEXT_MUTED = BRIEFING_CHART_CHROME.axisLabel;
const DIVIDER = BRIEFING_CHART_CHROME.gridLine;
const TERMINAL_BG = "#0d1117";
const TERMINAL_TEXT = "#c9d1d9";
const TERMINAL_MUTED = "#8b949e";
const TERMINAL_HOVER = "rgba(255,255,255,0.04)";

/** Height of one chapter-navigation item; the active pill slides by this much. */

// Local keyframes.  Every one of them collapses to instant under the theme's
// global ``prefers-reduced-motion: reduce`` rule.
const statusPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
`;
const railSweep = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(320%); }
`;
const valuePulse = keyframes`
  from { color: ${supersetPalette.primary.main}; transform: translateY(-2px); }
  to { color: inherit; transform: translateY(0); }
`;

interface CoreMetrics {
  spend?: number;
  new_users?: number;
  /** null = 分母为 0（无消耗 / 无新增），比值无定义。 */
  cpa?: number | null;
  /** 充值流水：周期内充值合计（纯加法指标）。 */
  recharge?: number;
  /** 自然新增%：自然量新增占新增进入的比例（0~1）。 */
  natural_rate?: number | null;
  ROI1?: number | null;
  LTV1?: number | null;
  [key: string]: number | null | undefined;
}

interface AlertItem {
  level: "critical" | "warning" | "error" | "info";
  metric: string;
  message: string;
}

interface ProjectRow {
  project: string;
  channel: string;
  region: string;
  spend: number;
  new_users: number;
  pay_rate?: number | null;
  retention_rate?: number | null;
  /** 自然新增%：自然量新增占新增进入的比例（0~1）。 */
  natural_rate?: number | null;
  cpa: number | null;
  /** 充值流水（周期内充值合计）。 */
  recharge?: number;
  ltv1: number | null;
  ltv2?: number | null;
  ltv3?: number | null;
  ltv4?: number | null;
  ltv5?: number | null;
  ltv6?: number | null;
  ltv7?: number | null;
  roi1: number | null;
  roi_cum?: number | null;
  roi_flow?: number | null;
  prev?: {
    spend: number;
    new_users: number;
    cpa: number | null;
    ltv1: number | null;
    roi1: number | null;
    recharge?: number;
  };
  daily?: DailyTrendRow[];
}

interface ProjectSummaryRow {
  project: string;
  spend: number;
  new_users: number;
  pay_rate?: number | null;
  retention_rate?: number | null;
  /** 自然新增%：自然量新增占新增进入的比例（0~1）。 */
  natural_rate?: number | null;
  cpa: number | null;
  /** 充值流水（周期内充值合计）。 */
  recharge?: number;
  ltv1: number | null;
  ltv2?: number | null;
  ltv3?: number | null;
  ltv4?: number | null;
  ltv5?: number | null;
  ltv6?: number | null;
  ltv7?: number | null;
  roi1: number | null;
  roi_cum?: number | null;
  roi_flow?: number | null;
  /** Whole-game daily series (all channels), used by the merged view. */
  daily?: DailyTrendRow[];
  prev?: {
    spend: number;
    new_users: number;
    cpa: number | null;
    ltv1: number | null;
    roi1: number | null;
    recharge?: number;
  };
}

interface MediaRow {
  channel: string;
  spend: number;
  new_users: number;
  pay_rate?: number | null;
  retention_rate?: number | null;
  /** 自然新增%：自然量新增占新增进入的比例（0~1）。 */
  natural_rate?: number | null;
  cpa: number | null;
  recharge?: number;
  ltv1?: number | null;
  roi1?: number | null;
  prev?: {
    spend: number;
    new_users: number;
    cpa: number | null;
    ltv1: number | null;
    roi1: number | null;
    recharge?: number;
  };
}

/**
 * One 主游戏 slice of a media channel — the rows the media view drills into.
 *
 * A media channel is not a 渠道商, so this cross-cut cannot be derived from
 * ``projects``; the backend sends it ready-made with the same metric fields
 * (and the same period-over-period block) as a media row.
 */
interface MediaProjectRow extends MediaRow {
  project: string;
}

/**
 * One 客户端 slice of a media channel — the bars the media chart groups.
 *
 * Like the 主游戏 cut it cannot be rolled up on the client, so the backend
 * sends it ready-made with the same metric fields as a media row.
 */
interface MediaPlatformRow extends MediaRow {
  platform: string;
}

interface DailyProjectRow {
  date: string;
  project: string;
  spend: number;
  new_users: number;
  pay_rate?: number | null;
  retention_rate?: number | null;
  /** 自然新增%：自然量新增占新增进入的比例（0~1）。 */
  natural_rate?: number | null;
  cpa: number | null;
  /** 充值流水（周期内充值合计）。 */
  recharge?: number;
  ltv1: number | null;
  ltv2?: number | null;
  ltv3?: number | null;
  ltv4?: number | null;
  ltv5?: number | null;
  ltv6?: number | null;
  ltv7?: number | null;
  roi1: number | null;
  roi_cum?: number | null;
  roi_flow?: number | null;
  prev?: {
    spend: number;
    new_users: number;
    cpa: number | null;
    ltv1: number | null;
    roi1: number | null;
    recharge?: number;
  };
}

interface DailyReportResult {
  /** Raw stored value; legacy results may omit it. Normalized on read. */
  report_type?: string | null;
  report_date?: string | null;
  previous_date?: string | null;
  /** Weekly briefings: inclusive bounds of the reported / compared week. */
  period_start?: string | null;
  period_end?: string | null;
  previous_period_start?: string | null;
  previous_period_end?: string | null;
  core?: CoreMetrics;
  core_previous?: CoreMetrics;
  daily?: DailyTrendRow[];
  daily_projects?: DailyProjectRow[];
  project_summary?: ProjectSummaryRow[];
  projects?: ProjectRow[];
  /** 分地区: ``projects`` subdivided by region. */
  project_regions?: ProjectRow[];
  media?: MediaRow[];
  /** 分媒体钻取: ``media`` subdivided by 主游戏. */
  media_projects?: MediaProjectRow[];
  /** 媒体图分组: ``media`` subdivided by 客户端. */
  media_platforms?: MediaPlatformRow[];
  /** 核心指标的平台拆分（核心指标速览的「查看数据表」）。 */
  platforms?: PlatformRow[];
  alerts?: AlertItem[];
  empty?: boolean;
  error?: string;
  config?: Record<string, unknown>;
  history_dates?: string[];
  thresholds?: {
    roi_critical_line: number;
    roi_warning_line: number;
    default_breakeven_line: number;
  };
}

/**
 * The metric fields a comparison table row carries.
 *
 * Daily buckets (分天对比) and platform rows (核心指标速览) expose the same set,
 * so both tables build their cells through ``metricRowValues`` instead of each
 * mapping the fields their own way.
 */
interface MetricRow {
  spend: number;
  new_users: number;
  cpa: number | null;
  /** 充值流水。 */
  recharge?: number;
  /** 1日付费率 / 2日留存率（分母为新增进入）。 */
  pay_rate?: number | null;
  retention_rate?: number | null;
  /** 自然新增%：自然量新增占新增进入的比例（0~1）。 */
  natural_rate?: number | null;
  ltv1: number | null;
  ltv2?: number | null;
  ltv3?: number | null;
  ltv4?: number | null;
  ltv5?: number | null;
  ltv6?: number | null;
  ltv7?: number | null;
  roi1: number | null;
  /** 累计ROI：累计充值 / 返点后消耗。 */
  roi_cum?: number | null;
  /** 流水ROI：充值流水 / 返点后消耗。 */
  roi_flow?: number | null;
}

interface DailyTrendRow extends MetricRow {
  date: string;
  /** Human label for the bucket ("MM-DD ~ MM-DD" for weekly briefings). */
  label?: string;
  roi1: number;
}

/** One platform's slice of the 核心指标速览 headline figures. */
interface PlatformRow extends MetricRow {
  platform: string;
  prev?: MetricRow;
}

interface JobLog {
  ts: string;
  level: string;
  message: string;
}

interface JobInfo {
  id: string;
  config_id: number;
  status: "running" | "done" | "error" | "cancelled";
  logs: JobLog[];
  error?: string;
  cancel_requested?: boolean;
  result?: DailyReportResult;
}

const SPEND_LABEL = "返点后消耗";
const RECHARGE_LABEL = "充值流水";
const PAY_RATE_LABEL = "1日付费率";
const NATURAL_RATE_LABEL = "自然新增%";
/** Channel cell text of a row whose channels were rolled into its game. */
const MERGED_CHANNEL_LABEL = "全部渠道";
const RETENTION_LABEL = "2日留存率";
const USERS_LABEL = "新增进入";
// Drill-down views only show the leading series to avoid long-tail clutter.
const MAX_DRILL_SERIES = 10;

// Log lines can carry a success level that report alerts never emit.
const LOG_LEVEL_COLOR: Record<string, string> = {
  ...ALERT_LEVEL_COLOR,
  success: supersetPalette.status.success,
};

function formatNumber(value: number | null | undefined, digits = 1): string {
  // ``null`` is the payload's "undefined ratio" (no cost / no users); an em
  // dash keeps it from reading as a real zero.
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(digits);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Editorial chapter marker: warm index chip + serif title + hairline rule.
 * Repeated for every report section so the numbering becomes the page's
 * signature element.
 */
function ReportSectionHeader({
  index,
  title,
  caption,
}: {
  index: number;
  title: string;
  caption?: string;
}) {
  return (
    <Box sx={{ mb: 0.75 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            minWidth: 26,
            height: 26,
            px: 0.75,
            borderRadius: 1,
            bgcolor: supersetPalette.primary.container,
            color: supersetPalette.primary.onContainer,
            fontSize: "0.8125rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {String(index).padStart(2, "0")}
        </Box>
        <Typography variant="h6">{title}</Typography>
        <Box sx={{ flex: 1, height: 1, bgcolor: DIVIDER }} aria-hidden />
      </Box>
      {caption && (
        <Typography
          variant="caption"
          sx={{ color: TEXT_MUTED, display: "block", mt: 0.25 }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  );
}

/** Flat stat cell for the core-metric band — no card chrome, hairline only. */
function StatTile({
  label,
  value,
  display,
  delta,
  higherIsBetter = true,
  neutral = false,
}: {
  label: string;
  value: string;
  display?: string;
  delta?: number | null;
  higherIsBetter?: boolean;
  neutral?: boolean;
}) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
      }}
    >
      <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
        {label}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        {/*
         * Keying on the value makes a refreshed figure announce itself with a
         * short rise, instead of silently swapping numbers after a re-run.
         */}
        <Typography
          key={value}
          sx={{
            fontSize: "1.5rem",
            fontWeight: 700,
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
            animation: `${valuePulse} ${durationTokens.slow}ms ${easeTokens.decelerate}`,
          }}
        >
          {value}
        </Typography>
        {delta !== undefined && delta !== null && (
          <DeltaBadge
            value={delta}
            higherIsBetter={higherIsBetter}
            neutral={neutral}
          />
        )}
      </Box>
      {display && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {display}
        </Typography>
      )}
    </Box>
  );
}

/**
 * The metric columns every row of the briefing tables uses — the collapsed
 * project row, the expanded period subtotal and each daily row all render the
 * same cells in the same order, which is what keeps the columns aligned.
 */
function metricColumnDefs(ltvDays: number[]) {
  return [
    { key: "spend", label: SPEND_LABEL, numeric: true },
    { key: "spendDelta", label: "消耗环比", numeric: true },
    { key: "recharge", label: RECHARGE_LABEL, numeric: true },
    { key: "newUsers", label: USERS_LABEL, numeric: true },
    { key: "naturalRate", label: NATURAL_RATE_LABEL, numeric: true },
    { key: "payRate", label: PAY_RATE_LABEL, numeric: true },
    { key: "retentionRate", label: RETENTION_LABEL, numeric: true },
    { key: "cpa", label: "CPA", numeric: true },
    ...ltvDays.map((d) => ({
      key: `ltv${d}`,
      label: `LTV${d}`,
      numeric: true,
    })),
    { key: "roi1", label: "ROI1", numeric: true },
    { key: "roi1Delta", label: "ROI1环比", numeric: true },
    { key: "roiCum", label: "累计ROI", numeric: true },
    { key: "roiFlow", label: "流水ROI", numeric: true },
  ];
}

type MetricColumnKey = ReturnType<typeof metricColumnDefs>[number]["key"];

interface MetricValues {
  spend: number;
  spendDelta: number | null;
  recharge: number;
  newUsers: number;
  payRate: number | null | undefined;
  retentionRate: number | null | undefined;
  naturalRate: number | null | undefined;
  cpa: number | null | undefined;
  ltv: Record<number, number | null | undefined>;
  roi1: number | null | undefined;
  roi1Delta: number | null;
  roiCum: number | null | undefined;
  roiFlow: number | null | undefined;
}

/** One row's metric cells as plain text (colourable), in column order. */
interface MetricCellText {
  key: MetricColumnKey;
  text: string;
  color?: string;
  title?: string;
}

function metricCellsText(
  values: MetricValues,
  ltvDays: number[],
): MetricCellText[] {
  const delta = (
    value: number | null,
    higherIsBetter = true,
  ): Pick<MetricCellText, "text" | "color" | "title"> => {
    if (value === null || Number.isNaN(value)) {
      return {
        text: "—",
        color: supersetPalette.text.disabled,
        title: "没有同口径的上期数据",
      };
    }
    return {
      text: `${value >= 0 ? "▲" : "▼"} ${Math.abs(value * 100).toFixed(1)}%`,
      color:
        value >= 0 === higherIsBetter
          ? supersetPalette.status.success
          : supersetPalette.status.error,
    };
  };
  return [
    { key: "spend", text: formatNumber(values.spend) },
    { key: "spendDelta", ...delta(values.spendDelta, false) },
    { key: "recharge", text: formatNumber(values.recharge) },
    { key: "newUsers", text: String(values.newUsers) },
    { key: "naturalRate", text: formatPercent(values.naturalRate) },
    { key: "payRate", text: formatPercent(values.payRate) },
    { key: "retentionRate", text: formatPercent(values.retentionRate) },
    { key: "cpa", text: formatNumber(values.cpa, 1) },
    ...ltvDays.map((d) => ({
      key: `ltv${d}`,
      text: formatNumber(values.ltv[d], 2),
    })),
    { key: "roi1", text: formatPercent(values.roi1) },
    { key: "roi1Delta", ...delta(values.roi1Delta) },
    { key: "roiCum", text: formatPercent(values.roiCum) },
    { key: "roiFlow", text: formatPercent(values.roiFlow) },
  ];
}

/** Row stagger: each disclosed day slides in after the one above it. */
const ROW_STAGGER_MS = 45;

/** Column stagger for the reel, so a summary row turns over left to right. */
const REEL_MS = 380;
const REEL_STAGGER_MS = 24;

/**
 * The reel's two curves, in Web Animations API form.
 *
 * They used to be CSS ``@keyframes`` toggled by per-cell React state.  That
 * made every value change a state round-trip inside each cell — ~200 cells
 * rendering three times each, spread over ~18 commit waves because the
 * per-column stagger meant 18 separate ``setTimeout`` batches.  Measured on
 * the briefing page that was 160-450ms of main-thread JS for one switch, with
 * style+layout accounting for only ~30ms of it.
 *
 * Driving the same curves through ``element.animate()`` keeps React out of the
 * animation entirely: the parent commits once with the new text, and each cell
 * starts its own roll synchronously before paint.
 */
const REEL_OUT_KEYFRAMES: Keyframe[] = [
  { transform: "translateY(0)", opacity: 1 },
  { transform: "translateY(-0.9em)", opacity: 0 },
];
const REEL_IN_KEYFRAMES: Keyframe[] = [
  { transform: "translateY(0.9em)", opacity: 0 },
  { transform: "translateY(0)", opacity: 1 },
];

/**
 * A figure that rolls over when its text changes: the old value rises out of
 * the cell while the new one rises in, like a wheel.
 *
 * Memoised and style-static on purpose — the briefing tables mount ~200 of
 * these, so the component must neither allocate an emotion class per render
 * nor re-render when its own figure is unchanged.  The outgoing figure is a
 * permanent, clipped, ``aria-hidden`` sibling that is filled in and animated
 * imperatively, so a roll costs two ``animate()`` calls and zero React work.
 */
const WheelValue = memo(function WheelValue({
  text,
  color,
  delay = 0,
}: {
  text: string;
  color?: string;
  delay?: number;
}) {
  const outRef = useRef<HTMLSpanElement>(null);
  const inRef = useRef<HTMLSpanElement>(null);
  const previous = useRef(text);

  // Layout effect, not a passive one: the roll has to be applied before the
  // browser paints the settled figure, or the cell flashes its new value for a
  // frame before rolling.
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = text;
    const out = outRef.current;
    const incoming = inRef.current;
    if (from === text || !out || !incoming) return undefined;
    // The global reduce-motion rule only reaches CSS animations, and this roll
    // is JS-driven, so it has to honour the preference itself.
    if (prefersReducedMotion()) {
      out.textContent = "";
      return undefined;
    }
    out.textContent = from;
    const timing: KeyframeAnimationOptions = {
      duration: REEL_MS,
      delay,
      easing: easeTokens.decelerate,
      // ``both`` holds the outgoing figure in place through the stagger delay
      // and leaves the incoming one settled at the end.
      fill: "both",
    };
    const outAnim = out.animate(REEL_OUT_KEYFRAMES, timing);
    const inAnim = incoming.animate(REEL_IN_KEYFRAMES, timing);
    const release = () => {
      out.textContent = "";
      // A finished ``fill: both`` animation keeps its composited layer alive;
      // both elements rest at their natural style once the roll lands, so
      // cancelling releases the layer without changing what is painted.
      outAnim.cancel();
      inAnim.cancel();
    };
    outAnim.onfinish = release;
    // Re-entrant on purpose: a new figure arriving mid-roll cancels the old
    // one, and cleanup runs before the next effect body in the same commit, so
    // the cell never paints two overlapping figures.
    return release;
  }, [text, delay]);

  return (
    <span className="briefing-wheel" style={color ? { color } : undefined}>
      <span ref={outRef} className="briefing-wheel-out" aria-hidden />
      <span ref={inRef} className="briefing-wheel-in">
        {text}
      </span>
    </span>
  );
});

/** A row's values, with 环比 measured against the comparable previous row. */
function metricRowValues(
  row: MetricRow,
  prev: MetricRow | undefined,
): MetricValues {
  return {
    spend: row.spend,
    spendDelta:
      prev && prev.spend ? (row.spend - prev.spend) / prev.spend : null,
    recharge: row.recharge ?? 0,
    newUsers: row.new_users,
    payRate: row.pay_rate,
    retentionRate: row.retention_rate,
    naturalRate: row.natural_rate,
    cpa: row.cpa,
    ltv: {
      1: row.ltv1,
      2: row.ltv2,
      3: row.ltv3,
      4: row.ltv4,
      5: row.ltv5,
      6: row.ltv6,
      7: row.ltv7,
    },
    roi1: row.roi1,
    roiCum: row.roi_cum,
    roiFlow: row.roi_flow,
    // ``row.roi1`` is only null for a segment with no spend at all (platform
    // rows can be); the previous side keeps the original non-zero guard.
    roi1Delta:
      row.roi1 === null || !prev?.roi1
        ? null
        : (row.roi1 - prev.roi1) / prev.roi1,
  };
}

/** The disclosed window's totals, i.e. the expanded parent row's values. */
function totalsMetricValues(
  totals: DailyTotals,
  ltvDays: number[],
): MetricValues {
  return {
    spend: totals.spend,
    // A period total has no like-for-like previous period in the payload.
    spendDelta: null,
    recharge: totals.recharge,
    newUsers: totals.new_users,
    payRate: totals.pay_rate,
    retentionRate: totals.retention_rate,
    naturalRate: totals.natural_rate,
    cpa: totals.cpa,
    ltv: Object.fromEntries(ltvDays.map((d) => [d, totals.ltv[d]])),
    roi1: totals.roi1,
    roi1Delta: null,
    roiCum: totals.roi_cum,
    roiFlow: totals.roi_flow,
  };
}

/**
 * 分天对比's sub-table: the report's daily rows as text.
 *
 * It is rendered by ``TrendOverview``, which owns the strip that discloses it,
 * so this component is only the table.
 */
function DailyDataTable({
  rows,
  ltvDays,
}: {
  rows: DailyTrendRow[];
  ltvDays: number[];
}) {
  const columns = metricColumnDefs(ltvDays);
  const ordered = useMemo(
    () =>
      [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [rows],
  );
  return (
    <Box
      sx={{
        p: 1,
        border: "1px solid",
        borderColor: "divider",
        borderTop: 0,
        borderRadius: "0 0 4px 4px",
      }}
    >
      <Box sx={{ overflowX: "auto" }}>
        <table
          className={BRIEFING_TABLE_CLASS}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "12px",
            textAlign: "left",
          }}
        >
          <thead>
            <tr>
              <th style={briefingTable.headCell("5px 8px")}>日期</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={briefingTable.headCell("5px 8px", {
                    numeric: c.numeric,
                  })}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((row, i) => (
              <tr key={row.date} style={briefingTable.zebraRow(i)}>
                <td style={briefingTable.bodyCell({ padding: "5px 8px" })}>
                  {row.label ?? row.date}
                </td>
                {metricCellsText(
                  metricRowValues(row, ordered[i - 1]),
                  ltvDays,
                ).map((cell) => (
                  <td
                    key={cell.key}
                    title={cell.title}
                    style={briefingTable.bodyCell({
                      numeric: true,
                      padding: "5px 8px",
                    })}
                  >
                    <span
                      style={cell.color ? { color: cell.color } : undefined}
                    >
                      {cell.text}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

/**
 * §2 分天对比: the trend chart plus the daily table it discloses.
 *
 * Mirrors §1's 分业务板块 split — the same strip welded to the surface above
 * it, the same collapse underneath — so the report's disclosures read as one
 * mechanism instead of each section inventing its own affordance.
 */
function TrendOverview({
  rows,
  ltvDays,
  weekly,
  onSelect,
}: {
  rows: DailyTrendRow[];
  ltvDays: number[];
  weekly: boolean;
  onSelect?: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TrendChart
        rows={rows}
        title=""
        onSelect={onSelect}
        footer={
          <ExpandStrip
            label={weekly ? "分周明细" : "分天明细"}
            icon={<TableChartIcon sx={{ fontSize: 16 }} />}
            open={open}
            onToggle={() => setOpen((v) => !v)}
          />
        }
      />
      <Collapse
        in={open}
        unmountOnExit
        timeout={{
          enter: durationTokens.standard,
          exit: durationTokens.exit,
        }}
      >
        <DailyDataTable rows={rows} ltvDays={ltvDays} />
      </Collapse>
    </>
  );
}

/**
 * The seven headline figures, as values rather than a rendered band.
 *
 * ``CoreMetrics`` uses the payload's ``LTV1`` / ``ROI1`` spelling while every
 * table row uses ``ltv1`` / ``roi1``; call sites normalise onto this shape so
 * one component can render both.
 */
interface CoreBandValues {
  spend?: number;
  recharge?: number;
  new_users?: number;
  natural_rate?: number | null;
  cpa?: number | null;
  ltv1?: number | null;
  roi1?: number | null;
}

/**
 * 核心指标速览's band: one outlined surface, hairline-separated cards.
 *
 * Shared by the headline band and every platform band in the expanded
 * breakdown, so a platform's figures are laid out exactly like the total's —
 * which is what makes the split readable at a glance.
 */
function CoreStatBand({
  values,
  previous,
  footer,
}: {
  values: CoreBandValues;
  previous?: CoreBandValues;
  /** Attached strip below the cards, inside the same surface. */
  footer?: ReactNode;
}) {
  const pct = (cur?: number | null, base?: number | null) =>
    base ? ((cur ?? 0) - base) / base : null;
  const tiles = [
    {
      label: SPEND_LABEL,
      value: formatNumber(values.spend),
      delta: pct(values.spend, previous?.spend),
      neutral: true,
    },
    {
      label: RECHARGE_LABEL,
      value: formatNumber(values.recharge),
      delta: pct(values.recharge, previous?.recharge),
    },
    {
      label: USERS_LABEL,
      value: formatNumber(values.new_users, 0),
      delta: pct(values.new_users, previous?.new_users),
    },
    {
      // 自然新增% is a share, so its 环比 is the change in the share itself
      // rather than a growth rate of a count.
      label: NATURAL_RATE_LABEL,
      value: formatPercent(values.natural_rate),
      delta: pct(values.natural_rate, previous?.natural_rate),
    },
    {
      label: "CPA",
      value: formatNumber(values.cpa, 1),
      delta: pct(values.cpa, previous?.cpa),
      higherIsBetter: false,
    },
    {
      label: "LTV1",
      value: formatNumber(values.ltv1, 2),
      delta: pct(values.ltv1, previous?.ltv1),
    },
    {
      label: "ROI1",
      value: formatPercent(values.roi1),
      delta: pct(values.roi1, previous?.roi1),
    },
  ];
  return (
    <Paper
      variant="outlined"
      sx={{ overflow: "hidden", bgcolor: supersetPalette.surface.main }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          "& > *:not(:first-of-type)": {
            borderLeft: `1px solid ${DIVIDER}`,
          },
        }}
      >
        {tiles.map((tile) => (
          <StatTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            delta={tile.delta}
            neutral={tile.neutral}
            higherIsBetter={tile.higherIsBetter}
          />
        ))}
      </Box>
      {footer}
    </Paper>
  );
}

/**
 * A full-width strip welded to the bottom edge of a section's surface, which
 * opens the detail sitting underneath it.
 *
 * It lives inside that surface, under a hairline, rather than floating below
 * it: as a plain text button a margin down it read as page furniture, and the
 * detail it opens went unnoticed.  §1's 分业务板块 split and §2's daily table
 * share it, so the report's disclosures read as one mechanism.
 */
function ExpandStrip({
  label,
  icon,
  open,
  onToggle,
}: {
  label: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.75,
        width: "100%",
        py: 0.75,
        border: 0,
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: open ? "primary.container" : "action.hover",
        color: open ? "primary.onContainer" : "text.primary",
        font: "inherit",
        fontSize: "0.8125rem",
        fontWeight: 600,
        cursor: "pointer",
        transition: "background-color 150ms ease, color 150ms ease",
        "&:hover": { bgcolor: "action.selected" },
      }}
    >
      {icon}
      {label}
      {open ? (
        <ExpandLessIcon sx={{ fontSize: 18 }} />
      ) : (
        <ExpandMoreIcon sx={{ fontSize: 18 }} />
      )}
    </Box>
  );
}

/**
 * §1 核心指标速览: the headline band plus the 分业务板块 split it opens.
 *
 * The split renders the *same* band component once per platform, so a
 * platform's cards line up with the total's — which is what makes the
 * breakdown readable at a glance.
 */
function CoreOverview({
  core,
  previous,
  rows,
}: {
  core: CoreMetrics;
  previous: CoreMetrics;
  rows: PlatformRow[];
}) {
  const [open, setOpen] = useState(false);
  // ``CoreMetrics`` carries the payload's ``LTV1`` / ``ROI1`` spelling; the
  // band speaks the lowercase row spelling.
  const headline: CoreBandValues = {
    ...core,
    ltv1: core.LTV1,
    roi1: core.ROI1,
  };
  const headlinePrevious: CoreBandValues = {
    ...previous,
    ltv1: previous.LTV1,
    roi1: previous.ROI1,
  };
  return (
    <>
      <CoreStatBand
        values={headline}
        previous={headlinePrevious}
        footer={
          rows.length > 0 ? (
            <ExpandStrip
              label="分业务板块"
              icon={<CategoryIcon sx={{ fontSize: 16 }} />}
              open={open}
              onToggle={() => setOpen((v) => !v)}
            />
          ) : undefined
        }
      />
      <Collapse
        in={open}
        unmountOnExit
        timeout={{
          enter: durationTokens.standard,
          exit: durationTokens.exit,
        }}
      >
        <Box
          sx={{ pt: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}
        >
          {rows.map((row) => (
            <Box key={row.platform}>
              <Typography
                variant="subtitle2"
                sx={{ mb: 0.5, color: TEXT_MUTED }}
              >
                {row.platform || "-"}
              </Typography>
              <CoreStatBand values={row} previous={row.prev} />
            </Box>
          ))}
        </Box>
      </Collapse>
    </>
  );
}

function ProjectComboTable({
  projects,
  breakevenLine,
  showDaily,
  onToggleDaily,
  splitChannel = true,
  onToggleChannel,
  splitRegion = false,
  onToggleRegion,
  expandLabel = "分天",
}: {
  projects: ProjectRow[];
  breakevenLine: number;
  showDaily: boolean;
  onToggleDaily: () => void;
  /** 分渠道: rows are per channel; off rolls every channel into its game. */
  splitChannel?: boolean;
  onToggleChannel?: () => void;
  /** 分地区: subdivide each 主游戏 × 渠道商 row by region. */
  splitRegion?: boolean;
  onToggleRegion?: () => void;
  /** Trend granularity word used in the toggle/caption ("分天" / "分周"). */
  expandLabel?: string;
}) {
  const comboLabel = (p: ProjectRow) =>
    [p.project, p.channel, p.region].filter(Boolean).join(" · ");
  const pct = (cur?: number | null, base?: number | null) =>
    base ? ((cur ?? 0) - base) / base : null;

  // A column that is empty for every row (regions are often not mapped) is
  // dropped instead of printing a column of dashes.
  const hasRegion = projects.some((p) => (p.region ?? "").trim() !== "");
  const ltvDays = visibleLtvDays(projects.flatMap((p) => p.daily ?? []));
  const columns = metricColumnDefs(ltvDays);
  // Leading text columns; a daily row spans them with its date cell.
  const leadCount = 2 + (hasRegion ? 1 : 0);
  const columnCount = leadCount + columns.length + 1;
  const numCell = briefingTable.bodyCell({ numeric: true });
  const smallNumCell = {
    ...briefingTable.bodyCell({ numeric: true }),
    fontSize: "12px",
  } as const;

  const head: { label: string; numeric?: boolean }[] = [
    { label: "主游戏" },
    { label: "渠道" },
    ...(hasRegion ? [{ label: "地区" }] : []),
    ...columns,
    { label: "状态", numeric: true },
  ];

  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Typography variant="subtitle1">
          {splitChannel
            ? splitRegion
              ? "主游戏 × 渠道商 × 地区 明细（含环比）"
              : "主游戏 × 渠道商 明细（含环比）"
            : "主游戏 明细（不分渠道）"}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {onToggleChannel && (
            <Tooltip
              // Keeps the visible label as the button's accessible name; the
              // default (``aria-label``) would replace it with the sentence.
              describeChild
              title={
                splitChannel
                  ? "当前按渠道商拆分行；关闭后每个主游戏合并为一条"
                  : "同一主游戏下的所有渠道商合并为一条"
              }
            >
              <Button
                size="small"
                variant={splitChannel ? "contained" : "outlined"}
                color="primary"
                onClick={onToggleChannel}
                aria-pressed={splitChannel}
              >
                分渠道
              </Button>
            </Tooltip>
          )}
          {onToggleRegion && (
            <Tooltip
              describeChild
              title={
                splitChannel
                  ? "在渠道基础上再按地区细分（中国大陆为 mainland）"
                  : "需先开启「分渠道」才能按地区细分"
              }
            >
              {/* A disabled button swallows pointer events, so the tooltip needs
                  a wrapper element to still fire. */}
              <span>
                <Button
                  size="small"
                  variant={splitRegion ? "contained" : "outlined"}
                  color="primary"
                  onClick={onToggleRegion}
                  aria-pressed={splitRegion}
                  disabled={!splitChannel}
                >
                  分地区
                </Button>
              </span>
            </Tooltip>
          )}
          <Button
            size="small"
            variant={showDaily ? "contained" : "outlined"}
            color="primary"
            onClick={onToggleDaily}
            aria-expanded={showDaily}
          >
            {showDaily ? `收起${expandLabel}` : `${expandLabel}显示`}
          </Button>
        </Box>
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <table
          className={BRIEFING_TABLE_CLASS}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
            textAlign: "left",
          }}
        >
          <thead>
            <tr>
              {head.map((c) => (
                <th
                  key={c.label}
                  style={briefingTable.headCell(undefined, {
                    numeric: c.numeric,
                  })}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p, idx) => {
              // Expanded, the parent row becomes the subtotal of the daily rows
              // it discloses — same metric fields, computed over the window.
              const totals = showDaily
                ? summarizeDailyRows(p.daily ?? undefined)
                : null;
              const days = disclosedDays(p, showDaily);
              const achieved =
                ((totals ? totals.roi1 : p.roi1) ?? 0) >= breakevenLine;
              const parentValues: MetricValues = totals
                ? totalsMetricValues(totals, ltvDays)
                : {
                    spend: p.spend,
                    spendDelta: pct(p.spend, p.prev?.spend),
                    recharge: p.recharge ?? 0,
                    newUsers: p.new_users,
                    payRate: p.pay_rate,
                    retentionRate: p.retention_rate,
                    naturalRate: p.natural_rate,
                    cpa: p.cpa,
                    ltv: {
                      1: p.ltv1,
                      2: p.ltv2,
                      3: p.ltv3,
                      4: p.ltv4,
                      5: p.ltv5,
                      6: p.ltv6,
                      7: p.ltv7,
                    },
                    roi1: p.roi1,
                    roi1Delta: pct(p.roi1, p.prev?.roi1),
                    roiCum: p.roi_cum,
                    roiFlow: p.roi_flow,
                  };
              return (
                <Fragment key={`${p.project}-${p.channel}-${p.region}`}>
                  <tr style={briefingTable.zebraRow(idx)}>
                    <td style={briefingTable.bodyCell()}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.75,
                        }}
                      >
                        {p.project}
                        {totals && <TotalTag days={p.daily?.length ?? 0} />}
                      </Box>
                    </td>
                    <td style={briefingTable.bodyCell()}>{p.channel || "-"}</td>
                    {hasRegion && (
                      <td style={briefingTable.bodyCell()}>
                        {p.region || "-"}
                      </td>
                    )}
                    {/*
                     * The reel lives in both states on purpose: the cell keeps
                     * its identity, so when the row turns into a period total
                     * the figure rolls over from the day's value instead of
                     * being swapped in.
                     */}
                    {metricCellsText(parentValues, ltvDays).map((cell, i) => (
                      <td
                        key={cell.key}
                        style={{ ...numCell, fontWeight: 600 }}
                        title={cell.title}
                      >
                        <WheelValue
                          text={cell.text}
                          color={cell.color}
                          delay={i * REEL_STAGGER_MS}
                        />
                      </td>
                    ))}
                    <td style={numCell}>
                      <StatusDot
                        achieved={achieved}
                        invested={parentValues.spend > 0}
                      />
                    </td>
                  </tr>
                  {days.map((day, dayIndex) => (
                    <tr
                      key={day.row.date}
                      style={{
                        ...briefingTable.zebraRow(idx),
                        animation: `briefingRowIn ${durationTokens.standard}ms ${easeTokens.decelerate} both`,
                        animationDelay: `${dayIndex * ROW_STAGGER_MS}ms`,
                      }}
                    >
                      <td
                        colSpan={leadCount}
                        title={`${comboLabel(p)} ｜ ${expandLabel}对比`}
                        style={{
                          ...briefingTable.bodyCell(),
                          paddingLeft: 24,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <Box
                            aria-hidden
                            sx={{
                              width: 2,
                              height: 14,
                              borderRadius: 1,
                              bgcolor: "primary.main",
                              opacity: 0.5,
                            }}
                          />
                          {day.row.label ?? day.row.date}
                        </Box>
                      </td>
                      {metricCellsText(day.values, ltvDays).map((cell) => (
                        <td
                          key={cell.key}
                          style={smallNumCell}
                          title={cell.title}
                        >
                          <span
                            style={
                              cell.color ? { color: cell.color } : undefined
                            }
                          >
                            {cell.text}
                          </span>
                        </td>
                      ))}
                      <td style={smallNumCell}>
                        <StatusDot
                          achieved={(day.row.roi1 ?? 0) >= breakevenLine}
                          invested={day.row.spend > 0}
                        />
                      </td>
                    </tr>
                  ))}
                  {showDaily && days.length === 0 && (
                    <tr>
                      <td
                        colSpan={columnCount}
                        style={{
                          ...briefingTable.bodyCell(),
                          paddingLeft: 24,
                          color: "text.secondary",
                        }}
                      >
                        暂无{expandLabel}明细
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Box>
    </Paper>
  );
}

/** The daily rows a combination discloses, oldest first, with 环比 wired up. */
function disclosedDays(
  project: ProjectRow,
  showDaily: boolean,
): { row: DailyTrendRow; values: MetricValues }[] {
  if (!showDaily) return [];
  const ordered = [...(project.daily ?? [])].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  return ordered.map((row, i) => ({
    row,
    values: metricRowValues(row, ordered[i - 1]),
  }));
}

function StatusDot({
  achieved,
  invested = true,
}: {
  achieved: boolean;
  invested?: boolean;
}) {
  const color = !invested
    ? supersetPalette.text.secondary
    : achieved
      ? supersetPalette.status.success
      : supersetPalette.status.error;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        color,
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          bgcolor: color,
        }}
      />
      {!invested ? "无投放" : achieved ? "达标" : "未达标"}
    </Box>
  );
}

/**
 * Marks a row whose figures are the period subtotal of the daily rows it
 * discloses, so a changed number is never mistaken for the report day.
 */
function TotalTag({ days }: { days: number }) {
  return (
    <Box
      component="span"
      title={`本行为展开的 ${days} 天明细汇总`}
      sx={{
        px: 0.5,
        py: 0.1,
        borderRadius: 0.5,
        bgcolor: supersetPalette.primary.container,
        color: supersetPalette.primary.onContainer,
        fontSize: "0.6875rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      合计 {days} 天
    </Box>
  );
}

/** Signed change badge used by the core-metric band. */
function DeltaBadge({
  value,
  higherIsBetter = true,
  neutral = false,
}: {
  value: number | null;
  higherIsBetter?: boolean;
  neutral?: boolean;
}) {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        -
      </Typography>
    );
  }
  const up = value >= 0;
  const color = neutral
    ? supersetPalette.text.secondary
    : up === higherIsBetter
      ? supersetPalette.status.success
      : supersetPalette.status.error;
  return (
    <Typography variant="body2" sx={{ color, fontWeight: 600 }}>
      {up ? "▲" : "▼"} {Math.abs(value * 100).toFixed(1)}%
    </Typography>
  );
}

function TrendChart({
  rows,
  title = "分天对比",
  onSelect,
  footer,
}: {
  rows: DailyTrendRow[];
  title?: string;
  onSelect?: (label: string) => void;
  /** Attached strip below the plot, inside the same surface. */
  footer?: ReactNode;
}) {
  // The series is newest-first; flip to chronological so the time axis reads
  // left-to-right as past → reported period.
  const ordered = useMemo(() => [...rows].reverse(), [rows]);

  const onEvents = useMemo(
    () =>
      onSelect
        ? {
            click: (p: any) => {
              if (
                p?.componentType === "series" &&
                p?.seriesType === "bar" &&
                p.name
              ) {
                // The axis shows the bucket's display label ("MM-DD ~ MM-DD"
                // for weekly briefings); report the canonical bucket key (the
                // ISO start date) so callers can match payload rows by ``date``.
                const clicked = ordered.find(
                  (r) => (r.label ?? r.date) === p.name,
                );
                onSelect(clicked ? clicked.date : p.name);
              }
            },
          }
        : undefined,
    [onSelect, ordered],
  );

  // Memoised: a stable option identity is what keeps ECharts from being
  // re-configured (and losing hover/tooltip state) on unrelated re-renders.
  const option: EChartsOption = useMemo(() => {
    const dates = ordered.map((r) => r.label ?? r.date);
    const spends = ordered.map((r) => r.spend);
    const roi1s = ordered.map((r) => r.roi1);
    const ltv1s = ordered.map((r) => r.ltv1);
    const users = ordered.map((r) => r.new_users);
    return {
      grid: { left: 96, right: 104, top: 48, bottom: 28 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params];
          const lines = list.map((p: any) => {
            if (p.seriesName === "返点后消耗")
              return `${p.marker}${p.seriesName}: ${formatNumber(p.value)}`;
            if (p.seriesName === "新增进入")
              return `${p.marker}${p.seriesName}: ${formatNumber(p.value, 0)}`;
            if (p.seriesName === "ROI1")
              return `${p.marker}${p.seriesName}: ${formatPercent(p.value)}`;
            // LTV 是金额小数，不按百分比展示
            return `${p.marker}${p.seriesName}: ${formatNumber(p.value, 2)}`;
          });
          return `${list[0]?.axisValue ?? ""}<br/>${lines.join("<br/>")}`;
        },
      },
      legend: {
        data: ["返点后消耗", "ROI1", "LTV1", "新增进入"],
        type: "scroll",
        top: 8,
        textStyle: { color: TEXT_MUTED, fontSize: 12 },
        itemWidth: 14,
        itemHeight: 8,
      },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: {
          color: TEXT_MUTED,
          fontSize: 12,
          // Long histories crowd the axis; let ECharts thin labels out and
          // tilt them once buckets get numerous.
          interval: "auto",
          rotate: dates.length > 8 ? 30 : 0,
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: DIVIDER } },
      },
      yAxis: [
        {
          type: "value",
          name: "消耗",
          nameTextStyle: { color: TEXT_MUTED, fontSize: 12 },
          axisLabel: {
            color: TEXT_MUTED,
            fontSize: 12,
            formatter: (v: number) => formatNumber(v),
          },
          splitLine: { lineStyle: { color: DIVIDER } },
        },
        {
          type: "value",
          name: "新增",
          nameTextStyle: { color: TEXT_MUTED, fontSize: 12 },
          position: "left",
          offset: 56,
          axisLabel: {
            color: TEXT_MUTED,
            fontSize: 12,
            formatter: (v: number) => formatNumber(v, 0),
          },
          splitLine: { show: false },
        },
        {
          type: "value",
          name: "ROI",
          nameTextStyle: { color: TEXT_MUTED, fontSize: 12 },
          position: "right",
          axisLabel: {
            color: TEXT_MUTED,
            fontSize: 12,
            formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
          },
          splitLine: { show: false },
        },
        {
          type: "value",
          name: "LTV",
          nameTextStyle: { color: TEXT_MUTED, fontSize: 12 },
          position: "right",
          offset: 56,
          axisLabel: {
            color: TEXT_MUTED,
            fontSize: 12,
            formatter: (v: number) => formatNumber(v, 1),
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "返点后消耗",
          type: "bar",
          yAxisIndex: 0,
          data: spends,
          cursor: onSelect ? "pointer" : "default",
          emphasis: { focus: "series" },
          itemStyle: {
            color: BRIEFING_CHART_COLORS.spend,
            borderRadius: [3, 3, 0, 0],
          },
          barMaxWidth: 26,
        },
        {
          name: "新增进入",
          type: "bar",
          yAxisIndex: 1,
          data: users,
          cursor: onSelect ? "pointer" : "default",
          emphasis: { focus: "series" },
          itemStyle: {
            color: BRIEFING_CHART_COLORS.newUsers,
            borderRadius: [3, 3, 0, 0],
          },
          barMaxWidth: 26,
        },
        {
          name: "ROI1",
          type: "line",
          yAxisIndex: 2,
          data: roi1s,
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          emphasis: { focus: "series" },
          itemStyle: { color: BRIEFING_CHART_COLORS.roi1 },
          lineStyle: { width: 2 },
        },
        {
          // Dashed so the two lines stay separable by more than hue alone.
          name: "LTV1",
          type: "line",
          yAxisIndex: 3,
          data: ltv1s,
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          emphasis: { focus: "series" },
          itemStyle: { color: BRIEFING_CHART_COLORS.ltv1 },
          lineStyle: { width: 2, type: "dashed" },
        },
      ],
    };
  }, [ordered, onSelect]);

  return (
    // The padding lives on an inner box so ``footer`` can run full-bleed to the
    // surface's edges, exactly like §1's 分业务板块 strip.
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1,
          }}
        >
          {title ? (
            <Typography variant="subtitle1">{title}</Typography>
          ) : (
            <span />
          )}
          {onSelect && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              点击柱可下钻
            </Typography>
          )}
        </Box>
        <EChart
          option={option}
          height={360}
          onEvents={onEvents}
          ariaLabel={`${title}：按时间对比返点后消耗、新增进入、ROI1 与 LTV1，点击柱可下钻查看当天的分游戏明细`}
        />
      </Box>
      {footer}
    </Paper>
  );
}

interface ComboRow {
  label: string;
  spend: number;
  new_users: number;
  ltv1: number | null;
  roi1: number | null;
  roi_cum?: number | null;
  roi_flow?: number | null;
  prev?: {
    spend: number;
    new_users: number;
    ltv1: number | null;
    roi1: number | null;
  };
}

function aggregateByChannel(projects: ProjectRow[], game: string): ComboRow[] {
  const rows = projects.filter((p) => p.project === game);
  const map = new Map<
    string,
    {
      spend: number;
      users: number;
      ltv1w: number;
      roi1w: number;
      pSpend: number;
      pUsers: number;
      pLtv1w: number;
      pRoi1w: number;
    }
  >();
  for (const p of rows) {
    const ch = p.channel || "—";
    const g: {
      spend: number;
      users: number;
      ltv1w: number;
      roi1w: number;
      pSpend: number;
      pUsers: number;
      pLtv1w: number;
      pRoi1w: number;
    } = map.get(ch) ?? {
      spend: 0,
      users: 0,
      ltv1w: 0,
      roi1w: 0,
      pSpend: 0,
      pUsers: 0,
      pLtv1w: 0,
      pRoi1w: 0,
    };
    g.spend += p.spend;
    g.users += p.new_users;
    g.ltv1w += (p.ltv1 ?? 0) * (p.new_users || 0);
    g.roi1w += (p.roi1 ?? 0) * (p.spend || 0);
    const pv = p.prev ?? { spend: 0, new_users: 0, ltv1: 0, roi1: 0 };
    g.pSpend += pv.spend ?? 0;
    g.pUsers += pv.new_users ?? 0;
    g.pLtv1w += (pv.ltv1 ?? 0) * (pv.new_users ?? 0);
    g.pRoi1w += (pv.roi1 ?? 0) * (pv.spend ?? 0);
    map.set(ch, g);
  }
  return [...map.entries()]
    .map(([ch, g]) => ({
      label: ch,
      spend: g.spend,
      new_users: g.users,
      ltv1: g.users ? g.ltv1w / g.users : null,
      roi1: g.spend ? g.roi1w / g.spend : null,
      prev: {
        spend: g.pSpend,
        new_users: g.pUsers,
        ltv1: g.pUsers ? g.pLtv1w / g.pUsers : null,
        roi1: g.pSpend ? g.pRoi1w / g.pSpend : null,
      },
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, MAX_DRILL_SERIES);
}

function MetricsComboChart({
  rows,
  title = "明细",
  onSelect,
  onBack,
}: {
  rows: ComboRow[];
  title?: string;
  onSelect?: (label: string) => void;
  onBack?: () => void;
}) {
  const onEvents = useMemo(
    () =>
      onSelect
        ? {
            click: (p: any) => {
              if (
                p?.componentType === "series" &&
                p?.seriesType === "bar" &&
                p.name
              ) {
                onSelect(p.name);
              }
            },
          }
        : undefined,
    [onSelect],
  );

  // Memoised on the rows: an unchanged option keeps ECharts from re-running
  // ``setOption`` (and dropping hover state) when the page re-renders.
  const option: EChartsOption = useMemo(() => {
    const categories = rows.map((r) => r.label);
    const spends = rows.map((r) => r.spend);
    const users = rows.map((r) => r.new_users);
    const roi1s = rows.map((r) => r.roi1);
    const ltv1s = rows.map((r) => r.ltv1);
    const pct = (cur?: number | null, base?: number | null) =>
      base ? ((cur ?? 0) - base) / base : null;
    const fmtDelta = (d: number | null) =>
      d === null || Number.isNaN(d)
        ? "-"
        : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(1)}%`;

    return {
      grid: { left: 96, right: 104, top: 48, bottom: 56 },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (params: any) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = arr[0].dataIndex;
          const p = rows[idx];
          const lines = arr.map((s: any) => {
            if (s.seriesName === "返点后消耗")
              return `${s.marker}${s.seriesName}: ${formatNumber(s.value)}（${fmtDelta(pct(p.spend, p.prev?.spend))}）`;
            if (s.seriesName === "新增进入")
              return `${s.marker}${s.seriesName}: ${formatNumber(s.value, 0)}（${fmtDelta(pct(p.new_users, p.prev?.new_users))}）`;
            if (s.seriesName === "ROI1")
              return `${s.marker}${s.seriesName}: ${formatPercent(s.value)}（${fmtDelta(pct(p.roi1, p.prev?.roi1))}）`;
            // LTV 是金额小数，不按百分比展示
            return `${s.marker}${s.seriesName}: ${formatNumber(s.value, 2)}（${fmtDelta(pct(p.ltv1, p.prev?.ltv1))}）`;
          });
          return `${p.label}<br/>${lines.join("<br/>")}`;
        },
      },
      legend: {
        data: ["返点后消耗", "ROI1", "LTV1", "新增进入"],
        type: "scroll",
        top: 8,
        textStyle: { color: TEXT_MUTED, fontSize: 12 },
        itemWidth: 14,
        itemHeight: 8,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: TEXT_MUTED,
          fontSize: 12,
          rotate: categories.length > 6 ? 30 : 0,
          interval: 0,
        },
        axisLine: { lineStyle: { color: DIVIDER } },
      },
      yAxis: [
        {
          type: "value",
          name: "消耗",
          nameTextStyle: { color: TEXT_MUTED, fontSize: 12 },
          axisLabel: {
            color: TEXT_MUTED,
            formatter: (v: number) => formatNumber(v),
          },
          splitLine: { lineStyle: { color: DIVIDER } },
        },
        {
          type: "value",
          name: "新增",
          nameTextStyle: { color: TEXT_MUTED, fontSize: 12 },
          position: "left",
          offset: 56,
          axisLabel: {
            color: TEXT_MUTED,
            formatter: (v: number) => formatNumber(v, 0),
          },
          splitLine: { show: false },
        },
        {
          type: "value",
          name: "ROI",
          nameTextStyle: { color: TEXT_MUTED, fontSize: 12 },
          position: "right",
          axisLabel: {
            color: TEXT_MUTED,
            formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
          },
          splitLine: { show: false },
        },
        {
          type: "value",
          name: "LTV",
          nameTextStyle: { color: TEXT_MUTED, fontSize: 12 },
          position: "right",
          offset: 56,
          axisLabel: {
            color: TEXT_MUTED,
            formatter: (v: number) => formatNumber(v, 1),
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "返点后消耗",
          type: "bar",
          yAxisIndex: 0,
          data: spends,
          cursor: onSelect ? "pointer" : "default",
          emphasis: { focus: "series" },
          itemStyle: {
            color: BRIEFING_CHART_COLORS.spend,
            borderRadius: [3, 3, 0, 0],
          },
          barMaxWidth: 26,
        },
        {
          name: "新增进入",
          type: "bar",
          yAxisIndex: 1,
          data: users,
          cursor: onSelect ? "pointer" : "default",
          emphasis: { focus: "series" },
          itemStyle: {
            color: BRIEFING_CHART_COLORS.newUsers,
            borderRadius: [3, 3, 0, 0],
          },
          barMaxWidth: 26,
        },
        {
          name: "ROI1",
          type: "line",
          yAxisIndex: 2,
          data: roi1s,
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          emphasis: { focus: "series" },
          itemStyle: { color: BRIEFING_CHART_COLORS.roi1 },
          lineStyle: { width: 2 },
        },
        {
          // Dashed so the two lines stay separable by more than hue alone.
          name: "LTV1",
          type: "line",
          yAxisIndex: 3,
          data: ltv1s,
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          emphasis: { focus: "series" },
          itemStyle: { color: BRIEFING_CHART_COLORS.ltv1 },
          lineStyle: { width: 2, type: "dashed" },
        },
      ],
    };
  }, [rows, onSelect]);

  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {onBack && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={onBack}
            >
              返回
            </Button>
          )}
          <Typography variant="subtitle1">{title}</Typography>
        </Box>
        {onSelect && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            点击柱可下钻
          </Typography>
        )}
      </Box>
      <EChart
        option={option}
        height={Math.max(300, rows.length * 30)}
        onEvents={onEvents}
        ariaLabel={`${title}：按维度对比返点后消耗、新增进入、ROI1 与 LTV1${
          onSelect ? "，点击柱可下钻查看渠道明细" : ""
        }`}
      />
    </Paper>
  );
}

function MediaQualitySummary({
  media,
  breakevenLine,
  onSelect,
}: {
  media: MediaRow[];
  breakevenLine: number;
  /** Click gesture shared with the chart: open that media's 主游戏 breakdown. */
  onSelect?: (channel: string) => void;
}) {
  const valid = media.filter((m) => (m.roi1 ?? 0) > 0);
  if (valid.length === 0) return null;
  const best = valid.reduce((a, b) => ((b.roi1 ?? 0) > (a.roi1 ?? 0) ? b : a));
  const worst = valid.reduce((a, b) => ((b.roi1 ?? 0) < (a.roi1 ?? 0) ? b : a));
  // Clicking a chip is the same gesture as clicking its bar, so the summary
  // reads as an entry point into the breakdown rather than a dead read-out.
  const drillProps = (channel: string) =>
    onSelect
      ? {
          onClick: () => onSelect(channel),
          title: `查看 ${channel} 的主游戏明细`,
        }
      : {};
  const fmtDelta = (d: number | null) =>
    d === null || Number.isNaN(d)
      ? ""
      : `（环比 ${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(1)}%）`;
  const bestRoi1 = best.roi1 ?? 0;
  const bestPrevRoi1 = best.prev?.roi1;
  const worstRoi1 = worst.roi1 ?? 0;
  const worstPrevRoi1 = worst.prev?.roi1;
  const bestDelta = bestPrevRoi1
    ? (bestRoi1 - bestPrevRoi1) / bestPrevRoi1
    : null;
  const worstDelta = worstPrevRoi1
    ? (worstRoi1 - worstPrevRoi1) / worstPrevRoi1
    : null;
  const items: ReactNode[] = [
    <Chip
      key="best"
      size="small"
      color="success"
      variant="outlined"
      label={`最佳媒体：${best.channel}（ROI1 ${formatPercent(
        bestRoi1,
      )}${fmtDelta(bestDelta)}）`}
      {...drillProps(best.channel)}
    />,
  ];
  if ((worst.roi1 ?? 0) < breakevenLine) {
    items.push(
      <Chip
        key="worst"
        size="small"
        color="warning"
        variant="outlined"
        label={`需关注：${worst.channel}（ROI1 ${formatPercent(
          worstRoi1,
        )}${fmtDelta(worstDelta)}）`}
        {...drillProps(worst.channel)}
      />,
    );
  }
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
      {items}
    </Box>
  );
}

/**
 * One row of the media chart: a platform heading, or a media bar under it.
 *
 * The chart reads 客户端 as the first level and 媒体 as the second, so the rows
 * are flat with explicit headings — a media that bought on several platforms
 * appears once under each of them, separated by the heading, rather than as
 * adjacent bars inside one group.
 */
interface MediaSpendRow {
  kind: "header" | "bar";
  /** The platform on a heading row, the media on a bar row. */
  label: string;
  /** The platform a bar sits under; empty when there is no platform cut. */
  platform: string;
  /** Heading: the platform's total; bar: the media's spend on that platform. */
  spend: number;
  /** Bars only: how the bar is coloured. */
  roi1?: number | null;
  prev?: { roi1?: number | null } | null;
}

/**
 * The slice of ECharts' axis-tooltip payload this chart reads.
 *
 * Narrower than the library's own callback type on purpose: one hovered entry
 * per series, and all the formatter needs is which row it points at — the
 * figures are read back from the rows.
 */
interface SpendTooltipParams {
  dataIndex: number;
}

/** ROI1 quality → bar colour.  Mirrors the backend's alert ladder. */
const ROI_QUALITY_COLOR: Record<RoiQuality, string> = {
  good: supersetPalette.status.success,
  warning: supersetPalette.status.warning,
  critical: supersetPalette.status.error,
  // No ROI column mapped: a neutral bar reads as "not rated", not as failure.
  unknown: BRIEFING_CHART_COLORS.spend,
};

const ROI_QUALITY_LABEL: Record<RoiQuality, string> = {
  good: "达标",
  warning: "中",
  critical: "低",
  unknown: "无 ROI",
};

/** Compact percentage for the legend's threshold ranges. */
function thresholdPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * 媒体消耗分布, with ROI1 quality carried by the bar colour.
 *
 * The overview stacks two levels on the y-axis: 客户端 headings, with the
 * media bought on each platform under them, so one media reads as separate
 * bars wherever it bought.  The drill into a media has no platform cut and
 * falls back to one bar per 主游戏.  Either way the plot reads the same way:
 * length is 返点后消耗, colour is how the ROI1 sits against the breakeven and
 * critical lines.
 */
function MediaSpendChart({
  rows,
  title,
  breakevenLine,
  criticalLine,
  onSelect,
  onBack,
}: {
  rows: MediaSpendRow[];
  title: string;
  breakevenLine: number;
  criticalLine: number;
  /** Drill gesture: clicking a bar opens that media's 主游戏 breakdown. */
  onSelect?: (label: string) => void;
  /** Set while drilled in, so the panel keeps the way back on screen. */
  onBack?: () => void;
}) {
  const grouped = rows.some((row) => row.kind === "header");
  const hasRoi = rows.some(
    (row) => row.kind === "bar" && row.roi1 !== null && row.roi1 !== undefined,
  );

  const onEvents = useMemo(
    () =>
      onSelect
        ? {
            click: (p: {
              componentType?: string;
              seriesType?: string;
              name?: string;
            }) => {
              if (
                p?.componentType === "series" &&
                p?.seriesType === "bar" &&
                p.name
              ) {
                onSelect(p.name);
              }
            },
          }
        : undefined,
    [onSelect],
  );

  const option: EChartsOption = useMemo(() => {
    const pct = (cur?: number | null, base?: number | null) =>
      base ? ((cur ?? 0) - base) / base : null;
    return {
      grid: { left: grouped ? 150 : 96, right: 96, top: 8, bottom: 24 },
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "shadow" },
        formatter: (params: SpendTooltipParams | SpendTooltipParams[]) => {
          const arr = Array.isArray(params) ? params : [params];
          const row = arr.length > 0 ? rows[arr[0].dataIndex] : undefined;
          if (!row) return "";
          if (row.kind === "header") {
            return `<strong>${row.label}</strong><br/>消耗合计 ${formatNumber(
              row.spend,
            )}`;
          }
          const level = roiQuality(row.roi1, breakevenLine, criticalLine);
          const roiD = pct(row.roi1, row.prev?.roi1);
          return [
            `<strong>${row.label}</strong>${
              row.platform ? ` · ${row.platform}` : ""
            }`,
            `消耗 ${formatNumber(row.spend)} ｜ ROI1 ${formatPercent(row.roi1)}（${
              roiD === null
                ? "-"
                : (roiD >= 0 ? "+" : "") + (roiD * 100).toFixed(1) + "%"
            }）｜ ${ROI_QUALITY_LABEL[level]}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "value",
        // A handful of round ticks: the default density overlaps itself once
        // the card is as narrow as a phone, and axis labels carry no decimals
        // where the bar labels keep the table's precision.
        splitNumber: 4,
        axisLabel: {
          color: TEXT_MUTED,
          fontSize: 12,
          hideOverlap: true,
          formatter: (v: number) => {
            if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
            if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}K`;
            return `${v}`;
          },
        },
        splitLine: { lineStyle: { color: DIVIDER } },
      },
      yAxis: {
        type: "category",
        // Rows arrive in reading order (biggest platform first, its media
        // spend-descending); inverting the axis puts the first row on top.
        inverse: true,
        data: rows.map((row) => row.label),
        axisLabel: {
          color: TEXT_MUTED,
          fontSize: 12,
          // The heading is the first level, so it is the heavier one and
          // carries the platform's total; its media read under it.
          formatter: (value: string, index: number) => {
            const row = rows[index];
            return row?.kind === "header"
              ? `{h|${value}} {t|${formatNumber(row.spend)}}`
              : `{m|${value}}`;
          },
          rich: {
            h: { color: TEXT_MUTED, fontSize: 12, fontWeight: 700 },
            t: { color: TEXT_MUTED, fontSize: 11 },
            m: { color: TEXT_MUTED, fontSize: 12 },
          },
        },
        axisLine: { lineStyle: { color: DIVIDER } },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 16,
          label: {
            show: true,
            position: "right",
            distance: 6,
            fontSize: 12,
            color: TEXT_MUTED,
            formatter: (p: { value?: unknown }) =>
              typeof p.value === "number" ? formatNumber(p.value) : "",
          },
          data: rows.map((row) =>
            row.kind === "header"
              ? null
              : {
                  value: row.spend,
                  itemStyle: {
                    color:
                      ROI_QUALITY_COLOR[
                        roiQuality(row.roi1, breakevenLine, criticalLine)
                      ],
                    borderRadius: [0, 3, 3, 0],
                  },
                },
          ),
          // A hairline over each heading (the first one needs none): the two
          // levels read as blocks rather than one long list of bars.
          markLine: grouped
            ? {
                symbol: "none",
                silent: true,
                label: { show: false },
                lineStyle: { color: DIVIDER, type: "solid", width: 1 },
                data: rows
                  .map((row, index) => ({ row, index }))
                  .filter(
                    ({ row, index }) => row.kind === "header" && index > 0,
                  )
                  .map(({ index }) => ({ yAxis: index - 0.5 })),
              }
            : undefined,
        },
      ],
    };
  }, [rows, grouped, breakevenLine, criticalLine]);

  // The overview has nothing to show without a single plottable row; a drilled
  // panel still renders, so the way back never disappears with its bars.
  if (rows.length === 0 && !onBack) return null;

  const height = Math.max(200, rows.length * 28 + 16);
  const legend: { level: RoiQuality; range: string }[] = [
    {
      level: "good",
      range: `≥${thresholdPercent(breakevenLine)}`,
    },
    {
      level: "warning",
      range: `${thresholdPercent(criticalLine)}~${thresholdPercent(breakevenLine)}`,
    },
    {
      level: "critical",
      range: `<${thresholdPercent(criticalLine)}`,
    },
  ];

  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 0.5,
        }}
      >
        <Typography variant="subtitle1">{title}</Typography>
        {onBack && (
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={onBack}>
            返回全部媒体
          </Button>
        )}
      </Box>
      {rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: TEXT_MUTED, py: 2 }}>
          该媒体本期没有可展开的主游戏明细。
        </Typography>
      ) : (
        <>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1.5,
              mb: 1,
            }}
          >
            <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
              {`条形=${SPEND_LABEL}${
                grouped ? "（一级=客户端，二级=媒体）" : ""
              }${hasRoi ? "，颜色=ROI1：" : ""}`}
            </Typography>
            {hasRoi &&
              legend.map(({ level, range }) => (
                <Box
                  key={level}
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "2px",
                      bgcolor: ROI_QUALITY_COLOR[level],
                    }}
                  />
                  <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                    {`${ROI_QUALITY_LABEL[level]}（${range}）`}
                  </Typography>
                </Box>
              ))}
          </Box>
          <EChart
            option={option}
            onEvents={onEvents}
            height={height}
            ariaLabel={`${title}：${rows
              .map((row) =>
                row.kind === "header"
                  ? `【${row.label}】合计 ${formatNumber(row.spend)}`
                  : `${row.label} ${formatNumber(row.spend)}`,
              )
              .join("，")}；颜色区分 ROI1 质量${
              onSelect ? "，点击柱可下钻到主游戏" : ""
            }`}
          />
        </>
      )}
    </Paper>
  );
}

/**
 * 媒体 → 主游戏 detail table under the media chart.
 *
 * The media view is the auxiliary perspective, so this table stays compact: one
 * row per media with the headline metrics, expanding into the games that media
 * bought.  A result generated before the drill existed carries no 主游戏 rows,
 * in which case the table simply reads as a media-level summary.
 *
 * The outer dimension can be swapped: the same rows read 主游戏 × 媒体 when the
 * reader wants to know which media a game ran through rather than which games a
 * media bought.  ``mode`` only decides which dimension the groups and their
 * members are read from — the metrics, the expand gestures and the chart's
 * highlight follow the swap.
 */
type MediaGroupMode = "media" | "project";

/** One outer row of the media table plus the inner rows behind it. */
interface MediaTableGroup {
  /** The outer group's value: a media channel or a 主游戏, per the mode. */
  key: string;
  /** Metrics for the outer row. */
  row: MediaRow | MediaRollupRow;
  /** The inner cut behind the outer row, in payload order. */
  members: MediaProjectRow[];
}

function MediaBreakdownTable({
  groups,
  mode,
  breakevenLine,
  expanded,
  onToggle,
  onToggleAll,
  onSwapDimensions,
  highlighted,
}: {
  groups: MediaTableGroup[];
  mode: MediaGroupMode;
  breakevenLine: number;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  /** Swaps the outer and inner dimensions; omitted with nothing to swap. */
  onSwapDimensions?: () => void;
  /** The media the chart is drilled into, so the table marks the same rows. */
  highlighted?: string | null;
}) {
  const pct = (cur?: number | null, base?: number | null) =>
    base ? ((cur ?? 0) - base) / base : null;
  const numCell = briefingTable.bodyCell({ numeric: true });
  const smallNumCell = { ...numCell, fontSize: "12px" } as const;
  const byMedia = mode === "media";
  const outerLabel = byMedia ? "媒体" : "主游戏";
  const innerLabel = byMedia ? "主游戏" : "媒体";
  const head = [
    { label: outerLabel },
    { label: SPEND_LABEL, numeric: true },
    { label: USERS_LABEL, numeric: true },
    { label: "CPA", numeric: true },
    { label: "ROI1", numeric: true },
    { label: "LTV1", numeric: true },
    { label: "状态", numeric: true },
  ];
  const expandable = groups.some((g) => g.members.length > 0);
  const allOpen = expandable && groups.every((g) => expanded.has(g.key));

  const metricCells = (
    row: MediaRow | MediaProjectRow | MediaRollupRow,
    small = false,
  ) => {
    const cell = small ? smallNumCell : numCell;
    return (
      <>
        <td style={cell}>{formatNumber(row.spend)}</td>
        <td style={cell}>{formatNumber(row.new_users, 0)}</td>
        <td style={cell}>{formatNumber(row.cpa)}</td>
        <td style={cell}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 0.75,
            }}
          >
            {formatPercent(row.roi1)}
            <DeltaBadge value={pct(row.roi1, row.prev?.roi1)} />
          </Box>
        </td>
        <td style={cell}>{formatNumber(row.ltv1, 2)}</td>
        <td style={cell}>
          <StatusDot
            achieved={(row.roi1 ?? 0) >= breakevenLine}
            invested={row.spend > 0}
          />
        </td>
      </>
    );
  };

  if (groups.length === 0) return null;

  return (
    <Paper sx={{ p: 2, mt: 2 }} variant="outlined">
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
          // Narrow screens: the title takes the first line and the controls
          // wrap under it rather than squeezing the buttons into a column.
          flexWrap: "wrap",
          mb: 1,
        }}
      >
        <Typography variant="subtitle1">
          {expandable
            ? `${outerLabel} × ${innerLabel} 明细（含环比）`
            : "媒体 明细（含环比）"}
        </Typography>
        {expandable && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            {onSwapDimensions && (
              <Tooltip
                // Keeps the visible label as the button's accessible name; the
                // default (``aria-label``) would replace it with the sentence.
                describeChild
                title={`调换内外维度：${
                  byMedia
                    ? "改为按主游戏分组、媒体作内层"
                    : "改为按媒体分组、主游戏作内层"
                }`}
              >
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<SwapHorizIcon />}
                  onClick={onSwapDimensions}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  调换维度
                </Button>
              </Tooltip>
            )}
            <Button
              size="small"
              variant={allOpen ? "contained" : "outlined"}
              color="primary"
              onClick={onToggleAll}
              aria-expanded={allOpen}
              sx={{ whiteSpace: "nowrap" }}
            >
              {allOpen ? `收起${innerLabel}` : `分${innerLabel}`}
            </Button>
          </Box>
        )}
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <table
          className={BRIEFING_TABLE_CLASS}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
            textAlign: "left",
          }}
        >
          <thead>
            <tr>
              {head.map((c) => (
                <th
                  key={c.label}
                  style={briefingTable.headCell(undefined, {
                    numeric: c.numeric,
                  })}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group, idx) => {
              const isOpen = expanded.has(group.key);
              // In the media view the drilled media *is* the outer row; once
              // the dimensions swap it is one of the inner rows instead.
              const isActive = byMedia && highlighted === group.key;
              return (
                <Fragment key={group.key}>
                  <tr
                    style={{
                      ...briefingTable.zebraRow(idx),
                      // The drilled media keeps the mark in the table, so the
                      // chart and the row underneath it read as one selection.
                      ...(isActive
                        ? { backgroundColor: supersetPalette.primary.container }
                        : {}),
                    }}
                  >
                    <td style={briefingTable.bodyCell()}>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                      >
                        {expandable && (
                          <IconButton
                            size="small"
                            sx={{ p: 0.25 }}
                            onClick={() => onToggle(group.key)}
                            disabled={group.members.length === 0}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "收起" : "展开"} ${group.key} 的${innerLabel}明细`}
                          >
                            {isOpen ? (
                              <ExpandLessIcon fontSize="small" />
                            ) : (
                              <ExpandMoreIcon fontSize="small" />
                            )}
                          </IconButton>
                        )}
                        {group.key}
                      </Box>
                    </td>
                    {metricCells(group.row)}
                  </tr>
                  {isOpen &&
                    group.members.map((member, gi) => {
                      // The inner cell reads the dimension the outer one is
                      // not: a media's rows disclose games, a game's disclose
                      // media — and the key has to follow, or two rows of the
                      // same media would collide.
                      const memberLabel = byMedia
                        ? member.project
                        : member.channel;
                      const memberActive =
                        !byMedia && highlighted === member.channel;
                      return (
                        <tr
                          key={`${group.key}-${memberLabel}`}
                          style={{
                            ...briefingTable.zebraRow(idx),
                            animation: `briefingRowIn ${durationTokens.standard}ms ${easeTokens.decelerate} both`,
                            animationDelay: `${gi * ROW_STAGGER_MS}ms`,
                            ...(memberActive
                              ? {
                                  backgroundColor:
                                    supersetPalette.primary.container,
                                }
                              : {}),
                          }}
                        >
                          <td
                            style={{
                              ...briefingTable.bodyCell(),
                              paddingLeft: 24,
                            }}
                            title={`${group.key} ｜ ${innerLabel}`}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <Box
                                aria-hidden
                                sx={{
                                  width: 2,
                                  height: 14,
                                  borderRadius: 1,
                                  bgcolor: "primary.main",
                                  opacity: 0.5,
                                }}
                              />
                              {memberLabel}
                            </Box>
                          </td>
                          {metricCells(member, true)}
                        </tr>
                      );
                    })}
                  {isOpen && group.members.length === 0 && (
                    <tr>
                      <td
                        colSpan={head.length}
                        style={{
                          ...briefingTable.bodyCell(),
                          paddingLeft: 24,
                          color: "text.secondary",
                        }}
                      >
                        暂无{innerLabel}明细
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Box>
    </Paper>
  );
}

function reportChapters(trendLabel: string): { id: string; label: string }[] {
  return [
    { id: "sec-core", label: "核心指标" },
    { id: "sec-trend", label: trendLabel },
    { id: "sec-projects", label: "主游戏分析" },
    { id: "sec-media", label: "媒体分析" },
  ];
}

/** Horizontal cut (px) on each chapter card's leading and trailing edges. */
const CHAPTER_SLANT_PX = 9;
/** Floor on a step's width, so the shorter labels still read as full blocks. */
const CHAPTER_STEP_MIN_WIDTH = 104;

/**
 * Chapter jump nav, rendered inside the breadcrumb bar as a step progress bar.
 *
 * It started as a plain row of text buttons, which read as incidental chrome
 * rather than navigation.  Each chapter is now a slanted card in a stepped
 * bar — quadrilaterals cut on the leading and trailing edges, flat at the two
 * outer ends so the group still reads as one continuous control — and the fill
 * climbs with the reader's position: reached chapters tinted, the current one
 * solid, the rest neutral.  That makes "where am I" legible from the shape of
 * the bar alone, without reading the labels.
 */
function ChapterNav({
  chapters,
  activeId,
  onJump,
}: {
  chapters: { id: string; label: string }[];
  activeId: string;
  onJump: (id: string) => void;
}) {
  const activeIndex = Math.max(
    0,
    chapters.findIndex((c) => c.id === activeId),
  );
  return (
    <Box
      component="nav"
      aria-label="章节导航"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      {chapters.map((chapter, i) => {
        const active = i === activeIndex;
        const reached = i <= activeIndex;
        const first = i === 0;
        const last = i === chapters.length - 1;
        // A parallelogram per step: the leading edge leans one way and the
        // trailing edge the same way, so neighbours cut parallel to each other.
        const cut = `polygon(${first ? 0 : CHAPTER_SLANT_PX}px 0, 100% 0, calc(100% - ${
          last ? 0 : CHAPTER_SLANT_PX
        }px) 100%, 0 100%)`;
        return (
          <Box
            key={chapter.id}
            component="button"
            type="button"
            onClick={() => onJump(chapter.id)}
            aria-current={active ? "step" : undefined}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 32,
              minWidth: CHAPTER_STEP_MIN_WIDTH,
              border: 0,
              font: "inherit",
              fontSize: "0.9375rem",
              fontWeight: active ? 700 : 500,
              lineHeight: 1,
              letterSpacing: 0,
              px: `${CHAPTER_SLANT_PX + 12}px`,
              clipPath: cut,
              cursor: "pointer",
              whiteSpace: "nowrap",
              bgcolor: active
                ? "primary.main"
                : reached
                  ? "primary.container"
                  : "action.hover",
              color: active
                ? "primary.contrastText"
                : reached
                  ? "primary.onContainer"
                  : "text.disabled",
              transition: "background-color 150ms ease, color 150ms ease",
              "&:hover": {
                bgcolor: active ? "primary.dark" : "action.selected",
                color: active ? "primary.contrastText" : "text.primary",
              },
            }}
          >
            {chapter.label}
          </Box>
        );
      })}
    </Box>
  );
}

function JobLogPanel({
  logs,
  status,
  expanded,
  onToggle,
}: {
  logs: JobLog[];
  status: JobStatus;
  /** Whether the log body is shown; collapsed keeps a one-line summary bar. */
  expanded: boolean;
  onToggle: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (boxRef.current && expanded) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  const lastLine = logs[logs.length - 1]?.message;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 2,
        bgcolor: TERMINAL_BG,
        color: TERMINAL_TEXT,
        overflow: "hidden",
      }}
    >
      <Box
        onClick={onToggle}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          cursor: "pointer",
          userSelect: "none",
          "&:hover": { bgcolor: TERMINAL_HOVER },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: JOB_STATUS_COLOR[status], fontWeight: 600 }}
          >
            执行日志 · {JOB_STATUS_LABEL[status]}
          </Typography>
          {!expanded && lastLine && (
            <Typography variant="caption" noWrap sx={{ color: TERMINAL_MUTED }}>
              {lastLine}
            </Typography>
          )}
        </Box>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 18, color: TERMINAL_MUTED }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 18, color: TERMINAL_MUTED }} />
        )}
      </Box>
      <Collapse
        in={expanded}
        timeout={{
          enter: durationTokens.standard,
          exit: durationTokens.standard,
        }}
        unmountOnExit={false}
      >
        <Box
          ref={boxRef}
          sx={{
            maxHeight: 200,
            overflowY: "auto",
            px: 1.5,
            pb: 1.5,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            opacity: expanded ? 1 : 0,
            transition: `opacity ${durationTokens.quick}ms ${easeTokens.standard}`,
          }}
        >
          {logs.length === 0 && status === "running" && (
            <Box sx={{ color: TERMINAL_MUTED }}>等待任务启动…</Box>
          )}
          {logs.map((log, i) => (
            <Box
              key={`${log.ts}-${i}`}
              // New lines ease in so a busy job reads as progress rather than
              // as text appearing out of nowhere.
              sx={{
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                animation: `briefingLogLineIn ${durationTokens.micro}ms ease-out both`,
              }}
            >
              <span style={{ color: TERMINAL_MUTED }}>
                [{log.ts.split("T")[1] ?? log.ts}]{" "}
              </span>
              <span
                style={{ color: LOG_LEVEL_COLOR[log.level] ?? TERMINAL_TEXT }}
              >
                {log.message}
              </span>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

/**
 * Run status strip: phase dot, elapsed time and the latest log line.
 *
 * Replaces a generic indeterminate progress bar, which said "something is
 * happening" without saying what.
 */
function JobStatusBar({
  status,
  elapsedSec,
  lastLog,
}: {
  status: JobStatus;
  elapsedSec: number;
  lastLog: JobLog | null;
}) {
  const reduced = useReducedMotion();
  const running = status === "running";
  const color = JOB_STATUS_COLOR[status];

  return (
    <Paper
      variant="outlined"
      sx={{ mb: 2, overflow: "hidden", bgcolor: supersetPalette.surface.main }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 1.5,
          py: 1,
        }}
      >
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: color,
            animation:
              running && !reduced
                ? `${statusPulse} 1.4s ease-in-out infinite`
                : "none",
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600, color }}>
          {JOB_STATUS_LABEL[status]}
        </Typography>
        {running && (
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
          >
            已运行 {Math.floor(elapsedSec / 60)} 分{" "}
            {String(elapsedSec % 60).padStart(2, "0")} 秒
          </Typography>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }} />
        {lastLog && (
          <Typography
            variant="caption"
            noWrap
            sx={{ color: "text.secondary", maxWidth: { xs: 140, md: 420 } }}
          >
            {lastLog.message}
          </Typography>
        )}
      </Box>
      {running && (
        <Box
          sx={{
            position: "relative",
            height: 2,
            bgcolor: "action.hover",
            overflow: "hidden",
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "30%",
              bgcolor: "primary.main",
              animation: reduced
                ? "none"
                : `${railSweep} 1.6s ease-in-out infinite`,
            }}
          />
        </Box>
      )}
    </Paper>
  );
}

/**
 * The trend chart's text alternative: the same numbers as a table, so the
 * canvas is not the only way to read the report.
 */
export default function DailyReportDetail() {
  const { id } = useParams<{ id: string }>();
  const configId = Number(id);
  const navigate = useNavigate();
  const notify = useNotificationStore((s) => s.notify);

  const [reportName, setReportName] = useState("简报详情");
  // The briefing's own type ("daily" | "weekly"); resolved from the stored
  // config and mirrored by each generated result.
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [reportDate, setReportDate] = useState<Dayjs | null>(() =>
    dayjs().subtract(1, "day"),
  );
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const setCustomBreadcrumb = useBreadcrumbStore((s) => s.setCustom);
  const [configError, setConfigError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ReportParamValues | null>(null);
  const [saving, setSaving] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [logs, setLogs] = useState<JobLog[]>([]);
  // The live-log panel folds itself away once a run settles; the user can
  // re-open it from the collapsed summary bar.
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [result, setResult] = useState<DailyReportResult | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeSection, setActiveSection] = useState("sec-core");
  const [showComboDaily, setShowComboDaily] = useState(false);
  // 不分客户端: roll a game's channels into a single row.
  // 分渠道 is the report's default view; 分地区 refines it and is off by
  // default.  Region without the channel split is not a view the backend
  // produces, so the region switch is gated on the channel one.
  const [splitChannel, setSplitChannel] = useState(true);
  const [splitRegion, setSplitRegion] = useState(false);
  const [drillGame, setDrillGame] = useState<string | null>(null);
  const [drillDate, setDrillDate] = useState<string | null>(null);
  // 媒体分析: which media the ROI chart is drilled into, and which media rows
  // the 主游戏 breakdown is expanded for underneath it.  The two are kept
  // apart so expanding a row never moves the chart, while drilling into a bar
  // also opens that media's row.
  const [drillMedia, setDrillMedia] = useState<string | null>(null);
  const [expandedMedia, setExpandedMedia] = useState<Set<string>>(
    () => new Set(),
  );
  // The media table can swap its outer and inner dimensions.  Each orientation
  // keeps its own expansion set, so swapping back restores what was open.
  const [mediaGroupMode, setMediaGroupMode] = useState<MediaGroupMode>("media");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(),
  );
  // The report scrolls inside its own container (the chapter rail tracks it).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Once the reader touches the log panel, it stops folding itself away.
  const logsTouchedRef = useRef(false);

  // Reset the drill-down when a different report result is loaded.
  useEffect(() => {
    setDrillGame(null);
    setDrillDate(null);
    setDrillMedia(null);
    setExpandedMedia(new Set());
    setMediaGroupMode("media");
    setExpandedProjects(new Set());
  }, [result?.report_date]);

  // Live elapsed timer while a job is running (so a long query doesn't look stuck).
  useEffect(() => {
    if (jobStatus !== "running") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [jobStatus]);

  // Fold the log panel away shortly after a run settles: the final lines stay
  // readable for a moment, then the panel fades into its collapsed summary
  // bar.  A fresh run re-opens it immediately, and a panel the reader has
  // opened by hand is never closed underneath them.
  useEffect(() => {
    if (jobStatus === "idle") return;
    if (jobStatus === "running") {
      setLogsExpanded(true);
      return;
    }
    if (logsTouchedRef.current) return;
    const t = setTimeout(() => setLogsExpanded(false), 4000);
    return () => clearTimeout(t);
  }, [jobStatus]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const loadConfig = useCallback(async () => {
    if (!configId) return;
    try {
      const res = await api.get<{ result: Record<string, unknown> }>(
        `/briefing/configs/${configId}`,
      );
      setConfig(res.data.result);
      setReportName(String(res.data.result?.name ?? "简报详情"));
      setReportType(normalizeReportType(res.data.result?.report_type));
      setForm(paramsFromConfig(res.data.result));
    } catch {
      setConfigError("未找到该简报，可能已被删除。");
    }
  }, [configId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Restore the most recently generated result so a briefing survives
  // navigating away and back (the backend persists results per config).  Runs
  // once per mount; an active run sets its own result via polling.
  const restoredRef = useRef(false);
  const restoredDateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!configId || restoredRef.current) return;
    restoredRef.current = true;
    api
      .get<{ result: DailyReportResult | null }>(
        `/briefing/configs/${configId}/result`,
      )
      .then((res) => {
        const latest = res.data.result;
        if (latest) {
          setResult(latest);
          setJobStatus("done");
          setReportType(normalizeReportType(latest.report_type));
          if (latest.report_date) {
            restoredDateRef.current = latest.report_date;
            setReportDate(dayjs(latest.report_date));
          }
        }
      })
      .catch(() => {
        // No persisted result yet — the user can run the briefing to generate
        // one.
      });
  }, [configId]);

  // Keep the picker's default aligned with the briefing type.  Daily reports
  // on yesterday; weekly picks a date inside the target week, so anchor on the
  // same weekday last week — it always lands in the last complete week.  A
  // restored report keeps its own date instead.
  useEffect(() => {
    if (restoredDateRef.current) {
      setReportDate(dayjs(restoredDateRef.current));
      return;
    }
    setReportDate(
      reportType === "weekly"
        ? dayjs().subtract(7, "day")
        : dayjs().subtract(1, "day"),
    );
  }, [reportType]);

  useEffect(() => () => stopPolling(), []);

  // Scroll-spy: highlight the chapter currently in view so the side jump
  // indicator reflects scroll position.  Observes the report sections against
  // the viewport (the page itself is the scroll container).
  const chapters = useMemo(
    () =>
      reportChapters(
        normalizeReportType(result?.report_type ?? reportType) === "weekly"
          ? "分周对比"
          : "分天对比",
      ),
    [result?.report_type, reportType],
  );
  useEffect(() => {
    if (!result || result.empty) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        );
        setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    chapters.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [result, chapters]);

  // Chapters jump within the report's own scroll container; the browser walks
  // up to the nearest scrollable ancestor for us.
  const jumpToChapter = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);
  const hasChapters = Boolean(result && !result.empty);

  // The breadcrumb carries both the report name and the chapter jump nav: the
  // chapters are part of "where am I in this report", and hosting them here
  // keeps them off the plot area.  The active chapter is re-highlighted as the
  // scroll-spy moves, without tearing the breadcrumb down in between.
  useEffect(() => {
    if (!config) {
      setCustomBreadcrumb(null);
      return;
    }
    setCustomBreadcrumb({
      label: reportName,
      actions: hasChapters ? (
        <ChapterNav
          chapters={chapters}
          activeId={activeSection}
          onJump={jumpToChapter}
        />
      ) : undefined,
    });
  }, [
    config,
    reportName,
    chapters,
    activeSection,
    hasChapters,
    jumpToChapter,
    setCustomBreadcrumb,
  ]);

  // Clear on leave so no stale name lingers on the next route.
  useEffect(() => () => setCustomBreadcrumb(null), [setCustomBreadcrumb]);

  const loadJob = useCallback(async (jid: string) => {
    try {
      const res = await api.get<{ result: JobInfo }>(`/briefing/jobs/${jid}`);
      const job = res.data.result;
      setLogs(job.logs ?? []);
      setJobError(job.error ?? null);
      if (job.status === "done" && job.result) {
        setResult(job.result);
      }
      if (job.status !== "running") {
        setJobStatus(job.status);
        stopPolling();
      }
    } catch {
      // Ignore transient poll failures; the job continues in the background.
    }
  }, []);

  const run = useCallback(
    async (override?: Dayjs | null) => {
      if (!configId) return;
      // Avoid launching an invalid/duplicate run while one is in progress.
      if (jobStatus === "running") {
        notify({
          severity: "info",
          message: "该简报正在执行中，请先等待或停止当前任务。",
        });
        return;
      }
      stopPolling();
      setJobStatus("running");
      setLogs([]);
      setResult(null);
      setJobError(null);
      setStartedAt(Date.now());
      try {
        // The picker holds the report date the user wants to see.  Daily runs
        // treat `override_date` as the "as-of" date and report on the day
        // before it, so shift by one day to make the picked date the report
        // date; weekly runs select the natural (Sunday–Saturday) week
        // containing the picked date, so it is passed through unchanged.
        const params: { override_date?: string } = {};
        if (override) {
          params.override_date =
            reportType === "weekly"
              ? override.format("YYYY-MM-DD")
              : override.add(1, "day").format("YYYY-MM-DD");
        }
        const startRes = await api.post<{
          result: { job_id: string; status: string; already_running: boolean };
        }>("/briefing/jobs", { config_id: configId, ...params });
        const { job_id, already_running } = startRes.data.result;
        setJobId(job_id);
        if (already_running) {
          notify({
            severity: "info",
            message: "检测到该简报已有执行中的任务，已切换到该任务。",
          });
        }
        // Poll the job until it finishes.
        await loadJob(job_id);
        pollRef.current = setInterval(() => {
          void loadJob(job_id);
        }, 1500);
      } catch (e) {
        const backendError = (
          e as { response?: { data?: { error?: unknown } } }
        ).response?.data?.error;
        const msg =
          typeof backendError === "string"
            ? backendError
            : e instanceof Error
              ? e.message
              : "任务启动失败";
        setJobError(msg);
        setJobStatus("error");
        notify({ severity: "error", message: msg });
      }
    },
    [configId, reportType, jobStatus, notify, loadJob],
  );

  const handleRun = useCallback(() => {
    void run(reportDate);
  }, [run, reportDate]);

  const handleStop = useCallback(async () => {
    if (!jobId) return;
    try {
      await api.post(`/briefing/jobs/${jobId}/cancel`);
      notify({ severity: "info", message: "正在停止任务…" });
      // Poll once more to reflect the cancelled state promptly.
      setTimeout(() => void loadJob(jobId), 800);
    } catch {
      notify({ severity: "error", message: "停止失败" });
    }
  }, [jobId, notify, loadJob]);

  const openEdit = () => {
    if (config) setForm(paramsFromConfig(config));
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form) return;
    const payload = paramsToConfig(form);
    setSaving(true);
    try {
      await api.put(`/briefing/configs/${configId}`, payload);
      notify({ severity: "success", message: "参数已更新" });
      setEditOpen(false);
      void loadConfig();
    } catch {
      notify({ severity: "error", message: "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const core = result?.core ?? {};
  const prev = result?.core_previous ?? {};
  const breakevenLine = result?.thresholds?.default_breakeven_line ?? 0.1;
  // The 低 line: below it a ROI1 reads 低, between it and the breakeven line
  // it reads 中 — the same ladder the backend's alerts use.
  const criticalLine = result?.thresholds?.roi_critical_line ?? 0.05;

  // The headline band's 环比 figures are derived inside ``CoreStatBand``, so
  // the same code produces the total's and each platform's.

  const isRunning = jobStatus === "running";
  const elapsedSec = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  // The rendered result's type wins over the config type (they agree in
  // practice; legacy results without a type fall back to the daily display).
  const resultIsWeekly =
    normalizeReportType(result?.report_type ?? reportType) === "weekly";

  // Masthead meta line: type first, then the reported window.
  const periodText =
    resultIsWeekly && result?.period_start && result?.period_end
      ? `简报周期：${result.period_start} ~ ${result.period_end}`
      : result?.report_date
        ? `简报日期：${result.report_date}`
        : null;

  // Chart inputs are memoised so an unrelated re-render (the elapsed timer, a
  // poll tick) hands the charts the *same* row objects and ECharts is left
  // alone — which is what keeps a hovered tooltip on screen.
  // The chart plots the same games the table lists: which games are in scope is
  // decided once (the channel selection), so the 主游戏 count never differs
  // between §03's chart and the table under it.
  const listedGames = useMemo(
    () => gamesOf(result?.projects ?? []),
    [result?.projects],
  );
  const gameRows = useMemo<ComboRow[]>(
    () =>
      (result?.project_summary ?? [])
        .filter((p) => listedGames.has(p.project))
        .map((p) => ({
          label: p.project,
          spend: p.spend,
          new_users: p.new_users,
          ltv1: p.ltv1,
          roi1: p.roi1,
          prev: p.prev
            ? {
                spend: p.prev.spend,
                new_users: p.prev.new_users,
                ltv1: p.prev.ltv1,
                roi1: p.prev.roi1,
              }
            : undefined,
        })),
    [result?.project_summary, listedGames],
  );

  // 分地区 subdivides exactly the combos the channel view lists, so switching
  // it never re-ranks the games.  Turning 分渠道 off falls back to the
  // backend's whole-game rows, which carry the same metric fields, prev and
  // daily series as a channel row — and list exactly the same games — so that
  // switch changes the channel split and nothing else.
  const tableRows = useMemo<ProjectRow[]>(() => {
    if (splitChannel) {
      return splitRegion
        ? (result?.project_regions ?? [])
        : (result?.projects ?? []);
    }
    return (result?.project_summary ?? [])
      .filter((p) => listedGames.has(p.project))
      .map((p) => ({
        project: p.project,
        channel: MERGED_CHANNEL_LABEL,
        region: "",
        spend: p.spend,
        new_users: p.new_users,
        pay_rate: p.pay_rate,
        retention_rate: p.retention_rate,
        cpa: p.cpa,
        recharge: p.recharge,
        ltv1: p.ltv1,
        ltv2: p.ltv2,
        ltv3: p.ltv3,
        ltv4: p.ltv4,
        ltv5: p.ltv5,
        ltv6: p.ltv6,
        ltv7: p.ltv7,
        roi1: p.roi1,
        prev: p.prev,
        daily: p.daily,
      }));
  }, [
    splitChannel,
    splitRegion,
    listedGames,
    result?.projects,
    result?.project_regions,
    result?.project_summary,
  ]);

  const channelRows = useMemo<ComboRow[]>(
    () =>
      drillGame ? aggregateByChannel(result?.projects ?? [], drillGame) : [],
    [result?.projects, drillGame],
  );

  const drillRows = useMemo<ComboRow[]>(
    () =>
      drillDate
        ? (result?.daily_projects ?? [])
            .filter((r) => r.date === drillDate)
            .map((r) => ({
              label: r.project,
              spend: r.spend,
              new_users: r.new_users,
              ltv1: r.ltv1,
              roi1: r.roi1,
              prev: r.prev
                ? {
                    spend: r.prev.spend,
                    new_users: r.prev.new_users,
                    ltv1: r.prev.ltv1,
                    roi1: r.prev.roi1,
                  }
                : undefined,
            }))
            .slice(0, MAX_DRILL_SERIES)
        : [],
    [result?.daily_projects, drillDate],
  );

  const trendLtvDays = useMemo(
    () => visibleLtvDays(result?.daily ?? []),
    [result?.daily],
  );

  // ---- 媒体分析: the media list, the 主游戏 rows behind it, and the drill ----
  const mediaRows = useMemo(() => result?.media ?? [], [result?.media]);
  // A result generated before the drill existed carries no 主游戏 rows; the
  // section then stays the media-level summary it used to be.
  const mediaGames = useMemo(
    () => gamesByMedia(result?.media_projects),
    [result?.media_projects],
  );
  const canDrillMedia = mediaGames.size > 0;
  // 媒体 × 客户端: the platform cut the chart's first level reads.  A result
  // generated before it existed simply has no platforms to stack, and the
  // chart falls back to one bar per media.
  const platformMedia = useMemo(
    () => mediaByPlatform(result?.media_platforms),
    [result?.media_platforms],
  );
  const mediaPlatforms = useMemo(
    () => platformsBySpend(result?.media_platforms),
    [result?.media_platforms],
  );
  const mediaSpendRows = useMemo<MediaSpendRow[]>(() => {
    if (mediaPlatforms.length === 0) {
      return mediaRows.map((m) => ({
        kind: "bar",
        label: m.channel,
        platform: "",
        spend: m.spend,
        roi1: m.roi1 ?? null,
        prev: m.prev,
      }));
    }
    const rows: MediaSpendRow[] = [];
    for (const platform of mediaPlatforms) {
      const members = platformMedia.get(platform) ?? [];
      if (members.length === 0) continue;
      rows.push({
        kind: "header",
        label: platform,
        platform,
        spend: members.reduce((sum, row) => sum + row.spend, 0),
      });
      for (const row of members) {
        rows.push({
          kind: "bar",
          label: row.channel,
          platform,
          spend: row.spend,
          roi1: row.roi1 ?? null,
          prev: row.prev,
        });
      }
    }
    return rows;
  }, [mediaRows, mediaPlatforms, platformMedia]);
  const mediaGameRows = useMemo(
    () => (drillMedia ? (mediaGames.get(drillMedia) ?? []) : []),
    [drillMedia, mediaGames],
  );
  // The drill has no platform cut, so each 主游戏 is one bar; the payload
  // already lists a media's games spend-descending.
  const mediaGameSpendRows = useMemo<MediaSpendRow[]>(
    () =>
      mediaGameRows.map((g) => ({
        kind: "bar",
        label: g.project,
        platform: "",
        spend: g.spend,
        roi1: g.roi1 ?? null,
        prev: g.prev,
      })),
    [mediaGameRows],
  );
  // The swapped table groups the same 媒体 × 主游戏 rows the other way round.
  // A game's own row has to be rolled up from its media rows, which is also
  // what makes the two orientations add up to the same totals.
  const projectMedia = useMemo(
    () => mediaRowsByProject(result?.media_projects),
    [result?.media_projects],
  );
  const mediaGroups = useMemo<MediaTableGroup[]>(
    () =>
      mediaRows.map((m) => ({
        key: m.channel,
        row: m,
        members: mediaGames.get(m.channel) ?? [],
      })),
    [mediaRows, mediaGames],
  );
  const projectGroups = useMemo<MediaTableGroup[]>(() => {
    const groups: MediaTableGroup[] = [];
    for (const [project, rows] of projectMedia) {
      const row = rollupMediaRows(rows);
      if (row) groups.push({ key: project, row, members: rows });
    }
    return groups.sort((a, b) => b.row.spend - a.row.spend);
  }, [projectMedia]);
  const mediaTableGroups =
    mediaGroupMode === "media" ? mediaGroups : projectGroups;
  const mediaGroupKeys = useMemo(
    () => mediaTableGroups.map((g) => g.key),
    [mediaTableGroups],
  );
  // A media that no longer carries cost disappears from a re-run's payload, so
  // the panel falls back to the overview instead of staying pinned on it.
  useEffect(() => {
    if (drillMedia && !mediaGames.has(drillMedia)) setDrillMedia(null);
  }, [drillMedia, mediaGames]);

  const openProjectGroups = useCallback((projects: readonly string[]) => {
    if (projects.length === 0) return;
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      for (const project of projects) next.add(project);
      return next;
    });
  }, []);

  const openMediaDrill = useCallback(
    (channel: string) => {
      setDrillMedia(channel);
      // Drilling is also the expand gesture for that media's row, so the chart
      // and the table underneath never disagree about which media is open.
      setExpandedMedia((prev) =>
        prev.has(channel) ? prev : new Set(prev).add(channel),
      );
      // In the swapped view the media is an inner row, so the drill keeps it
      // visible by opening the games it ran in.
      if (mediaGroupMode === "project") {
        openProjectGroups(
          (mediaGames.get(channel) ?? []).map((row) => row.project),
        );
      }
    },
    [mediaGroupMode, mediaGames, openProjectGroups],
  );

  const toggleMediaRow = useCallback((channel: string) => {
    setExpandedMedia((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }, []);

  const toggleProjectRow = useCallback((project: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }, []);

  const toggleAllMediaGroups = useCallback(() => {
    if (mediaGroupMode === "media") {
      setExpandedMedia((prev) =>
        mediaRows.length > 0 && mediaRows.every((m) => prev.has(m.channel))
          ? new Set<string>()
          : new Set(mediaRows.map((m) => m.channel)),
      );
      return;
    }
    setExpandedProjects((prev) =>
      mediaGroupKeys.length > 0 && mediaGroupKeys.every((key) => prev.has(key))
        ? new Set<string>()
        : new Set(mediaGroupKeys),
    );
  }, [mediaGroupMode, mediaRows, mediaGroupKeys]);

  const swapMediaGroupMode = useCallback(() => {
    const next: MediaGroupMode =
      mediaGroupMode === "media" ? "project" : "media";
    // Keep the drilled media on screen across the swap: the 主游戏 × 媒体
    // orientation shows it inside the games it ran in, so open those.
    if (next === "project" && drillMedia) {
      openProjectGroups(
        (mediaGames.get(drillMedia) ?? []).map((row) => row.project),
      );
    }
    setMediaGroupMode(next);
  }, [mediaGroupMode, drillMedia, mediaGames, openProjectGroups]);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Box
          ref={scrollRef}
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 3,
            pt: 2,
            minHeight: 0,
          }}
        >
          <PageHeader
            title={reportName}
            titleSx={{ fontSize: { xs: "1.5rem", md: "1.75rem" } }}
            subtitle={
              periodText
                ? `${resultIsWeekly ? "周报" : "日报"} · ${periodText}`
                : `${resultIsWeekly ? "周报" : "日报"} · 运行简报以查看指标`
            }
            actions={
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-end",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={() => navigate("/briefing")}
                >
                  返回列表
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={openEdit}
                  disabled={!config}
                >
                  编辑参数
                </Button>
                <DatePicker
                  label={resultIsWeekly ? "简报周（任选日期）" : "简报日期"}
                  value={reportDate}
                  onChange={(v: Dayjs | null) => setReportDate(v)}
                  format="YYYY-MM-DD"
                  slotProps={{
                    textField: {
                      size: "small",
                      // The picker selects the day the report covers; the
                      // backend's "as-of" date is derived from it, so the hint
                      // never claims to shift the date.
                      helperText: resultIsWeekly
                        ? "展示所选日期所在自然周（周日~周六）"
                        : "展示所选日期的简报",
                    },
                  }}
                />
                {isRunning ? (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<StopIcon />}
                    onClick={() => void handleStop()}
                  >
                    停止
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={
                      jobStatus === "done" ? (
                        <RestartAltIcon />
                      ) : (
                        <PlayArrowIcon />
                      )
                    }
                    onClick={handleRun}
                    disabled={!configId}
                  >
                    {jobStatus === "done" ? "重新运行" : "运行简报"}
                  </Button>
                )}
              </Box>
            }
          />

          {(isRunning ||
            jobStatus === "cancelled" ||
            jobStatus === "error") && (
            <JobStatusBar
              status={jobStatus}
              elapsedSec={elapsedSec}
              lastLog={logs.length > 0 ? logs[logs.length - 1] : null}
            />
          )}

          {configError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {configError}
            </Alert>
          )}

          {jobError && jobStatus === "error" && (
            <Alert severity="error" sx={{ mb: 2 }}>
              简报生成失败：{jobError}
            </Alert>
          )}

          {jobStatus === "cancelled" && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              任务已手动停止。
            </Alert>
          )}

          {(isRunning || logs.length > 0) && (
            <JobLogPanel
              logs={logs}
              status={jobStatus}
              expanded={logsExpanded}
              onToggle={() => {
                logsTouchedRef.current = true;
                setLogsExpanded((v) => !v);
              }}
            />
          )}

          {result?.alerts && result.alerts.length > 0 && (
            <Box
              sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1 }}
            >
              {result.alerts.map((a, i) => {
                // Report content stays flat: level color bar + light wash instead
                // of elevated MUI Alert chrome.
                const color =
                  ALERT_LEVEL_COLOR[a.level] ?? supersetPalette.status.info;
                const bg =
                  a.level === "warning"
                    ? CALLOUT_BG.warning
                    : a.level === "info"
                      ? CALLOUT_BG.info
                      : CALLOUT_BG.error;
                return (
                  <Box
                    key={i}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1,
                      p: 1.25,
                      borderRadius: 1,
                      borderLeft: `3px solid ${color}`,
                      bgcolor: bg,
                    }}
                  >
                    <Typography variant="body2">
                      <strong>{a.metric}:</strong> {a.message}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}

          {result?.empty && (
            <Alert severity="warning">
              所选日期范围内没有数据，请检查数据集/字段映射配置。
            </Alert>
          )}

          {result && !result.empty && (
            <>
              {/* §1 核心指标速览 */}
              <Box id="sec-core" sx={{ scrollMarginTop: 8 }}>
                <ReportSectionHeader
                  index={1}
                  title="核心指标速览"
                  caption={
                    resultIsWeekly && result?.period_start && result?.period_end
                      ? `报告周期：${result.period_start} ~ ${result.period_end} ｜ 对比周期：${result.previous_period_start ?? ""} ~ ${result.previous_period_end ?? ""}`
                      : `简报日期：${result.report_date} ｜ 对比周期：${result.previous_date}`
                  }
                />

                {/* Flat stat band: one outlined surface, hairline-separated
                    cells.  Its 分业务板块 strip is welded to the band's own
                    bottom edge rather than floating below it. */}
                <Box sx={{ mb: 3 }}>
                  <CoreOverview
                    core={core}
                    previous={prev}
                    rows={result.platforms ?? []}
                  />
                </Box>
              </Box>

              {result.daily && result.daily.length > 0 && (
                <Box id="sec-trend" sx={{ mb: 3, scrollMarginTop: 8 }}>
                  <ReportSectionHeader
                    index={2}
                    title={resultIsWeekly ? "分周对比" : "分天对比"}
                    caption="逐日（周报为逐周）对比消耗、充值流水、新增与 ROI/LTV，点击柱可下钻到当天的主游戏明细"
                  />
                  {/*
                   * Drill-down transition: keying the fade by the drill target
                   * replays a short enter animation on every overview ↔ detail
                   * switch.  Only the container animates here; the chart's own
                   * entrance is driven by the shared motion tokens.
                   */}
                  <Fade
                    in
                    appear
                    timeout={durationTokens.quick}
                    easing={easeTokens.decelerate}
                    key={drillDate ?? "trend-overview"}
                  >
                    <Box>
                      {drillDate ? (
                        <MetricsComboChart
                          rows={drillRows}
                          title={`${result?.daily?.find((d) => d.date === drillDate)?.label ?? drillDate} · 主游戏`}
                          onBack={() => setDrillDate(null)}
                        />
                      ) : (
                        // The chart owns its 分天明细 strip; the numbered
                        // chapter header above carries the title.
                        <TrendOverview
                          rows={result.daily}
                          ltvDays={trendLtvDays}
                          weekly={resultIsWeekly}
                          onSelect={setDrillDate}
                        />
                      )}
                    </Box>
                  </Fade>
                </Box>
              )}

              {/* §2 主游戏维度分析（主视角） */}
              <Box id="sec-projects" sx={{ mt: 3, scrollMarginTop: 8 }}>
                <ReportSectionHeader
                  index={3}
                  title="主游戏维度分析"
                  caption="以「主游戏 + 渠道商」为主视角，定位本期指标涨跌由哪些主游戏驱动"
                />

                {drillGame && channelRows.length === 0 && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    主游戏「{drillGame}」暂无可用的渠道明细（可能受 Top
                    项目数限制）。
                  </Alert>
                )}
                {/* Same drill transition as §1 so both gestures read alike. */}
                <Fade
                  in
                  appear
                  timeout={durationTokens.quick}
                  easing={easeTokens.decelerate}
                  key={drillGame ?? "game-overview"}
                >
                  <Box>
                    <MetricsComboChart
                      rows={drillGame ? channelRows : gameRows}
                      title={
                        drillGame
                          ? `${drillGame} × 渠道商`
                          : "主游戏明细（含环比）"
                      }
                      onSelect={drillGame ? undefined : setDrillGame}
                      onBack={drillGame ? () => setDrillGame(null) : undefined}
                    />
                  </Box>
                </Fade>

                <ProjectComboTable
                  projects={tableRows}
                  breakevenLine={breakevenLine}
                  showDaily={showComboDaily}
                  onToggleDaily={() => setShowComboDaily((v) => !v)}
                  splitChannel={splitChannel}
                  onToggleChannel={() => {
                    setSplitChannel((v) => {
                      // Region subdivision only exists on top of the channel
                      // split, so leaving that view drops the region switch.
                      if (v) setSplitRegion(false);
                      return !v;
                    });
                  }}
                  splitRegion={splitRegion}
                  onToggleRegion={() => setSplitRegion((v) => !v)}
                  expandLabel={resultIsWeekly ? "分周" : "分天"}
                />
              </Box>

              {/* §3 媒体表现分析（辅助视角） */}
              <Box id="sec-media" sx={{ mt: 3, scrollMarginTop: 8 }}>
                <ReportSectionHeader
                  index={4}
                  title="媒体表现分析"
                  caption={
                    canDrillMedia
                      ? "辅助视角：条形为返点后消耗，按客户端分组、颜色区分 ROI1 质量，点击柱可下钻到主游戏，明细表可调换内外维度"
                      : "辅助视角：条形为返点后消耗，颜色区分 ROI1 质量"
                  }
                />
                {!canDrillMedia && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    当前结果不含「媒体 ×
                    主游戏」明细，重新运行简报后即可按主游戏展开。
                  </Alert>
                )}
                <MediaQualitySummary
                  media={mediaRows}
                  breakevenLine={breakevenLine}
                  onSelect={canDrillMedia ? openMediaDrill : undefined}
                />
                {/* Same drill transition as §1/§2 so every gesture reads alike. */}
                <Fade
                  in
                  appear
                  timeout={durationTokens.quick}
                  easing={easeTokens.decelerate}
                  key={drillMedia ?? "media-overview"}
                >
                  <Box>
                    <MediaSpendChart
                      rows={drillMedia ? mediaGameSpendRows : mediaSpendRows}
                      title={
                        drillMedia
                          ? `${drillMedia} × 主游戏 消耗分布`
                          : `媒体消耗分布${
                              mediaPlatforms.length > 0
                                ? "（按客户端分组）"
                                : ""
                            }`
                      }
                      breakevenLine={breakevenLine}
                      criticalLine={criticalLine}
                      onSelect={
                        drillMedia || !canDrillMedia
                          ? undefined
                          : openMediaDrill
                      }
                      onBack={
                        drillMedia ? () => setDrillMedia(null) : undefined
                      }
                    />
                  </Box>
                </Fade>

                <MediaBreakdownTable
                  groups={mediaTableGroups}
                  mode={mediaGroupMode}
                  breakevenLine={breakevenLine}
                  expanded={
                    mediaGroupMode === "media"
                      ? expandedMedia
                      : expandedProjects
                  }
                  onToggle={
                    mediaGroupMode === "media"
                      ? toggleMediaRow
                      : toggleProjectRow
                  }
                  onToggleAll={toggleAllMediaGroups}
                  onSwapDimensions={
                    canDrillMedia ? swapMediaGroupMode : undefined
                  }
                  highlighted={drillMedia}
                />
              </Box>
            </>
          )}
        </Box>
      </Box>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>编辑简报参数</DialogTitle>
        <DialogContent dividers>
          {form && <ConfigForm value={form} onChange={setForm} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
