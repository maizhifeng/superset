import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import DeltaArrow from "./DeltaArrow";
import {
  detectDrillAnomalies,
  type AnalysisAnomaly,
  type DrillAnomaly,
} from "../anomalies";
import { drillAnomalyMetric } from "../hooks/useDrillAnomalies";
import { drillPath, enterDateDrill } from "../drilldown";
import { topicMetric } from "../topics";
import type { AnalysisFilters } from "../filters";
import { formatMetricValue, toNumber } from "../format";
import {
  buildDrillAnomalyQuery,
  fetchBreakdownData,
  peekBreakdownData,
} from "../query";
import type { AnalysisTopic } from "../types";
import type { QueryObject } from "@/utils/query/types";
import {
  buildViewSummary,
  type SummaryParagraph,
  type SummaryTone,
} from "../summary";
import type { ChartDataRow } from "@/types/api";

/** Max rows rendered before collapsing into a summary line. */
const MAX_ROWS = 8;

/**
 * Expand an anomaly chip into the next drill dimension's contribution.
 *
 * The trend chart flags one aggregate point; this popover answers "which
 * channel/media made up the swing" by scoring every value of the next
 * dimension against its own 7-day rolling baseline on the same day. It reuses
 * the drill-attribution query, so hover-prefetch and the cached drill view make
 * the popover open instantly after the first visit.
 */
