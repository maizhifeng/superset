import { useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LinkIcon from "@mui/icons-material/Link";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ScheduleIcon from "@mui/icons-material/Schedule";
import dayjs from "dayjs";
import PageFrame from "@/components/PageFrame";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useNotificationStore } from "@/store/notificationStore";
import AnalysisBreakdownTable from "./components/AnalysisBreakdownTable";
import AnomalyBreakdownPopover from "./components/AnomalyBreakdownPopover";
import AnalysisDrillChart from "./components/AnalysisDrillChart";
import {
  prefetchDateDrill,
  prefetchDimensionBreakdown,
  prefetchDimensionDrill,
  prefetchTimeDrill,
} from "./prefetch";
import AnalysisFilterBar from "./components/AnalysisFilterBar";
import AnalysisKpiCards from "./components/AnalysisKpiCards";
import AnalysisTrendChart from "./components/AnalysisTrendChart";
import EfficiencyScatter from "./components/EfficiencyScatter";
import LtvRoiCurves from "./components/LtvRoiCurves";
import RetentionMatrix from "./components/RetentionMatrix";
import {
  FILTER_DEFINITIONS,
  filtersFromSearchParams,
  filtersToSearchParams,
  resolveDateBounds,
  resolveMatureDateBounds,
  resolvePreviousPeriodBounds,
  type AnalysisFilters,
  type FilterKey,
} from "./filters";
import {
  applyDimensionDrill,
  dimensionForFilterKey,
  drillPath,
  drillTargetLabel,
  enterDateDrill,
  nextDimensionAfterDrills,
  nextDrillDimension,
  pivotDrillToTime,
  removeDrillLevel,
  weeklyDrillDimension,
} from "./drilldown";
import {
  useAnalysisBreakdownData,
  useAnalysisPageData,
} from "./hooks/useAnalysisData";
import { useDrillData } from "./hooks/useDrillData";
import {
  ANALYSIS_TIME_COLUMN,
  ANALYSIS_TOPICS,
  getAnalysisTopic,
  topicMetric,
} from "./topics";
import { seedAnalysisData } from "./query";
import {
  isDefaultSnapshotScope,
  saveAnalysisSnapshot,
  snapshotToAnalysisData,
  useAnalysisSnapshot,
  type AnalysisSnapshot,
} from "./snapshot";
import type { AnalysisAnomaly } from "./anomalies";
import type { AnalysisTopic } from "./types";
import { useRecentAnalysisTopics } from "@/store/recentAnalysisTopics";

