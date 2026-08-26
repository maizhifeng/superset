import {
  useCallback,
  useEffect,
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
import LinearProgress from "@mui/material/LinearProgress";
import Collapse from "@mui/material/Collapse";
import Fade from "@mui/material/Fade";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import EditIcon from "@mui/icons-material/Edit";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import PageHeader from "@/components/PageHeader";
import { useNotificationStore } from "@/store/notificationStore";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
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
  CALLOUT_BG,
  JOB_STATUS_COLOR,
  JOB_STATUS_LABEL,
  briefingTable,
  type JobStatus,
} from "./reportStyles";
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

interface CoreMetrics {
  spend?: number;
  new_users?: number;
  cpa?: number;
  ROI1?: number;
  LTV1?: number;
  [key: string]: number | undefined;
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
  cpa: number;
  ltv1: number;
  roi1: number;
  prev?: {
    spend: number;
    new_users: number;
    cpa: number;
    ltv1: number;
    roi1: number;
  };
  daily?: DailyTrendRow[];
}

interface ProjectSummaryRow {
  project: string;
  spend: number;
  new_users: number;
  cpa: number;
  ltv1: number;
  roi1: number;
  prev?: {
    spend: number;
    new_users: number;
    cpa: number;
    ltv1: number;
    roi1: number;
  };
}

interface MediaRow {
  channel: string;
  spend: number;
  new_users: number;
  cpa: number;
  ltv1?: number;
  roi1?: number;
  prev?: {
    spend: number;
    new_users: number;
    cpa: number;
    ltv1: number;
    roi1: number;
  };
}