export default function AnomalyBreakdownPopover({
  topic,
  filters,
  anomaly,
  date,
  anchorEl,
  totalsRow,
  windowLabel,
  windowDays,
  onClose,
  onDrillDate,
}: {
  topic: AnalysisTopic;
  filters: AnalysisFilters;
  /** The anomaly whose chip was clicked (its `date` is MM-DD). */
  anomaly: AnalysisAnomaly | null;
  /** Full ISO date of the anomaly, used for the attribution query. */
  date: string | null;
  anchorEl: HTMLElement | null;
  /** Aggregated KPI row for the current statistics window. */
  totalsRow?: Record<string, unknown> | null;
  /** Resolved statistics window label shown in the narrative. */
  windowLabel?: string;
  /** Number of days in the statistics window (for the daily average). */
  windowDays?: number;
  onClose: () => void;
  onDrillDate: (date: string) => void;
}) {
  const theme = useTheme();
  const metric = useMemo(() => drillAnomalyMetric(topic), [topic]);
  const target = useMemo(
    () => (anomaly && date ? enterDateDrill(topic, filters, date) : null),
    [anomaly, date, filters, topic],
  );
  const query = useMemo(
    () => (target ? buildDrillAnomalyQuery(topic, target) : null),
    [target, topic],
  );
  const queryKey = useMemo(
    () => (query ? JSON.stringify(query) : null),
    [query],
  );
  const dimensionLabel = target
    ? (topic.dimensions.find((item) => item.key === target.dimension)?.label ??
      target.dimension)
    : "";

  const [rows, setRows] = useState<ChartDataRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const opened = Boolean(anchorEl && anomaly && date);
  const firstOpenRef = useRef(true);
  // Tooltips inside the scrollable dropdown must close while the list scrolls,
  // otherwise the portalled tooltip stays where the row used to be.
  const [tooltipRow, setTooltipRow] = useState<string | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!query || !queryKey) {
      setRows([]);
      setLoading(false);
      setReady(false);
      setError(null);
      return undefined;
    }
    const cached = peekBreakdownData(query, { allowStale: false });
    if (cached) {
      setRows(cached.rows);
      setLoading(false);
      setReady(true);
      setError(cached.error);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setReady(false);
    setError(null);
    fetchBreakdownData(query, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setRows(data.rows);
        setError(data.error);
        setReady(true);
      })
      .catch((requestError: unknown) => {
        if (!active || controller.signal.aborted) return;
        setRows([]);
        setReady(true);
        setError(
          requestError instanceof Error
            ? requestError.message
            : String(requestError),
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
    // `queryKey` captures every query input; keep the signal-bound effect keyed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, retryToken]);

  const contributors = useMemo(() => {
    if (!metric || !target || !anomaly) return [];
    const scored = detectDrillAnomalies(
      metric,
      rows,
      target.dimension,
      date ?? "",
    );
    return [...scored.entries()]
      .map(([value, detail]) => ({ value, detail }))
      .sort(
        (left, right) =>
          Number(right.detail.significant) -
            Number(left.detail.significant) ||
          Math.abs(right.detail.deltaValue) -
            Math.abs(left.detail.deltaValue),
      );
  }, [anomaly, date, metric, rows, target]);

  // The narrative decomposes the anomaly day across the topic's drill path
  // (主游戏 → 渠道商 → 媒体). Each dimension is one cached query, fetched in
  // parallel and rendered as its own paragraph once ready.
  const summaryDimensions = useMemo(() => {
    const path = drillPath(topic);
    return path.filter((dimension) =>
      topic.dimensions.some((item) => item.key === dimension),
    );
  }, [topic]);
  const summaryDimensionLabels = useMemo(
    () =>
      new Map(
        summaryDimensions.map((dimension) => [
          dimension,
          topic.dimensions.find((item) => item.key === dimension)?.label ??
            dimension,
        ]),
      ),
    [summaryDimensions, topic],
  );
  // The volume metric behind the comparison ratio lets the narrative rank
  // root causes by impact instead of surfacing tiny low-volume outliers.
  const summaryWeightMetric = useMemo(() => {
    const key = topic.comparisonMetric ?? topic.trend.series[0]?.metric;
    const entry = topic.trend.series.find((series) => series.metric === key);
    return entry?.weightBy ? topicMetric(topic, entry.weightBy) : null;
  }, [topic]);
  const summaryQueries = useMemo(() => {
    if (!anomaly || !date) return [];
    const base = enterDateDrill(topic, filters, date);
    return summaryDimensions.flatMap((dimension) => {
      const query = buildDrillAnomalyQuery(topic, { ...base, dimension });
      if (!query) return [];
      if (summaryWeightMetric) {
        query.metrics = [
          ...(query.metrics ?? []),
          summaryWeightMetric.metric,
        ];
      }
      return [{ dimension, query }];
    });
  }, [anomaly, date, filters, summaryDimensions, summaryWeightMetric, topic]);
  const summaryQueryKey = useMemo(
    () =>
      JSON.stringify(
        summaryQueries.map((entry) => [entry.dimension, entry.query]),
      ),
    [summaryQueries],
  );
  const summaryQueriesRef = useRef(summaryQueries);
  summaryQueriesRef.current = summaryQueries;
  const [summaryRows, setSummaryRows] = useState<
    Record<string, ChartDataRow[]>
  >({});
  const [summaryReady, setSummaryReady] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    const entries = summaryQueriesRef.current;
    if (entries.length === 0) {
      setSummaryRows({});
      setSummaryReady({});
      return undefined;
    }
    const cachedRows: Record<string, ChartDataRow[]> = {};
    const cachedReady: Record<string, boolean> = {};
    const pending: { dimension: string; query: QueryObject }[] = [];
    for (const entry of entries) {
      const cached = peekBreakdownData(entry.query, { allowStale: false });
      if (cached) {
        cachedRows[entry.dimension] = cached.rows;
        cachedReady[entry.dimension] = true;
      } else {
        pending.push(entry);
      }
    }
    setSummaryRows(cachedRows);
    setSummaryReady(cachedReady);

    const controllers: AbortController[] = [];
    let active = true;
    for (const entry of pending) {
      const controller = new AbortController();
      controllers.push(controller);
      fetchBreakdownData(entry.query, { signal: controller.signal })
        .then((data) => {
          if (!active) return;
          setSummaryRows((previous) => ({
            ...previous,
            [entry.dimension]: data.rows,
          }));
          setSummaryReady((previous) => ({
            ...previous,
            [entry.dimension]: true,
          }));
        })
        .catch(() => {
          if (!active) return;
          setSummaryReady((previous) => ({
            ...previous,
            [entry.dimension]: true,
          }));
        });
    }
    return () => {
      active = false;
      controllers.forEach((controller) => controller.abort());
    };
    // `summaryQueryKey` captures every query input.
  }, [summaryQueryKey]);

  const summaryBreakdowns = useMemo(() => {
    if (!metric || !date) return [];
    return summaryDimensions.flatMap((dimension) => {
      if (!summaryReady[dimension]) return [];
      const scored = detectDrillAnomalies(
        metric,
        summaryRows[dimension] ?? [],
        dimension,
        date,
      );
      const focusRows = new Map<string, ChartDataRow>();
      for (const row of summaryRows[dimension] ?? []) {
        const rowDate = dayjs(row["日期"] ?? row.__timestamp);
        if (
          rowDate.isValid() &&
          rowDate.format("YYYY-MM-DD") === date
        ) {
          focusRows.set(String(row[dimension] ?? "").trim(), row);
        }
      }
      const weightKey = summaryWeightMetric?.key ?? null;
      const impact = (value: string, detail: DrillAnomaly): number => {
        if (!weightKey) return Math.abs(detail.deltaValue);
        const weight = toNumber(focusRows.get(value)?.[weightKey]);
        if (weight === null) return Math.abs(detail.deltaValue);
        return Math.abs(detail.value - detail.baselineMean) * weight;
      };
      const contributorList = [...scored.entries()]
        .map(([value, detail]) => ({ value, detail }))
        .sort(
          (left, right) =>
            Number(right.detail.significant) -
              Number(left.detail.significant) ||
            impact(right.value, right.detail) -
              impact(left.value, left.detail) ||
            Math.abs(right.detail.deltaValue) -
              Math.abs(left.detail.deltaValue),
        );
      return [
        {
          dimensionLabel: summaryDimensionLabels.get(dimension) ?? dimension,
          contributors: contributorList,
        },
      ];
    });
  }, [
    date,
    metric,
    summaryDimensionLabels,
    summaryDimensions,
    summaryReady,
    summaryRows,
    summaryWeightMetric,
  ]);

  const summaryParagraphs = useMemo(() => {
    if (!anomaly || !metric || !ready) return [];
    return buildViewSummary({
      topic,
      totalsRow: totalsRow ?? null,
      windowLabel: windowLabel ?? "",
      windowDays: windowDays ?? 0,
      metric,
      anomaly,
      breakdowns: summaryBreakdowns,
    });
  }, [
    anomaly,
    metric,
    ready,
    summaryBreakdowns,
    topic,
    totalsRow,
    windowDays,
    windowLabel,
  ]);

  const visible = contributors.slice(0, MAX_ROWS);
  const overflowCount = Math.max(contributors.length - visible.length, 0);
  const severityColor = {
    negative: theme.palette.error.main,
    positive: theme.palette.success.main,
    neutral: theme.palette.warning.main,
  };
  const summaryToneColor: Record<SummaryTone, string> = {
    value: theme.palette.primary.main,
    negative: theme.palette.error.main,
    positive: theme.palette.success.main,
    neutral: theme.palette.warning.main,
  };
  const renderSummaryParagraph = (paragraph: SummaryParagraph) => (
    <Typography
      key={paragraph.key}
      variant="body2"
      sx={{ lineHeight: 1.75, color: "text.primary" }}
    >
      {paragraph.tokens.map((token, index) =>
        token.tone ? (
          <Box
            component="span"
            key={index}
            sx={{
              color: summaryToneColor[token.tone],
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {token.text}
          </Box>
        ) : (
          <span key={index}>{token.text}</span>
        ),
      )}
    </Typography>
  );

  const dimensionRows = contributors.filter(
    (item) => item.detail.significant,
  ).length;

  // Opening a different anomaly should reset the "first open" flag so the
  // popover can size itself without flicker.
  useEffect(() => {
    if (opened) firstOpenRef.current = false;
  }, [opened, anomaly?.index]);

  useEffect(() => {
    if (!opened) {
      setTooltipRow(null);
      setScrolling(false);
    }
  }, [opened]);

  useEffect(
    () => () => {
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    },
    [],
  );

  const handlePaperScroll = () => {
    setTooltipRow(null);
    setScrolling(true);
    if (scrollTimerRef.current !== null) {
      window.clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = window.setTimeout(() => {
      setScrolling(false);
      scrollTimerRef.current = null;
    }, 180);
  };

  return (
    <Popover
      open={opened}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        // The app theme dims + blurs the page for modal backdrops; a dropdown
        // attached to the chart should not dim the chart it explains.
        backdrop: {
          sx: { backgroundColor: "transparent", backdropFilter: "none" },
        },
        paper: {
          onScroll: handlePaperScroll,
          sx: {
            width: 460,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: 460,
            overflow: "auto",
            p: 1.5,
          },
        },
      }}
    >
      {anomaly && metric && (
        <Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              flexWrap: "wrap",
              mb: 0.5,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {anomaly.date} {metric.label}较 7 日移动平均
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={anomaly.deltaText}
              icon={<DeltaArrow direction={anomaly.direction} />}
              sx={{
                height: 22,
                fontWeight: 600,
                color: severityColor[anomaly.severity],
                borderColor: alpha(severityColor[anomaly.severity], 0.35),
                bgcolor: alpha(severityColor[anomaly.severity], 0.08),
                "& .MuiChip-label": { px: 0.75, fontSize: 12 },
                "& .MuiChip-icon": { color: "inherit", ml: 0.5, mr: -0.25 },
              }}
            />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            按「{dimensionLabel}」拆解 · 当前 {formatMetricValue(metric, anomaly.value)}
          </Typography>

          {ready && summaryParagraphs.length > 0 && (
            <Box
              sx={{
                mb: 1,
                px: 1,
                py: 0.75,
                borderRadius: 1.5,
                bgcolor: "action.hover",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mb: 0.25,
                  fontWeight: 700,
                  color: "text.secondary",
                }}
              >
                当前视图总结
              </Typography>
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}
              >
                {summaryParagraphs
                  .filter((paragraph) => paragraph.key === "overview")
                  .map(renderSummaryParagraph)}
                {summaryDimensions.map((dimension) => {
                  const label =
                    summaryDimensionLabels.get(dimension) ?? dimension;
                  const paragraph = summaryParagraphs.find(
                    (item) => item.key === `dimension-${label}`,
                  );
                  if (paragraph) return renderSummaryParagraph(paragraph);
                  return (
                    <Typography
                      key={`pending-${label}`}
                      variant="body2"
                      color="text.disabled"
                      sx={{ lineHeight: 1.75 }}
                    >
                      按{label}拆解：正在计算…
                    </Typography>
                  );
                })}
              </Box>
            </Box>
          )}
          {(loading || !ready) && <LinearProgress sx={{ mb: 1 }} />}
          {error ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" color="error.main">
                下级维度构成加载失败：{error}
              </Typography>
              <Button
                size="small"
                onClick={() => setRetryToken((value) => value + 1)}
                sx={{ textTransform: "none" }}
              >
                重试
              </Button>
            </Box>
          ) : ready && !loading && visible.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              下级维度暂无足够的历史样本（至少 4 天有效历史）或当天数据，无法拆分归因
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: "text.secondary", mb: 0.25 }}
              >
                构成明细
              </Typography>
              {visible.map(({ value, detail }) => {
                const tone = severityColor[detail.severity];
                return (
                  <Tooltip
                    key={value}
                    title={`${detail.text}（7 日移动平均 ${formatMetricValue(
                      metric,
                      detail.baselineMean,
                    )}，${detail.baselineSamples} 天样本）`}
                    open={tooltipRow === value && !scrolling}
                    onOpen={() => setTooltipRow(value)}
                    onClose={() => setTooltipRow(null)}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        py: 0.5,
                        px: 0.5,
                        borderRadius: 1,
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          minWidth: 0,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {value}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
                      >
                        当前 {formatMetricValue(metric, detail.value)} · 均线{" "}
                        {formatMetricValue(metric, detail.baselineMean)}
                      </Typography>
                      <Chip
                        size="small"
                        variant={detail.significant ? "outlined" : "outlined"}
                        label={detail.deltaText}
                        icon={<DeltaArrow direction={detail.direction} />}
                        sx={{
                          height: 20,
                          flexShrink: 0,
                          fontWeight: 600,
                          color: detail.significant ? tone : "text.secondary",
                          borderColor: detail.significant
                            ? alpha(tone, 0.35)
                            : "divider",
                          bgcolor: detail.significant
                            ? alpha(tone, 0.08)
                            : "transparent",
                          "& .MuiChip-label": {
                            px: 0.75,
                            fontSize: 11,
                            fontVariantNumeric: "tabular-nums",
                          },
                          "& .MuiChip-icon": {
                            color: "inherit",
                            ml: 0.5,
                            mr: -0.25,
                          },
                        }}
                      />
                    </Box>
                  </Tooltip>
                );
              })}
              {overflowCount > 0 && (
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ mt: 0.5 }}
                >
                  另有 {overflowCount} 个维度值参与判定，未在列表中展示
                </Typography>
              )}
            </Box>
          )}

          <Divider sx={{ my: 1 }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
            }}
          >
            <Typography variant="caption" color="text.disabled">
              {dimensionRows > 0
                ? `${dimensionRows} 个${dimensionLabel}显著偏离自身均线`
                : "未检出显著偏离的维度值"}
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={() => {
                if (date) onDrillDate(date);
              }}
              sx={{ textTransform: "none" }}
            >
              下钻查看当日明细
            </Button>
          </Box>
        </Box>
      )}
    </Popover>
  );
}