function TopicPageContent({
  topic,
  snapshot,
}: {
  topic: AnalysisTopic;
  snapshot?: AnalysisSnapshot | null;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setCustom = useBreadcrumbStore((state) => state.setCustom);
  const notify = useNotificationStore((state) => state.notify);
  const [comparePrevious, setComparePrevious] = useState(true);
  const [showBaseline, setShowBaseline] = useState(false);
  const [weeklyView, setWeeklyView] = useState(false);
  const compareBeforeWeeklyRef = useRef(true);
  const [anomalyDetail, setAnomalyDetail] = useState<{
    anomaly: AnalysisAnomaly;
    date: string;
    anchor: HTMLElement;
  } | null>(null);

  const filters = useMemo(
    () =>
      filtersFromSearchParams(
        new URLSearchParams(searchParams.toString()),
        topic,
      ),
    [searchParams, topic],
  );

  const [snapshotDirty, setSnapshotDirty] = useState(false);
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(
    snapshot?.generated_at ?? null,
  );
  const snapshotSavedRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const refreshSawLoadingRef = useRef(false);

  const core = useAnalysisPageData(topic, filters);
  const dateDrillMode = Boolean(filters.focusDate);
  const weekDrillMode = Boolean(filters.focusWeek) && !dateDrillMode;
  const drillMode = dateDrillMode || weekDrillMode;
  const breakdown = useAnalysisBreakdownData(topic, filters, {
    enabled: !dateDrillMode,
  });
  const drillData = useDrillData(topic, filters);
  // Drill mode uses the single combined query for both the day rows and the
  // attribution history; trend mode keeps the normal breakdown query.
  const breakdownRows = dateDrillMode ? drillData.rows : breakdown.data.rows;
  const breakdownLoading = dateDrillMode
    ? drillData.loading
    : breakdown.loading;
  const breakdownError = dateDrillMode ? drillData.error : breakdown.error;
  const data = {
    ...core.data,
    breakdown: {
      ...breakdown.data,
      rows: breakdownRows,
      error: breakdownError,
    },
  };
  const coreLoading = core.loading;
  const loading = coreLoading || breakdownLoading;
  const error = core.error ?? breakdownError ?? drillData.error;
  const snapshotActive =
    Boolean(snapshotGeneratedAt) && isDefaultSnapshotScope(topic, filters);

  useEffect(() => {
    if (snapshot?.generated_at) {
      setSnapshotGeneratedAt(snapshot.generated_at);
    }
  }, [snapshot]);

  // When the live default view has settled, persist it as the snapshot so the
  // next visitor can paint without federated queries.  Snapshots loaded from
  // the server are not re-saved unless the user explicitly refreshes.
  useEffect(() => {
    if (!isDefaultSnapshotScope(topic, filters)) return;
    if (refreshPendingRef.current) {
      if (loading) {
        refreshSawLoadingRef.current = true;
        return;
      }
      // Wait for at least one loading transition, otherwise the effect that
      // reacts to "refresh clicked" would save the old snapshot data.
      if (!refreshSawLoadingRef.current) return;
      refreshPendingRef.current = false;
      refreshSawLoadingRef.current = false;
    }
    if (loading || error) return;
    if (
      data.totals.rows.length === 0 &&
      data.trend.rows.length === 0 &&
      data.breakdown.rows.length === 0
    ) {
      return;
    }
    // Never persist a transient response: switching from a drill back to the
    // default view can briefly leave the previous dimension's rows in place.
    const breakdownMatchesDimension =
      data.breakdown.rows.length > 0 &&
      data.breakdown.rows.every(
        (row) =>
          row[filters.dimension] !== undefined &&
          row[filters.dimension] !== null,
      );
    if (!breakdownMatchesDimension) return;
    if (snapshot && !snapshotDirty) return;
    if (snapshotSavedRef.current) return;
    snapshotSavedRef.current = true;
    void saveAnalysisSnapshot(topic, filters, {
      totals: data.totals,
      previous: data.previous,
      trend: data.trend,
      previousTrend: data.previousTrend,
      breakdown: data.breakdown,
    }).then(() => {
      setSnapshotGeneratedAt(new Date().toISOString());
      setSnapshotDirty(false);
    });
  }, [
    data.breakdown,
    data.previous,
    data.previousTrend,
    data.totals,
    data.trend,
    error,
    filters,
    loading,
    snapshot,
    snapshotDirty,
    topic,
  ]);
  const refresh = () => {
    // Refresh must bypass the snapshot: force a live query and then replace
    // the persisted snapshot with the fresh default view.
    setSnapshotDirty(true);
    snapshotSavedRef.current = false;
    refreshPendingRef.current = true;
    refreshSawLoadingRef.current = false;
    core.refresh();
    if (drillMode) {
      drillData.refresh();
    } else {
      breakdown.refresh();
    }
  };

  useEffect(() => {
    // Topic switching moved from the old tab strip into this breadcrumb
    // dropdown; keep the current range/filters when jumping to another topic.
    const params = filtersToSearchParams(filters);
    params.delete("dim");
    params.delete("date");
    for (const definition of FILTER_DEFINITIONS) {
      params.delete(`drill_${definition.key}`);
    }
    const query = params.toString();
    const suffix = query ? `?${query}` : "";
    setCustom({
      label: topic.title,
      options: ANALYSIS_TOPICS.map((entry) => ({
        label: entry.title,
        path: `/analysis/${entry.id}${suffix}`,
        selected: entry.id === topic.id,
      })),
    });
    return () => setCustom(null);
  }, [filters, setCustom, topic.id, topic.title]);

  // Feed the hall's "最近查看" shortcut row; the hall only reads the store.
  useEffect(() => {
    useRecentAnalysisTopics.getState().record(topic.id);
  }, [topic.id]);

  const updateFilters = (next: AnalysisFilters) => {
    setSearchParams(filtersToSearchParams(next), { replace: true });
  };

  const dimensionDrills = FILTER_DEFINITIONS.flatMap((definition) =>
    (filters.drill?.[definition.key] ?? []).map((value) => ({
      key: definition.key,
      label: definition.label,
      value,
    })),
  );
  const hasDrill =
    Boolean(filters.focusDate) ||
    Boolean(filters.focusWeek) ||
    dimensionDrills.length > 0;
  /** Deepest table drill, used by the "返回上一级" control. */
  const drillOrder = new Map(
    drillPath(topic).map((dimension, index) => [dimension, index]),
  );
  const deepestDrill = [...dimensionDrills].sort((left, right) => {
    const leftOrder =
      drillOrder.get(dimensionForFilterKey(left.key) ?? "") ?? -1;
    const rightOrder =
      drillOrder.get(dimensionForFilterKey(right.key) ?? "") ?? -1;
    return leftOrder - rightOrder;
  }).at(-1);

  /** Changing a global filter or date range exits the drill hierarchy. */
  const handleFilterChange = (next: AnalysisFilters) => {
    const cleaned = { ...next, focusWeek: undefined };
    if (!hasDrill) {
      updateFilters(cleaned);
      return;
    }
    updateFilters({
      ...cleaned,
      focusDate: undefined,
      drill: {},
      dimension: topic.defaultDimension,
    });
  };

  const handleDrill = (dimension: string, value: string) => {
    // Inside a single-day drill, clicking a category pivots to that category's
    // day-by-day view instead of continuing to the next hierarchy level.
    if (filters.focusWeek) {
      const next = pivotDrillToTime(filters, topic, dimension, value);
      if (next) {
        // Leave the single-week scope: the weekly trend should span the
        // original range, filtered to the clicked channel.
        updateFilters({ ...next, focusWeek: undefined });
      }
      return;
    }
    if (filters.focusDate) {
      const next = pivotDrillToTime(filters, topic, dimension, value);
      if (next) updateFilters(next);
      return;
    }
    if (filters.dimension === ANALYSIS_TIME_COLUMN) {
      // From the channel's daily view, a date row drills into that day's
      // media breakdown, keeping the channel filter.
      const target = nextDimensionAfterDrills(topic, filters);
      if (!target) return;
      updateFilters({
        ...filters,
        focusDate: value,
        focusWeek: undefined,
        dimension: target,
      });
      return;
    }
    const next = applyDimensionDrill(filters, topic, dimension, value);
    if (next) updateFilters(next);
  };

  const removeDrill = (key: FilterKey, value: string) => {
    const drill = { ...(filters.drill ?? {}) };
    const remaining = (drill[key] ?? []).filter((item) => item !== value);
    if (remaining.length > 0) drill[key] = remaining;
    else {
      // Removing the last value of a level steps the whole drill path back.
      const stepped = removeDrillLevel({ ...filters, drill }, topic, key);
      updateFilters(stepped);
      return;
    }
    updateFilters({ ...filters, drill });
  };

  const clearDrill = () => {
    updateFilters({
      ...filters,
      focusDate: undefined,
      focusWeek: undefined,
      dimension: topic.defaultDimension,
      drill: {},
    });
  };

  /**
   * A date click on the trend chart turns the chart itself into the drill view:
   * the day becomes the active filter and the x-axis moves to the next
   * dimension of the topic hierarchy (for cost: 主游戏 → 渠道商).
   */
  const handleWeekClick = (weekStart: string) => {
    if (filters.dimension === ANALYSIS_TIME_COLUMN) {
      // From the channel's weekly view, a week bar drills into that week's
      // media breakdown, keeping the channel filter and weekly mode.
      const target = nextDimensionAfterDrills(topic, filters);
      if (!target) return;
      updateFilters({
        ...filters,
        focusDate: undefined,
        focusWeek: weekStart,
        dimension: target,
      });
      return;
    }
    // Weekly drill always opens the channel dimension (even for topics whose
    // default dimension is a terminal level such as 媒体).  A second click on
    // a channel then returns to that channel's weekly trend over the range.
    const target =
      weeklyDrillDimension(topic) ??
      nextDrillDimension(topic, filters.dimension) ??
      filters.dimension;
    updateFilters({
      ...filters,
      focusDate: undefined,
      focusWeek: weekStart,
      dimension: target,
    });
  };

  const handleDateClick = (date: string) => {
    if (filters.dimension === ANALYSIS_TIME_COLUMN) {
      const target = nextDimensionAfterDrills(topic, filters);
      if (target) {
        updateFilters({
          ...filters,
          focusDate: date,
          focusWeek: undefined,
          dimension: target,
        });
      }
      return;
    }
    if (topic.maturityDays) {
      const matureEnd = resolveMatureDateBounds(
        filters,
        topic.maturityDays,
      ).end;
      if (date > matureEnd) {
        notify({
          severity: "info",
          message: `${date} 位于 ${topic.maturityDays} 天观察期内，部分指标尚未成熟，下钻结果中相关指标可能偏低或为空。`,
        });
      }
    }
    updateFilters(enterDateDrill(topic, filters, date));
  };

  // Hovering a point speculatively fetches the drill response: the click then
  // renders from cache instead of waiting on the federated databases.
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    },
    [],
  );
  const handleDateHover = (date: string) => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(() => {
      prefetchTimer.current = null;
      prefetchDateDrill(topic, filters, date);
    }, 200);
  };

  // Clicking an anomaly chip opens the next dimension's contribution list;
  // hovering it warms the same queries the popover will read.
  const handleAnomalyClick = (
    anomaly: AnalysisAnomaly,
    date: string,
    anchor: HTMLElement,
  ) => {
    setAnomalyDetail({ anomaly, date, anchor });
  };
  const handleAnomalyHover = (_anomaly: AnalysisAnomaly, date: string) => {
    prefetchDateDrill(topic, filters, date);
  };

  const nextDimension = nextDrillDimension(topic, filters.dimension);
  const nextAfterDrills = nextDimensionAfterDrills(topic, filters);
  const timeDrillTarget =
    filters.dimension === ANALYSIS_TIME_COLUMN ? nextAfterDrills : null;
  const timeDrillTargetLabel = timeDrillTarget
    ? (topic.dimensions.find((item) => item.key === timeDrillTarget)?.label ??
      timeDrillTarget)
    : null;

  // Warm the most likely next drill scope once the current level settles: the
  // first row is what most users click, and the chain continues one more level
  // so the game → channel → media path is already cached for the top rows.
  useEffect(() => {
    if (drillMode || !nextDimension || coreLoading || breakdownLoading) {
      return undefined;
    }
    const firstRow = data.breakdown.rows[0];
    const value = firstRow
      ? String(firstRow[filters.dimension] ?? "").trim()
      : "";
    if (!value || value === "–") return undefined;
    const timer = window.setTimeout(() => {
      prefetchDimensionBreakdown(topic, filters, filters.dimension, value);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [
    breakdownLoading,
    coreLoading,
    data.breakdown.rows,
    drillMode,
    filters,
    nextDimension,
    topic,
  ]);

  // Hovering a table row speculatively loads what its click will open: the
  // next hierarchy level, or (inside a date drill) that row's daily view.
  const handleRowHover = (value: string) => {
    if (filters.focusDate || filters.focusWeek) {
      prefetchTimeDrill(topic, filters, filters.dimension, value);
      return;
    }
    if (!nextDimension) return;
    prefetchDimensionDrill(topic, filters, filters.dimension, value);
  };
  const nextDimensionLabel = drillTargetLabel(topic, filters.dimension);
  const currentDimensionLabel =
    topic.dimensions.find((item) => item.key === filters.dimension)?.label ??
    filters.dimension;
  const drillHint =
    filters.dimension === ANALYSIS_TIME_COLUMN
      ? timeDrillTargetLabel
        ? `点击行下钻至 ${timeDrillTargetLabel}`
        : "逐日明细"
      : filters.focusDate
        ? `点击行查看该${currentDimensionLabel}的分天情况`
        : filters.focusWeek
          ? `点击行查看该${currentDimensionLabel}的分周趋势`
          : nextDimension
            ? `点击行下钻至 ${nextDimensionLabel}`
            : "当前维度无下级";
  /** Dimension the chart switches to when a date is clicked. */
  const dateDrillDimension = nextDimension ?? filters.dimension;
  const dateDrillLabel =
    topic.dimensions.find((item) => item.key === dateDrillDimension)?.label ??
    dateDrillDimension;
  const dateDrillTargetLabel =
    filters.dimension === ANALYSIS_TIME_COLUMN
      ? timeDrillTargetLabel
      : dateDrillLabel;
  const dateDrillTooltip = weeklyView
    ? `点击图表中的周柱体：将该周作为筛选条件，并把拆解维度切换为「${dateDrillTargetLabel}」。`
    : filters.dimension === ANALYSIS_TIME_COLUMN
      ? timeDrillTargetLabel
        ? `点击图表中的日期柱体或折线点：将该日作为筛选条件，并把拆解维度切换为「${timeDrillTargetLabel}」。`
        : `当前已是最末级拆解，点击日期不再继续下钻。`
      : nextDimension
        ? `点击图表中的日期柱体或折线点：将该日作为筛选条件，并把图表切换为按「${dateDrillLabel}」拆解的下钻视图。`
        : `点击图表中的日期柱体或折线点：将该日作为筛选条件，并查看当日按「${currentDimensionLabel}」拆解的数据（已属钻取末级）。`;

  const kpiMetrics = topic.kpis.map((key) => topicMetric(topic, key));
  const totalsRow = data.totals.rows[0] ?? null;

  // The overseas source hard-codes paid-retention counts to 0, so any view
  // that includes overseas must mask those metrics instead of showing 0%.
  const paidRetentionFieldKeys = useMemo(() => {
    if (topic.id !== "retention") return [];
    return topic.breakdown.metrics
      .map((key) => topicMetric(topic, key))
      .filter((metric) => metric.label.includes("付费留存率"))
      .map((metric) => metric.key);
  }, [topic]);
  const overseasRetentionGap =
    topic.id === "retention" && filters.platforms.includes("oversea");
  const retentionUnavailableKeys = overseasRetentionGap
    ? paidRetentionFieldKeys
    : [];
  const retentionUnavailableRowValues =
    filters.dimension === "平台" ? ["oversea"] : [];
  const previousRow = data.previous.rows[0] ?? null;
  const matureBounds = resolveMatureDateBounds(
    filters,
    topic.maturityDays ?? 0,
  );
  const selectedBounds = resolveDateBounds(filters);
  const previousTrendBounds = resolvePreviousPeriodBounds(filters, 0);
  const comparisonOffsetDays = dayjs(selectedBounds.start).diff(
    dayjs(previousTrendBounds.start),
    "day",
  );
  const rangeShifted =
    matureBounds.start !== selectedBounds.start ||
    matureBounds.end !== selectedBounds.end;
  const maturityNotice = topic.maturityDays
    ? `${topic.title}指标有观察期：KPI、明细及汇总视图统计截至 ${matureBounds.end}（已满足 ${topic.maturityDays} 天观察期${rangeShifted ? "，统计区间已整体前移" : ""}）；趋势图按所选日期展示，未满观察期的尾部留空。`
    : null;
  /** One-line version of the observation-window notice; details live in a tooltip. */
  const maturitySummary = topic.maturityDays
    ? `KPI 与明细统计截至 ${matureBounds.end}（满足 ${topic.maturityDays} 天观察期${rangeShifted ? "，窗口已整体前移" : ""}），趋势图按所选日期展示`
    : null;

  // KPI deltas compare two equally mature windows; the trend compares each
  // point with the same day of the previous equal-length window.  Both need
  // to read as concrete dates rather than a vague "上期".
  const kpiComparisonBounds = resolvePreviousPeriodBounds(
    filters,
    topic.maturityDays ?? 0,
  );
  const periodLabel = (bounds: { start: string; end: string }) =>
    `${bounds.start} ~ ${bounds.end}`;
  const kpiWindowDays =
    dayjs(matureBounds.end).diff(dayjs(matureBounds.start), "day") + 1;
  /** Drill date sits inside the observation window → some metrics immature. */
  const drillDateImmature = Boolean(
    topic.maturityDays &&
      filters.focusDate &&
      filters.focusDate > matureBounds.end,
  );
  const kpiWindowLabel = periodLabel(matureBounds);
  const kpiComparisonLabel = periodLabel(kpiComparisonBounds);
  const trendComparisonLabel = periodLabel(previousTrendBounds);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify({ severity: "success", message: "已复制当前筛选链接" });
    } catch {
      notify({ severity: "error", message: "复制失败，请手动复制地址栏链接" });
    }
  };

  const sectionError =
    error ??
    data.totals.error ??
    data.trend.error ??
    data.breakdown.error ??
    null;
  const hasAnyData =
    totalsRow !== null ||
    data.trend.rows.length > 0 ||
    data.breakdown.rows.length > 0;

  /** Drill path chips rendered inside the chart card header (saves a row). */
  const drillChips = hasDrill ? (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        flexWrap: "wrap",
      }}
    >
      {filters.focusDate && (
        <Chip
          size="small"
          variant="outlined"
          label={`日期 ${filters.focusDate}`}
          onDelete={clearDrill}
          sx={{
            height: 20,
            "& .MuiChip-label": { px: 0.75, fontSize: "0.6875rem" },
          }}
        />
      )}
      {filters.focusWeek && (
        <Chip
          size="small"
          variant="outlined"
          label={`周 ${filters.focusWeek} ~ ${dayjs(filters.focusWeek)
            .add(6, "day")
            .format("MM-DD")}`}
          onDelete={clearDrill}
          sx={{
            height: 20,
            "& .MuiChip-label": { px: 0.75, fontSize: "0.6875rem" },
          }}
        />
      )}
      {dimensionDrills.map((drill) => (
        <Chip
          key={`${drill.key}-${drill.value}`}
          size="small"
          variant="outlined"
          label={`${drill.label}：${drill.value}`}
          onDelete={() => removeDrill(drill.key, drill.value)}
          sx={{
            height: 20,
            "& .MuiChip-label": { px: 0.75, fontSize: "0.6875rem" },
          }}
        />
      ))}
    </Box>
  ) : null;

  return (
    <PageFrame
      page="analysis"
      title={topic.title}
      subtitle={topic.description}
      compact
      hideTitle
      actions={
        <>
          <Tooltip title="返回专题大厅">
            <IconButton
              size="small"
              aria-label="返回专题大厅"
              onClick={() => navigate("/analysis")}
              sx={{ color: "text.secondary" }}
            >
              <ArrowBackIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="复制当前筛选链接">
            <IconButton
              size="small"
              aria-label="复制当前筛选链接"
              onClick={() => void copyLink()}
              sx={{ color: "text.secondary" }}
            >
              <LinkIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            onClick={refresh}
            disabled={loading}
            sx={{ textTransform: "none" }}
          >
            刷新
          </Button>
        </>
      }
      toolbar={
        <AnalysisFilterBar
          topic={topic}
          filters={filters}
          onChange={handleFilterChange}
        />
      }
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            pr: 0.5,
          }}
        >
          {loading && (
            <LinearProgress
              sx={{
                position: "sticky",
                top: 0,
                zIndex: 4,
                height: 2,
                mb: 1,
                borderRadius: 1,
              }}
            />
          )}

          {!loading && sectionError && (
            <Alert
              severity={hasAnyData ? "warning" : "error"}
              action={
                <Button color="inherit" size="small" onClick={refresh}>
                  重试
                </Button>
              }
              sx={{ mb: 1.5 }}
            >
              {sectionError}
            </Alert>
          )}

          {maturitySummary && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                mb: 1,
                px: 1,
                py: 0.25,
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: (theme) => alpha(theme.palette.info.main, 0.28),
                bgcolor: (theme) => alpha(theme.palette.info.main, 0.06),
              }}
            >
              <ScheduleIcon sx={{ fontSize: 16, color: "info.main" }} />
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: { xs: "normal", md: "nowrap" },
                }}
              >
                {maturitySummary}
              </Typography>
              <Tooltip title={maturityNotice ?? ""}>
                <IconButton
                  size="small"
                  aria-label="查看统计口径"
                  sx={{ ml: "auto", p: 0.25, color: "text.disabled" }}
                >
                  <InfoOutlinedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 1,
              flexWrap: "wrap",
              mb: 0.5,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              核心指标
            </Typography>
            <Tooltip title="核心指标的统计窗口及其等长对比窗口；留存/LTV 专题有观察期，统计窗口会整体前移。趋势图的“趋势对比期”与所选日期等长，逐日对齐到上期同一天。">
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: { xs: 1, md: 2 },
                  flexWrap: "wrap",
                  rowGap: 0.5,
                }}
              >
              <Typography variant="caption" color="text.secondary">
                统计窗口{" "}
                <Box
                  component="span"
                  sx={{
                    color: "text.primary",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {kpiWindowLabel}
                </Box>
                （{kpiWindowDays} 天）
              </Typography>
              <Typography variant="caption" color="text.secondary">
                对比窗口{" "}
                <Box
                  component="span"
                  sx={{
                    color: "text.primary",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {kpiComparisonLabel}
                </Box>
              </Typography>
              {snapshotActive && snapshotGeneratedAt && (
                <Tooltip
                  title={`默认视图快照生成于 ${dayjs(snapshotGeneratedAt).format("YYYY-MM-DD HH:mm")}；点击刷新可获取最新数据`}
                >
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`快照 ${dayjs(snapshotGeneratedAt).format("MM-DD HH:mm")}`}
                    sx={{
                      height: 20,
                      color: "text.secondary",
                      borderColor: "divider",
                      "& .MuiChip-label": {
                        px: 0.75,
                        fontSize: "0.6875rem",
                        fontVariantNumeric: "tabular-nums",
                      },
                    }}
                  />
                </Tooltip>
              )}
              </Box>
            </Tooltip>
          </Box>

          <AnalysisKpiCards
            metrics={kpiMetrics}
            row={totalsRow}
            previousRow={previousRow}
            comparisonRange={kpiComparisonLabel}
            unavailableMetricKeys={retentionUnavailableKeys}
            loading={coreLoading && !hasAnyData}
          />

          <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, borderRadius: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                flexWrap: "wrap",
                mb: 0.75,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1,
                  minWidth: 0,
                  flexWrap: "wrap",
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {drillMode ? "下钻" : "趋势"}
                </Typography>
                {!drillMode && (
                  <Tooltip
                    title={
                      <Box component="span">
                        <Box component="span" sx={{ display: "block" }}>
                          {topic.trend.note ??
                            "按自然日聚合，随筛选条件变化"}
                        </Box>
                        <Box
                          component="span"
                          sx={{ display: "block", mt: 0.5 }}
                        >
                          {dateDrillTooltip}
                        </Box>
                      </Box>
                    }
                  >
                    <InfoOutlinedIcon
                      sx={{
                        fontSize: 15,
                        color: "text.disabled",
                        cursor: "help",
                      }}
                    />
                  </Tooltip>
                )}
                {drillMode && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {filters.focusDate
                      ? `${filters.focusDate} · 按 ${currentDimensionLabel} 拆解`
                      : `周 ${filters.focusWeek} ~ ${dayjs(filters.focusWeek)
                          .add(6, "day")
                          .format("MM-DD")} · 按 ${currentDimensionLabel} 拆解`}
                    {drillDateImmature ? "（观察期内，部分指标未成熟）" : ""}
                  </Typography>
                )}
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {drillMode ? (
                  <>
                    {drillChips}
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
                      onClick={clearDrill}
                      sx={{ textTransform: "none" }}
                    >
                      返回趋势
                    </Button>
                  </>
                ) : (
                  <>
                    {weeklyView ? (
                      <Tooltip title="按周日–周六分组；选中区间的首、末周可能不是完整周，需要精确周期时请用日视图或自定义日期">
                        <Chip
                          size="small"
                          variant="outlined"
                          label="周视图：周日–周六"
                          sx={{
                            height: 20,
                            color: "text.secondary",
                            borderColor: "divider",
                            "& .MuiChip-label": {
                              px: 0.75,
                              fontSize: "0.6875rem",
                            },
                          }}
                        />
                      </Tooltip>
                    ) : comparePrevious ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`趋势对比期 ${trendComparisonLabel}`}
                        sx={{
                          height: 20,
                          color: "text.secondary",
                          borderColor: "divider",
                          "& .MuiChip-label": {
                            px: 0.75,
                            fontSize: "0.6875rem",
                            fontVariantNumeric: "tabular-nums",
                          },
                        }}
                      />
                    ) : null}
                    <Tooltip
                      title={
                        weeklyView
                          ? "周视图下默认不叠加对比曲线：悬停可查看上一周值与周环比；需要叠加时再打开。"
                          : `对比期 ${trendComparisonLabel}：与所选日期等长，逐日对齐到上期同一天。`
                      }
                    >
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={comparePrevious}
                            onChange={(event) =>
                              setComparePrevious(event.target.checked)
                            }
                          />
                        }
                        label="对比上期"
                        sx={{
                          m: 0,
                          "& .MuiFormControlLabel-label": {
                            fontSize: "0.75rem",
                          },
                        }}
                      />
                    </Tooltip>
                    <Tooltip
                      title={
                        weeklyView
                          ? "7 日移动平均只适用于按日查看，切换回日视图后可用"
                          : "虚线 = 前 7 天实际值的移动平均（不含当天）。异常判定就是当天值相对这条均线：既要超过 2.5 倍近期波动，也要超过最小幅度阈值（成本类上涨 ≥20%、下降 ≥40%）"
                      }
                    >
                      <FormControlLabel
                        disabled={weeklyView}
                        control={
                          <Switch
                            size="small"
                            checked={showBaseline && !weeklyView}
                            onChange={(event) =>
                              setShowBaseline(event.target.checked)
                            }
                          />
                        }
                        label="7日均线"
                        sx={{
                          m: 0,
                          "& .MuiFormControlLabel-label": {
                            fontSize: "0.75rem",
                          },
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="按周日–周六聚合：累加指标取周合计，率值按对应量加权（如 CPA 按新增进入加权）">
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={weeklyView}
                            onChange={(event) => {
                              setWeeklyView(event.target.checked);
                              if (event.target.checked) {
                                compareBeforeWeeklyRef.current =
                                  comparePrevious;
                                setShowBaseline(false);
                                // At weekly granularity the previous-week curve
                                // mostly duplicates the current one; keep a
                                // single curve and expose WoW in the tooltip.
                                setComparePrevious(false);
                              } else {
                                // Restore the daily comparison the user had
                                // before switching to the weekly view.
                                setComparePrevious(
                                  compareBeforeWeeklyRef.current,
                                );
                              }
                            }}
                          />
                        }
                        label="周视图"
                        sx={{
                          m: 0,
                          "& .MuiFormControlLabel-label": {
                            fontSize: "0.75rem",
                          },
                        }}
                      />
                    </Tooltip>
                    <Tooltip
                      title={
                        filters.media.length > 0
                          ? "已手动筛选媒体，该开关不生效"
                          : "关闭后趋势图排除媒体=自然量的数据；核心指标与明细表不受影响"
                      }
                    >
                      <FormControlLabel
                        disabled={filters.media.length > 0}
                        control={
                          <Switch
                            size="small"
                            checked={filters.includeNatural !== false}
                            onChange={(event) =>
                              updateFilters({
                                ...filters,
                                includeNatural: event.target.checked,
                              })
                            }
                          />
                        }
                        label="含自然量"
                        sx={{
                          m: 0,
                          "& .MuiFormControlLabel-label": {
                            fontSize: "0.75rem",
                          },
                        }}
                      />
                    </Tooltip>
                  </>
                )}
              </Box>
            </Box>
            {hasDrill && !drillMode && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  flexWrap: "wrap",
                  mb: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "action.hover",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: "text.secondary" }}
                >
                  下钻路径
                </Typography>
                {drillChips}
                <Typography variant="caption" color="text.disabled">
                  {filters.focusWeek
                    ? "已进入该周下钻，按渠道商拆解"
                    : weeklyView &&
                        filters.dimension === ANALYSIS_TIME_COLUMN
                      ? "已按周展示当前筛选趋势"
                      : filters.dimension === ANALYSIS_TIME_COLUMN
                        ? "已切换为按日期查看分天情况"
                        : "趋势图已按此条件联动"}
                </Typography>
                <Box sx={{ ml: "auto", display: "flex", gap: 0.5 }}>
                  <Button
                    size="small"
                    variant="text"
                    disabled={!deepestDrill}
                    onClick={() => {
                      if (!deepestDrill) return;
                      removeDrill(deepestDrill.key, deepestDrill.value);
                    }}
                    sx={{ textTransform: "none" }}
                  >
                    返回上一级
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    onClick={clearDrill}
                    sx={{ textTransform: "none" }}
                  >
                    清除
                  </Button>
                </Box>
              </Box>
            )}
            {drillMode ? (
              <AnalysisDrillChart
                topic={topic}
                rows={data.breakdown.rows}
                dimension={filters.dimension}
                focusDate={filters.focusDate}
                focusWeek={filters.focusWeek}
                nextDimensionLabel={
                  dateDrillMode ? nextDimensionLabel : null
                }
                drillHint={
                  dateDrillMode
                    ? `查看该${currentDimensionLabel}的分天情况`
                    : `查看该${currentDimensionLabel}的分周趋势`
                }
                onDrill={
                  nextDimension || filters.focusDate || filters.focusWeek
                    ? (value) => handleDrill(filters.dimension, value)
                    : undefined
                }
                anomalies={dateDrillMode ? drillData.anomalies : undefined}
                anomalyMetric={dateDrillMode ? drillData.metric : undefined}
                anomalyLoading={dateDrillMode ? drillData.loading : false}
                anomalyError={dateDrillMode ? drillData.error : null}
                loading={breakdownLoading}
                height={240}
              />
            ) : (
              <AnalysisTrendChart
                topic={topic}
                rows={data.trend.rows}
                previousRows={data.previousTrend.rows}
                showComparison={comparePrevious}
                comparisonOffsetDays={comparisonOffsetDays}
                onDateClick={
                  filters.dimension === ANALYSIS_TIME_COLUMN &&
                  !timeDrillTarget
                    ? undefined
                    : handleDateClick
                }
                onWeekClick={
                  !filters.focusDate &&
                  !filters.focusWeek &&
                  (filters.dimension !== ANALYSIS_TIME_COLUMN ||
                    Boolean(timeDrillTarget))
                    ? handleWeekClick
                    : undefined
                }
                onDateHover={
                  filters.dimension === ANALYSIS_TIME_COLUMN
                    ? undefined
                    : handleDateHover
                }
                onAnomalyClick={handleAnomalyClick}
                onAnomalyHover={handleAnomalyHover}
                hiddenSeriesKeys={
                  overseasRetentionGap ? retentionUnavailableKeys : undefined
                }
                dataQualityNote={
                  overseasRetentionGap
                    ? "海外平台付费留存明细暂未接入，相关留存曲线已隐藏；表格与 KPI 以「–」展示"
                    : undefined
                }
                showRollingBaseline={showBaseline}
                weeklyView={weeklyView}
                loading={coreLoading && data.trend.rows.length === 0}
                height={240}
              />
            )}
          </Paper>

          <AnomalyBreakdownPopover
            topic={topic}
            filters={filters}
            anomaly={anomalyDetail?.anomaly ?? null}
            date={anomalyDetail?.date ?? null}
            anchorEl={anomalyDetail?.anchor ?? null}
            totalsRow={data.totals.rows[0] ?? null}
            windowLabel={kpiWindowLabel}
            windowDays={kpiWindowDays}
            onClose={() => setAnomalyDetail(null)}
            onDrillDate={(date) => {
              setAnomalyDetail(null);
              handleDateClick(date);
            }}
          />

          <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, borderRadius: 2 }}>
            <AnalysisBreakdownTable
              topic={topic}
              rows={data.breakdown.rows}
              dimension={filters.dimension}
              onDimensionChange={(dimension) =>
                updateFilters({ ...filters, dimension })
              }
              onDrill={
                nextDimension ||
                filters.focusDate ||
                filters.focusWeek ||
                Boolean(timeDrillTarget)
                  ? handleDrill
                  : undefined
              }
              onRowHover={
                nextDimension || filters.focusDate || filters.focusWeek
                  ? handleRowHover
                  : undefined
              }
              drillHint={drillHint}
              focusDate={filters.focusDate}
              focusWeek={filters.focusWeek}
              anomalies={dateDrillMode ? drillData.anomalies : undefined}
              anomalyMetricLabel={
                dateDrillMode ? drillData.metric?.label : undefined
              }
              anomalyMetric={dateDrillMode ? drillData.metric : undefined}
              unavailableMetricKeys={retentionUnavailableKeys}
              unavailableAllRows={overseasRetentionGap}
              unavailableDimensionValues={retentionUnavailableRowValues}
              loading={breakdownLoading}
              height={360}
            />
          </Paper>

          {topic.extra && (
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, borderRadius: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1,
                  minWidth: 0,
                  mb: 1,
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, flexShrink: 0 }}
                >
                  {topic.extra.title}
                </Typography>
                {topic.extra.description && (
                  <Tooltip title={topic.extra.description}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {topic.extra.description}
                    </Typography>
                  </Tooltip>
                )}
              </Box>
              {topic.extra.type === "retention-matrix" && (
                <RetentionMatrix
                  topic={topic}
                  rows={data.breakdown.rows}
                  dimension={filters.dimension}
                  platforms={filters.platforms}
                  loading={breakdownLoading}
                />
              )}
              {topic.extra.type === "ltv-roi" && (
                <LtvRoiCurves
                  topic={topic}
                  totals={totalsRow}
                  loading={coreLoading && !totalsRow}
                />
              )}
              {topic.extra.type === "efficiency-scatter" && (
                <EfficiencyScatter
                  topic={topic}
                  rows={data.breakdown.rows}
                  dimension={filters.dimension}
                  loading={breakdownLoading}
                />
              )}
            </Paper>
          )}
        </Box>
      </Box>
    </PageFrame>
  );
}