interface DailyProjectRow {
  date: string;
  project: string;
  spend: number;
  new_users: number;
  cpa: number;
  ltv1: number;
  roi1: number;
  prev?: {
    spend: number;
    new_users: number;
    cpa: number;
    ltv1: number;
    roi1: number;
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
  media?: MediaRow[];
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

interface DailyTrendRow {
  date: string;
  /** Human label for the bucket ("MM-DD ~ MM-DD" for weekly briefings). */
  label?: string;
  spend: number;
  new_users: number;
  cpa: number;
  ltv1: number;
  ltv2?: number;
  ltv3?: number;
  ltv4?: number;
  ltv5?: number;
  ltv6?: number;
  ltv7?: number;
  roi1: number;
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
const USERS_LABEL = "新增进入";
// Drill-down views only show the leading series to avoid long-tail clutter.
const MAX_DRILL_SERIES = 10;

// Log lines can carry a success level that report alerts never emit.
const LOG_LEVEL_COLOR: Record<string, string> = {
  ...ALERT_LEVEL_COLOR,
  success: supersetPalette.status.success,
};

function formatNumber(value: number | undefined, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(digits);
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-";
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
        <Typography
          sx={{
            fontSize: "1.5rem",
            fontWeight: 700,
            lineHeight: 1.2,
            fontVariantNumeric: "tabular-nums",
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
        <Typography variant="caption" color="text.secondary">
          {display}
        </Typography>
      )}
    </Box>
  );
}

function DailySubTable({ rows }: { rows: DailyTrendRow[] }) {
  const ltvDays = [1, 2, 3, 4, 5, 6, 7];
  const ltvValue = (row: DailyTrendRow, d: number) =>
    row[`ltv${d}` as keyof DailyTrendRow] as number | undefined;
  return (
    <Box sx={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "12px",
          textAlign: "left",
        }}
      >
        <thead>
          <tr>
            {[
              "日期",
              "返点后消耗",
              "消耗环比",
              "新增进入",
              "CPA",
              ...ltvDays.map((d) => `LTV${d}`),
              "ROI1",
              "ROI1环比",
            ].map((c) => (
              <th key={c} style={briefingTable.headCell("5px 8px")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const prev = rows[i + 1];
            const spendDelta =
              prev && prev.spend ? (row.spend - prev.spend) / prev.spend : null;
            const roiDelta =
              prev && prev.roi1 ? (row.roi1 - prev.roi1) / prev.roi1 : null;
            return (
              <tr key={row.date} style={briefingTable.zebraRow(i)}>
                <td style={briefingTable.bodyCell({ padding: "5px 8px" })}>
                  {row.label ?? row.date}
                </td>
                <td
                  style={briefingTable.bodyCell({
                    numeric: true,
                    padding: "5px 8px",
                  })}
                >
                  {formatNumber(row.spend)}
                </td>
                <td style={briefingTable.bodyCell({ padding: "5px 8px" })}>
                  <DeltaBadge value={spendDelta} higherIsBetter={false} />
                </td>
                <td
                  style={briefingTable.bodyCell({
                    numeric: true,
                    padding: "5px 8px",
                  })}
                >
                  {formatNumber(row.new_users, 0)}
                </td>
                <td
                  style={briefingTable.bodyCell({
                    numeric: true,
                    padding: "5px 8px",
                  })}
                >
                  {formatNumber(row.cpa, 1)}
                </td>
                {ltvDays.map((d) => (
                  <td
                    key={d}
                    style={briefingTable.bodyCell({
                      numeric: true,
                      padding: "5px 8px",
                    })}
                  >
                    {formatNumber(ltvValue(row, d), 2)}
                  </td>
                ))}
                <td
                  style={briefingTable.bodyCell({
                    numeric: true,
                    padding: "5px 8px",
                  })}
                >
                  {formatPercent(row.roi1)}
                </td>
                <td style={briefingTable.bodyCell({ padding: "5px 8px" })}>
                  <DeltaBadge value={roiDelta} higherIsBetter />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  );
}

function ProjectComboTable({
  projects,
  breakevenLine,
  showDaily,
  onToggleDaily,
  expandLabel = "分天",
}: {
  projects: ProjectRow[];
  breakevenLine: number;
  showDaily: boolean;
  onToggleDaily: () => void;
  /** Trend granularity word used in the toggle/caption ("分天" / "分周"). */
  expandLabel?: string;
}) {
  const comboLabel = (p: ProjectRow) =>
    [p.project, p.channel, p.region].filter(Boolean).join(" · ");
  const pct = (cur?: number, base?: number) =>
    base ? ((cur ?? 0) - base) / base : null;

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
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          主游戏 × 渠道商 明细（含环比）
        </Typography>
        <Button
          size="small"
          variant={showDaily ? "contained" : "outlined"}
          color="primary"
          onClick={onToggleDaily}
        >
          {showDaily ? `收起${expandLabel}` : `${expandLabel}显示`}
        </Button>
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
            textAlign: "left",
          }}
        >
          <thead>
            <tr>
              {[
                "主游戏",
                "渠道",
                "地区",
                SPEND_LABEL,
                USERS_LABEL,
                "CPA",
                "LTV1",
                "ROI1",
                "达成",
              ].map((c) => (
                <th key={c} style={briefingTable.headCell()}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p, idx) => {
              const achieved = (p.roi1 ?? 0) >= breakevenLine;
              const pprev = p.prev;
              const num = briefingTable.bodyCell({ numeric: true });
              return (
                <Fragment key={`${p.project}-${p.channel}-${p.region}`}>
                  <tr style={briefingTable.zebraRow(idx)}>
                    <td style={briefingTable.bodyCell()}>{p.project}</td>
                    <td style={briefingTable.bodyCell()}>{p.channel || "-"}</td>
                    <td style={briefingTable.bodyCell()}>{p.region || "-"}</td>
                    <td style={num}>
                      <MetricCell
                        value={formatNumber(p.spend)}
                        delta={showDaily ? pct(p.spend, pprev?.spend) : null}
                        neutral
                      />
                    </td>
                    <td style={num}>
                      <MetricCell
                        value={String(p.new_users)}
                        delta={
                          showDaily ? pct(p.new_users, pprev?.new_users) : null
                        }
                      />
                    </td>
                    <td style={num}>
                      <MetricCell
                        value={formatNumber(p.cpa, 1)}
                        delta={showDaily ? pct(p.cpa, pprev?.cpa) : null}
                        higherIsBetter={false}
                      />
                    </td>
                    <td style={num}>
                      <MetricCell
                        value={formatNumber(p.ltv1, 2)}
                        delta={showDaily ? pct(p.ltv1, pprev?.ltv1) : null}
                      />
                    </td>
                    <td style={num}>
                      <MetricCell
                        value={formatPercent(p.roi1)}
                        delta={showDaily ? pct(p.roi1, pprev?.roi1) : null}
                      />
                    </td>
                    <td style={briefingTable.bodyCell()}>
                      <Chip
                        size="small"
                        color={achieved ? "success" : "default"}
                        variant={achieved ? "filled" : "outlined"}
                        label={achieved ? "达标" : "未达标"}
                      />
                    </td>
                  </tr>
                  {showDaily && p.daily && p.daily.length > 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          padding: 0,
                          background: supersetPalette.bg.muted,
                        }}
                      >
                        <Box
                          sx={{
                            py: 1.5,
                            pl: 3,
                            borderLeft: "3px solid",
                            borderColor: "primary.main",
                          }}
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mb: 0.5 }}
                          >
                            {comboLabel(p)} ｜ {expandLabel}对比
                          </Typography>
                          <DailySubTable rows={p.daily} />
                        </Box>
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
      <Typography variant="body2" color="text.secondary">
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
  const arrow = up ? "▲" : "▼";
  return (
    <Typography variant="body2" sx={{ color, fontWeight: 600 }}>
      {arrow} {Math.abs(value * 100).toFixed(1)}%
    </Typography>
  );
}

function TrendChart({
  rows,
  title = "分天对比",
  onSelect,
}: {
  rows: DailyTrendRow[];
  title?: string;
  onSelect?: (label: string) => void;
}) {
  // The series is newest-first; flip to chronological so the time axis reads
  // left-to-right as past → reported period.
  const ordered = [...rows].reverse();
  const dates = ordered.map((r) => r.label ?? r.date);
  const spends = ordered.map((r) => r.spend);
  const roi1s = ordered.map((r) => r.roi1);
  const ltv1s = ordered.map((r) => r.ltv1);
  const users = ordered.map((r) => r.new_users);

  const onEvents = onSelect
    ? {
        click: (p: any) => {
          if (
            p?.componentType === "series" &&
            p?.seriesType === "bar" &&
            p.name
          ) {
            // The axis shows the bucket's display label ("MM-DD ~ MM-DD" for
            // weekly briefings); report the canonical bucket key (the ISO
            // start date) so callers can match payload rows by ``date``.
            const clicked = ordered.find((r) => (r.label ?? r.date) === p.name);
            onSelect(clicked ? clicked.date : p.name);
          }
        },
      }
    : undefined;

  const option: EChartsOption = {
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
        fontSize: 11,
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
        nameTextStyle: { color: TEXT_MUTED, fontSize: 11 },
        axisLabel: {
          color: TEXT_MUTED,
          formatter: (v: number) => formatNumber(v),
        },
        splitLine: { lineStyle: { color: DIVIDER } },
      },
      {
        type: "value",
        name: "新增",
        nameTextStyle: { color: TEXT_MUTED, fontSize: 11 },
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
        nameTextStyle: { color: TEXT_MUTED, fontSize: 11 },
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
        nameTextStyle: { color: TEXT_MUTED, fontSize: 11 },
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
        itemStyle: { color: BRIEFING_CHART_COLORS.roi1 },
        lineStyle: { width: 2 },
      },
      {
        name: "LTV1",
        type: "line",
        yAxisIndex: 3,
        data: ltv1s,
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color: BRIEFING_CHART_COLORS.ltv1 },
        lineStyle: { width: 2 },
      },
    ],
  };

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
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          柱：消耗 / 新增（各独立坐标轴）｜ 线：ROI1（%）、LTV1（小数）
          {onSelect ? " ｜ 点击柱可下钻" : ""}
        </Typography>
      </Box>
      <EChart option={option} height={300} onEvents={onEvents} />
    </Paper>
  );
}

interface ComboRow {
  label: string;
  spend: number;
  new_users: number;
  ltv1: number;
  roi1: number;
  prev?: { spend: number; new_users: number; ltv1: number; roi1: number };
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
      ltv1: g.users ? g.ltv1w / g.users : 0,
      roi1: g.spend ? g.roi1w / g.spend : 0,
      prev: {
        spend: g.pSpend,
        new_users: g.pUsers,
        ltv1: g.pUsers ? g.pLtv1w / g.pUsers : 0,
        roi1: g.pSpend ? g.pRoi1w / g.pSpend : 0,
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
  const categories = rows.map((r) => r.label);
  const spends = rows.map((r) => r.spend);
  const users = rows.map((r) => r.new_users);
  const roi1s = rows.map((r) => r.roi1);
  const ltv1s = rows.map((r) => r.ltv1);
  const pct = (cur?: number, base?: number) =>
    base ? ((cur ?? 0) - base) / base : null;
  const fmtDelta = (d: number | null) =>
    d === null || Number.isNaN(d)
      ? "-"
      : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(1)}%`;

  const onEvents = onSelect
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
    : undefined;

  const option: EChartsOption = {
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
        fontSize: 11,
        rotate: categories.length > 6 ? 30 : 0,
        interval: 0,
      },
      axisLine: { lineStyle: { color: DIVIDER } },
    },
    yAxis: [
      {
        type: "value",
        name: "消耗",
        nameTextStyle: { color: TEXT_MUTED, fontSize: 11 },
        axisLabel: {
          color: TEXT_MUTED,
          formatter: (v: number) => formatNumber(v),
        },
        splitLine: { lineStyle: { color: DIVIDER } },
      },
      {
        type: "value",
        name: "新增",
        nameTextStyle: { color: TEXT_MUTED, fontSize: 11 },
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
        nameTextStyle: { color: TEXT_MUTED, fontSize: 11 },
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
        nameTextStyle: { color: TEXT_MUTED, fontSize: 11 },
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
        itemStyle: { color: BRIEFING_CHART_COLORS.roi1 },
        lineStyle: { width: 2 },
      },
      {
        name: "LTV1",
        type: "line",
        yAxisIndex: 3,
        data: ltv1s,
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color: BRIEFING_CHART_COLORS.ltv1 },
        lineStyle: { width: 2 },
      },
    ],
  };

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
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          柱：消耗 / 新增（各独立坐标轴）｜ 线：ROI1（%）、LTV1（小数）
          {onSelect ? " ｜ 点击柱可下钻" : ""}
        </Typography>
      </Box>
      <EChart
        option={option}
        height={Math.max(280, categories.length * 28)}
        onEvents={onEvents}
      />
    </Paper>
  );
}

function MetricCell({
  value,
  delta,
  higherIsBetter = true,
  neutral = false,
}: {
  value: string;
  delta: number | null;
  higherIsBetter?: boolean;
  neutral?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
      <span>{value}</span>
      {delta !== null && !Number.isNaN(delta) && (
        <DeltaBadge
          value={delta}
          higherIsBetter={higherIsBetter}
          neutral={neutral}
        />
      )}
    </Box>
  );
}

function MediaQualitySummary({
  media,
  breakevenLine,
}: {
  media: MediaRow[];
  breakevenLine: number;
}) {
  const valid = media.filter((m) => (m.roi1 ?? 0) > 0);
  if (valid.length === 0) return null;
  const best = valid.reduce((a, b) => ((b.roi1 ?? 0) > (a.roi1 ?? 0) ? b : a));
  const worst = valid.reduce((a, b) => ((b.roi1 ?? 0) < (a.roi1 ?? 0) ? b : a));
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
      />,
    );
  }
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
      {items}
    </Box>
  );
}

function MediaRoiChart({
  media,
  breakevenLine,
}: {
  media: MediaRow[];
  breakevenLine: number;
}) {
  const valid = media.filter((m) => (m.roi1 ?? 0) > 0);
  if (valid.length === 0) return null;
  const ordered = [...valid].sort((a, b) => (a.roi1 ?? 0) - (b.roi1 ?? 0));
  const pct = (cur?: number, base?: number) =>
    base ? ((cur ?? 0) - base) / base : null;

  const option: EChartsOption = {
    grid: { left: 96, right: 40, top: 10, bottom: 24 },
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params];
        const m = ordered[arr[0].dataIndex];
        const roiD = pct(m.roi1, m.prev?.roi1);
        return [
          `<strong>${m.channel}</strong>`,
          `消耗：${formatNumber(m.spend)}`,
          `ROI1：${formatPercent(m.roi1)}（${roiD === null ? "-" : (roiD >= 0 ? "+" : "") + (roiD * 100).toFixed(1) + "%"}）`,
          (m.roi1 ?? 0) >= breakevenLine ? "状态：达标" : "状态：未达标",
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "value",
      axisLabel: {
        color: TEXT_MUTED,
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: DIVIDER } },
    },
    yAxis: {
      type: "category",
      data: ordered.map((m) => m.channel),
      axisLabel: { color: TEXT_MUTED, fontSize: 11 },
      axisLine: { lineStyle: { color: DIVIDER } },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 22,
        data: ordered.map((m) => ({
          value: m.roi1 ?? 0,
          itemStyle: {
            // Value judgment → semantic status tokens (charts skill rule).
            color:
              (m.roi1 ?? 0) >= breakevenLine
                ? supersetPalette.status.success
                : supersetPalette.status.error,
            borderRadius: [0, 3, 3, 0],
          },
        })),
        markLine: {
          symbol: "none",
          label: {
            formatter: `盈亏线 ${(breakevenLine * 100).toFixed(0)}%`,
            color: TEXT_MUTED,
            fontSize: 11,
            position: "insideEndTop",
          },
          lineStyle: {
            color: BRIEFING_CHART_COLORS.breakevenLine,
            type: "dashed",
          },
          data: [{ xAxis: breakevenLine }],
        },
      },
    ],
  };

  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        媒体 ROI 对比
      </Typography>
      <EChart option={option} height={Math.max(160, valid.length * 34)} />
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

function ReportToc({
  chapters,
  activeId,
}: {
  chapters: { id: string; label: string }[];
  activeId: string;
}) {
  return (
    <Box
      sx={{
        position: "fixed",
        right: 12,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 6,
        display: { xs: "none", md: "block" },
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        p: 0.75,
      }}
    >
      <Stack spacing={0.25}>
        {chapters.map((c) => {
          const active = c.id === activeId;
          return (
            <Tooltip key={c.id} title={c.label} placement="left">
              <Button
                size="small"
                onClick={() => {
                  document
                    .getElementById(c.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                sx={{
                  justifyContent: "flex-end",
                  textTransform: "none",
                  color: active ? "primary.main" : "text.secondary",
                  fontWeight: active ? 700 : 400,
                  fontSize: "0.75rem",
                  minWidth: 0,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: active ? "action.hover" : "transparent",
                }}
              >
                {c.label}
              </Button>
            </Tooltip>
          );
        })}
      </Stack>
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
        timeout={{ enter: 300, exit: 700 }}
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
            transition: (theme) =>
              theme.transitions.create("opacity", {
                duration: theme.transitions.duration.leavingScreen,
              }),
          }}
        >
          {logs.length === 0 && status === "running" && (
            <Box sx={{ color: TERMINAL_MUTED }}>等待任务启动…</Box>
          )}
          {logs.map((log, i) => (
            <Box key={i} sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
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
  const [drillGame, setDrillGame] = useState<string | null>(null);
  const [drillDate, setDrillDate] = useState<string | null>(null);

  // Reset the drill-down when a different report result is loaded.
  useEffect(() => {
    setDrillGame(null);
    setDrillDate(null);
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
  // bar.  A fresh run re-opens it immediately.
  useEffect(() => {
    if (jobStatus === "idle") return;
    if (jobStatus === "running") {
      setLogsExpanded(true);
      return;
    }
    const t = setTimeout(() => setLogsExpanded(false), 1800);
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

  // Reflect the loaded report name in the global breadcrumb so the detail
  // route stays connected to the "每日简报" list trail and is reachable by
  // clicking the breadcrumb.  Clear it on leave so no stale name lingers.
  useEffect(() => {
    if (config) setCustomBreadcrumb({ label: reportName });
    return () => setCustomBreadcrumb(null);
  }, [config, reportName, setCustomBreadcrumb]);

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
        const msg = e instanceof Error ? e.message : "任务启动失败";
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
  const roi1 = core.ROI1;
  const ltv1 = core.LTV1;
  const breakevenLine = result?.thresholds?.default_breakeven_line ?? 0.1;

  // Day-over-day deltas (report day vs previous day) for the core cards.
  const pct = (cur?: number, base?: number) =>
    base ? ((cur ?? 0) - base) / base : null;
  const spendDelta = pct(core.spend, prev.spend);
  const usersDelta = pct(core.new_users, prev.new_users);
  const cpaDelta = pct(core.cpa, prev.cpa);
  const ltv1Delta = pct(core.LTV1, prev.LTV1);
  const roi1Delta = pct(core.ROI1, prev.ROI1);

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

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 3,
          pt: 2,
          pr: { md: 8 },
          minHeight: 0,
        }}
      >
        <PageHeader
          title={reportName}
          subtitle={
            periodText
              ? `${resultIsWeekly ? "周报" : "日报"} · ${periodText}`
              : `${resultIsWeekly ? "周报" : "日报"} · 运行简报以查看指标`
          }
          actions={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
              >
                编辑参数
              </Button>
              <DatePicker
                label={resultIsWeekly ? "简报周（任选日期）" : "简报日期"}
                value={reportDate}
                onChange={(v: Dayjs | null) => setReportDate(v)}
                slotProps={{
                  textField: {
                    size: "small",
                    helperText: resultIsWeekly
                      ? "生成所选日期所在自然周（周日~周六）"
                      : undefined,
                  },
                }}
              />
              {isRunning ? (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={() => void handleStop()}
                >
                  停止
                </Button>
              ) : jobStatus === "done" ? (
                <Button
                  variant="outlined"
                  startIcon={<RestartAltIcon />}
                  onClick={handleRun}
                >
                  重新执行
                </Button>
              ) : null}
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={handleRun}
                disabled={isRunning || !configId}
              >
                {isRunning ? "执行中…" : "运行简报"}
              </Button>
            </Box>
          }
        />

        {isRunning && <LinearProgress sx={{ mb: 2 }} />}

        {isRunning && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 2,
              color: "text.secondary",
            }}
          >
            <Chip
              size="small"
              color="primary"
              label={`执行中 · 已运行 ${Math.floor(elapsedSec / 60)}分 ${elapsedSec % 60}秒`}
            />
            {logs.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                最后更新：{logs[logs.length - 1].ts.split("T")[1] ?? ""}
              </Typography>
            )}
          </Box>
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
            onToggle={() => setLogsExpanded((v) => !v)}
          />
        )}

        {result?.alerts && result.alerts.length > 0 && (
          <Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1 }}>
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

              {/* Flat stat band: one outlined surface, hairline-separated cells. */}
              <Paper
                variant="outlined"
                sx={{
                  mb: 3,
                  overflow: "hidden",
                  bgcolor: supersetPalette.surface.main,
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    "& > *:not(:first-child)": {
                      borderLeft: `1px solid ${DIVIDER}`,
                    },
                  }}
                >
                  <StatTile
                    label={SPEND_LABEL}
                    value={formatNumber(core.spend)}
                    delta={spendDelta}
                    neutral
                  />
                  <StatTile
                    label={USERS_LABEL}
                    value={formatNumber(core.new_users, 0)}
                    delta={usersDelta}
                  />
                  <StatTile
                    label="CPA"
                    value={formatNumber(core.cpa, 1)}
                    delta={cpaDelta}
                    higherIsBetter={false}
                  />
                  <StatTile
                    label="LTV1"
                    value={formatNumber(ltv1, 2)}
                    delta={ltv1Delta}
                  />
                  <StatTile
                    label="ROI1"
                    value={formatPercent(roi1)}
                    delta={roi1Delta}
                  />
                </Box>
              </Paper>
            </Box>

            {result.daily && result.daily.length > 0 && (
              <Box id="sec-trend" sx={{ mb: 3, scrollMarginTop: 8 }}>
                {/*
                 * Drill-down transition: keying the fade by the drill target
                 * replays a short enter animation on every overview ↔ detail
                 * switch, on top of ECharts' own bar-growth on mount.
                 */}
                <Fade
                  in
                  appear
                  timeout={durationTokens.standard}
                  easing={easeTokens.decelerate}
                  key={drillDate ?? "trend-overview"}
                >
                  <Box>
                    {drillDate ? (
                      <MetricsComboChart
                        rows={(result?.daily_projects ?? [])
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
                          .slice(0, MAX_DRILL_SERIES)}
                        title={`${result?.daily?.find((d) => d.date === drillDate)?.label ?? drillDate} · 主游戏`}
                        onBack={() => setDrillDate(null)}
                      />
                    ) : (
                      <TrendChart
                        rows={result.daily}
                        title={resultIsWeekly ? "分周对比" : "分天对比"}
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
                index={2}
                title="主游戏维度分析"
                caption="以「主游戏 + 渠道商」为主视角，定位本期指标涨跌由哪些主游戏驱动"
              />

              {(() => {
                const gameRows: ComboRow[] = (
                  result?.project_summary ?? []
                ).map((p) => ({
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
                }));
                const channelRows: ComboRow[] = drillGame
                  ? aggregateByChannel(result?.projects ?? [], drillGame)
                  : [];
                return (
                  <>
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
                      timeout={durationTokens.standard}
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
                          onBack={
                            drillGame ? () => setDrillGame(null) : undefined
                          }
                        />
                      </Box>
                    </Fade>
                  </>
                );
              })()}

              <ProjectComboTable
                projects={result.projects ?? []}
                breakevenLine={breakevenLine}
                showDaily={showComboDaily}
                onToggleDaily={() => setShowComboDaily((v) => !v)}
                expandLabel={resultIsWeekly ? "分周" : "分天"}
              />
            </Box>

            {/* §3 媒体表现分析（辅助视角） */}
            <Box id="sec-media" sx={{ mt: 3, scrollMarginTop: 8 }}>
              <ReportSectionHeader
                index={3}
                title="媒体表现分析"
                caption="辅助视角：媒体维度的消耗分布与质量对比"
              />
              <MediaQualitySummary
                media={result.media ?? []}
                breakevenLine={breakevenLine}
              />
              <MediaRoiChart
                media={result.media ?? []}
                breakevenLine={breakevenLine}
              />
            </Box>
          </>
        )}
      </Box>

      {result && !result.empty && (
        <ReportToc chapters={chapters} activeId={activeSection} />
      )}

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