/** Resolve the route topic and keep the content mounted per topic. */
export default function TopicPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const [searchParams] = useSearchParams();
  const hasRenderedContent = useRef(false);
  const topic = getAnalysisTopic(topicId);
  const filters = useMemo(
    () =>
      topic
        ? filtersFromSearchParams(
            new URLSearchParams(searchParams.toString()),
            topic,
          )
        : null,
    [searchParams, topic],
  );
  const snapshotEligible = Boolean(
    topic && filters && isDefaultSnapshotScope(topic, filters),
  );
  const snapshotState = useAnalysisSnapshot(topic?.id, snapshotEligible);

  if (!topic || !filters) {
    return <Navigate to="/analysis" replace />;
  }

  // The snapshot request is a local metadata read; blocking the first paint on
  // it is what lets the topic page render from persisted data instead of
  // starting a federated query.  Non-default scopes skip it entirely.
  if (
    snapshotEligible &&
    snapshotState.loading &&
    !hasRenderedContent.current
  ) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          minHeight: 240,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          正在加载快照…
        </Typography>
      </Box>
    );
  }

  const snapshot = snapshotEligible ? snapshotState.snapshot : null;
  if (snapshot) {
    seedAnalysisData(topic, filters, snapshotToAnalysisData(snapshot));
  }
  hasRenderedContent.current = true;

  return (
    <TopicPageContent key={topic.id} topic={topic} snapshot={snapshot} />
  );
}
