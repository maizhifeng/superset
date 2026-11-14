import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { EChartsOption } from "echarts";
import { postAnalysisChartData } from "@/api/chartData";
import {
  ANCHOR_LABELS,
  type AnchorKey,
} from "@/pages/Dashboard/compareStartDate";
import EChart from "@/pages/Briefing/EChart";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { normalizeAnchors } from "../anchorOptions";
import type { AnalysisFilters } from "../filters";
import { useProjectCompareOptions } from "../hooks/useProjectCompareOptions";
import { formatAxisValue, formatMetricValue } from "../format";
import {
  DEFAULT_PROJECT_COMPARE_GRAIN,
  PROJECT_COMPARE_GRAINS,
  PROJECT_COMPARE_QUERY_DEBOUNCE_MS,
  bestProjectCompareValues,
  buildProjectCompareChartModel,
  buildProjectCompareQueries,
  hasProjectCompareChartData,
  hasProjectCompareTableData,
  isAbortError,
  parseProjectCompareResults,
  planProjectCompareSections,
  projectCompareBucketRows,
  projectCompareMetricDefs,
  projectCompareRowsForAnchor,
  projectKey,
  type ProjectCompareGrain,
  type ProjectCompareSection,
  type ProjectCompareSectionRows,
  type ProjectCompareTableRow,
  type ProjectOption,
} from "../projectCompare";
import { PROJECT_COMPARE_METRIC_KEYS, topicMetric } from "../topics";
import type { AnalysisMetric, AnalysisTopic } from "../types";

const CHART_HEIGHT = 260;

const GRAIN_HINT =
  "横轴按各项目自己的锚点起始日对齐：日=锚点后第 N 天，周=每 7 天一块（第 1-7 天为第 1 周），月=自然月序号；不同长度窗口的尾部留空，不与其他项目错位。比率指标按分母加权聚合，加法指标求和。";

const LINE_TYPES = ["solid", "dashed", "dotted"] as const;

/** Sticky first column: project names stay visible while metrics scroll. */
const ROW_LABEL_SX = {
  position: "sticky",
  left: 0,
  zIndex: 1,
  bgcolor: "background.paper",
  borderRight: "1px solid",
  borderRightColor: "divider",
  fontWeight: 600,
  whiteSpace: "nowrap",
  textAlign: "center",
} as const;

/** Sticky header cell above the sticky project column. */
const HEAD_LABEL_SX = {
  ...ROW_LABEL_SX,
  zIndex: 3,
  fontWeight: 700,
  bgcolor: "background.paper",
} as const;

const HEADER_CELL_SX = {
  fontWeight: 700,
  whiteSpace: "nowrap",
  bgcolor: "background.paper",
  textAlign: "center",
} as const;

/** Compact detail-row cells: one shared style object instead of 30+ per row. */
const DETAIL_LABEL_SX = {
  ...ROW_LABEL_SX,
  pl: 4,
  fontWeight: 400,
  color: "text.secondary",
} as const;

const DETAIL_WINDOW_SX = {
  whiteSpace: "nowrap",
  color: "text.secondary",
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
} as const;

const DETAIL_CELL_SX = {
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
  color: "text.secondary",
} as const;

const DETAIL_ROW_SX = { bgcolor: "action.hover" } as const;

function EmptyHint({ title, detail }: { title: string; detail?: string }) {
  return (
    <Box
      sx={{
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: 2,
        color: "text.secondary",
        px: 2,
        textAlign: "center",
      }}
    >
      <Typography variant="body2">{title}</Typography>
      {detail && (
        <Typography variant="caption" color="text.disabled">
          {detail}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Expanded detail rows for one project.  Memoized so table-level re-renders
 * (height / chart-fold state changes) do not re-render hundreds of cells.
 */
const ProjectCompareDetailRows = memo(function ProjectCompareDetailRows({
  topic,
  section,
  rows,
  grain,
  metricDefs,
  channel,
}: {
  topic: AnalysisTopic;
  section: ProjectCompareSection;
  rows: ProjectCompareSectionRows;
  grain: ProjectCompareGrain;
  metricDefs: AnalysisMetric[];
  /** Vendor the parent row is scoped to; the cell keeps the columns aligned. */
  channel?: string | null;
}) {
  const detailRows = projectCompareBucketRows(
    topic,
    section,
    rows,
    grain,
    metricDefs,
  );
  return (
    <>
      {detailRows.map((detail) => (
        <TableRow key={detail.index} sx={DETAIL_ROW_SX}>
          <TableCell sx={DETAIL_LABEL_SX}>{detail.label}</TableCell>
          {channel !== undefined && (
            <TableCell sx={DETAIL_WINDOW_SX}>{channel ?? ""}</TableCell>
          )}
          <TableCell sx={DETAIL_WINDOW_SX}>{detail.windowLabel}</TableCell>
          {metricDefs.map((metric) => (
            <TableCell key={metric.key} align="center" sx={DETAIL_CELL_SX}>
              {formatMetricValue(metric, detail.totals[metric.key])}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
});

/** One comparison table for one anchor round. */
function ProjectCompareAnchorTable({
  topic,
  anchor,
  rows,
  metricDefs,
  periodDays,
  grain,
  expandedKeys,
  onToggleRow,
  onToggleAll,
  fillViewport,
  chartFolded,
  getChartHeight,
  showExternalChip,
  loading,
}: {
  topic: AnalysisTopic;
  anchor: AnchorKey;
  rows: ProjectCompareTableRow[];
  metricDefs: AnalysisMetric[];
  periodDays: number;
  grain: ProjectCompareGrain;
  expandedKeys: ReadonlySet<string>;
  onToggleRow: (key: string) => void;
  onToggleAll: (keys: string[], expand: boolean) => void;
  /** While the chart is folded the table grows to fill the remaining viewport. */
  fillViewport: boolean;
  /** Chart fold state and its current rendered height, used to predict the
   * post-fold table position without waiting for the fold transition. */
  chartFolded: boolean;
  getChartHeight: () => number;
  showExternalChip: boolean;
  loading: boolean;
}) {
  const theme = useTheme();
  const hasData = hasProjectCompareTableData(rows);
  // Vendor-scoped tables carry one row per project × 渠道商; the extra column
  // and the per-vendor row keys only exist in that mode.
  const splitByChannel = useMemo(
    () => rows.some((item) => item.channel !== null),
    [rows],
  );
  const projectCount = useMemo(
    () => new Set(rows.map((item) => projectKey(item.section.project))).size,
    [rows],
  );
  const channelCount = useMemo(
    () =>
      new Set(
        rows
          .map((item) => item.channel)
          .filter((channel): channel is string => channel !== null),
      ).size,
    [rows],
  );
  const bestValues = useMemo(
    () =>
      bestProjectCompareValues(
        rows.map((item) => item.totals),
        metricDefs,
      ),
    [metricDefs, rows],
  );
  // Per-row expansion of the window's time buckets (day/week/month, the same
  // grain as the chart above the table).  The state lives in the parent so the
  // chart can give up vertical space while detail rows are open.
  const expandableKeys = useMemo(
    () => rows.filter((item) => item.rows.length > 0).map((item) => item.key),
    [rows],
  );
  const allExpanded =
    expandableKeys.length > 0 &&
    expandableKeys.every((key) => expandedKeys.has(key));
  const toggleAll = () => onToggleAll(expandableKeys, !allExpanded);

  // The table is wider than the viewport (23 metric columns).  Its own
  // horizontal scrollbar sits at the bottom of the 480px-tall scroll area, which
  // can fall below the fold, so a sticky scrollbar proxy is pinned to the
  // bottom of the viewport and kept in sync with the table's scrollLeft.
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const scrollProxyRef = useRef<HTMLDivElement | null>(null);
  const [overflowWidth, setOverflowWidth] = useState(0);
  const getTableContainer = () =>
    sectionRef.current?.querySelector<HTMLDivElement>(
      ".MuiTableContainer-root",
    ) ?? null;

  useEffect(() => {
    // The table appears only once rows carry data, so measure then (a plain
    // mount effect would run while the container is still absent).
    if (!hasData) {
      setOverflowWidth(0);
      return undefined;
    }
    const container = getTableContainer();
    if (!container) return undefined;
    const update = () => {
      const overflow =
        container.scrollWidth > container.clientWidth + 1
          ? container.scrollWidth
          : 0;
      setOverflowWidth(overflow);
    };
    update();
    // jsdom (unit tests) has no ResizeObserver: the one-shot measure above is
    // enough there, the browser path keeps tracking width changes.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (observer) {
      observer.observe(container);
      const table = container.querySelector("table");
      if (table) observer.observe(table);
    }
    return () => observer?.disconnect();
  }, [hasData, metricDefs.length]);

  // Folded chart → let the table use the rest of the viewport instead of
  // leaving blank space below the fixed 480px scroll area.
  const [tableMaxHeight, setTableMaxHeight] = useState<number | null>(null);
  const getChartHeightRef = useRef(getChartHeight);
  getChartHeightRef.current = getChartHeight;
  useEffect(() => {
    if (!fillViewport || !hasData) {
      setTableMaxHeight(null);
      return undefined;
    }
    const update = () => {
      const node = sectionRef.current;
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      // Predict the settled table position from the chart's *current* height:
      // a folding chart still moves the table up by that height, an unfolding
      // one moves it down by the remaining part.
      const chartHeightNow = getChartHeightRef.current();
      const finalTop = chartFolded
        ? top - chartHeightNow
        : top + Math.max(0, CHART_HEIGHT - chartHeightNow);
      // Leave a small bottom margin so the card never overflows the viewport.
      setTableMaxHeight(Math.max(320, window.innerHeight - finalTop - 40));
    };
    // Compute the target immediately (predicting the folded chart) so the table
    // grows together with the fold animation instead of after it. The page may
    // scroll a few pixels while the layout settles, so follow scroll for the
    // duration of the transition and then stop (avoids resizing on user scroll).
    update();
    const raf = window.requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    const settle = window.setTimeout(update, 240);
    const stopScroll = window.setTimeout(() => {
      window.removeEventListener("scroll", update);
    }, 450);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.clearTimeout(stopScroll);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [fillViewport, hasData, rows.length, chartFolded]);

  const syncScrollFromTable = () => {
    const container = getTableContainer();
    const proxy = scrollProxyRef.current;
    if (container && proxy && proxy.scrollLeft !== container.scrollLeft) {
      proxy.scrollLeft = container.scrollLeft;
    }
  };
  const syncScrollFromProxy = () => {
    const container = getTableContainer();
    const proxy = scrollProxyRef.current;
    if (container && proxy && container.scrollLeft !== proxy.scrollLeft) {
      container.scrollLeft = proxy.scrollLeft;
    }
  };

  return (
    <Box ref={sectionRef} sx={{ mb: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          gap: 1,
          flexWrap: "wrap",
          mb: 0.75,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {ANCHOR_LABELS[anchor]} · 锚点后 {periodDays} 天
        </Typography>
        {showExternalChip && (
          <Chip
            size="small"
            variant="outlined"
            color="primary"
            label="外对比"
            sx={{
              height: 20,
              "& .MuiChip-label": { px: 0.75, fontSize: "0.6875rem" },
            }}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          {projectCount} 个项目
          {splitByChannel && channelCount > 0
            ? ` · ${channelCount} 个渠道商`
            : ""}
          {" · 横向滚动查看更多指标"}
        </Typography>
        {hasData && (
          <Button
            size="small"
            variant="text"
            onClick={toggleAll}
            startIcon={
              allExpanded ? (
                <ExpandLessIcon sx={{ fontSize: 15 }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 15 }} />
              )
            }
            sx={{ textTransform: "none", ml: "auto", flexShrink: 0 }}
          >
            {allExpanded ? "收起明细" : "展开明细"}
          </Button>
        )}
      </Box>
      {!hasData ? (
        loading ? null : (
          <EmptyHint
            title="所选窗口未找到数据"
            detail="窗口合计由查询返回的日粒度行聚合；无行时所有指标显示为「–」。"
          />
        )
      ) : (
        <TableContainer
          component={Paper}
          variant="outlined"
          onScroll={syncScrollFromTable}
          sx={{
            // While the chart is folded the table card grows to the remaining
            // viewport height even if the rows are shorter (blank area stays
            // inside the card instead of below it).
            height: tableMaxHeight ?? "auto",
            maxHeight: tableMaxHeight ?? 480,
            borderRadius: 2,
            transition: "height 160ms ease, max-height 160ms ease",
            // The sticky proxy below owns the horizontal scrollbar.
            "&::-webkit-scrollbar:horizontal": { height: 0 },
          }}
        >
          <Table
            stickyHeader
            size="small"
            aria-label={`${ANCHOR_LABELS[anchor]}基准项目对比表`}
            sx={{
              minWidth: splitByChannel ? 1180 : 1120,
              // Compact mode: tighter rows so more projects/metrics fit on
              // screen while keeping tabular numbers readable.
              "& .MuiTableCell-root": {
                py: 0.25,
                px: 0.75,
                fontSize: "0.75rem",
                lineHeight: 1.6,
              },
              "& .MuiTableCell-head": {
                py: 0.5,
                fontSize: "0.75rem",
                whiteSpace: "nowrap",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={HEAD_LABEL_SX}>项目</TableCell>
                {splitByChannel && (
                  <TableCell sx={HEADER_CELL_SX}>渠道商</TableCell>
                )}
                <TableCell sx={HEADER_CELL_SX}>窗口</TableCell>
                {metricDefs.map((metric) => (
                  <TableCell
                    key={metric.key}
                    align="center"
                    sx={HEADER_CELL_SX}
                  >
                    {metric.description ? (
                      <Tooltip title={metric.description}>
                        <Box component="span" sx={{ cursor: "help" }}>
                          {metric.label}
                        </Box>
                      </Tooltip>
                    ) : (
                      metric.label
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(
                ({ key, channel, section, totals, rows: sectionRows }) => {
                  const isExpanded = expandedKeys.has(key);
                  const rowLabel = channel
                    ? `${section.project.papp_name}·${channel}`
                    : section.project.papp_name;
                  return (
                    <Fragment key={key}>
                      <TableRow hover>
                        <TableCell
                          sx={ROW_LABEL_SX}
                          title={section.project.papp_name}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 0.25,
                            }}
                          >
                            <IconButton
                              size="small"
                              aria-label={
                                isExpanded
                                  ? `收起${rowLabel}明细`
                                  : `展开${rowLabel}明细`
                              }
                              onClick={() => onToggleRow(key)}
                              sx={{ p: 0.25, ml: -0.5 }}
                            >
                              {isExpanded ? (
                                <ExpandLessIcon sx={{ fontSize: 16 }} />
                              ) : (
                                <ExpandMoreIcon sx={{ fontSize: 16 }} />
                              )}
                            </IconButton>
                            {section.project.papp_name}
                          </Box>
                        </TableCell>
                        {splitByChannel && (
                          <TableCell
                            sx={{
                              whiteSpace: "nowrap",
                              color: "text.secondary",
                              textAlign: "center",
                            }}
                          >
                            {channel ?? "–"}
                          </TableCell>
                        )}
                        <TableCell
                          sx={{
                            whiteSpace: "nowrap",
                            color: "text.secondary",
                            fontVariantNumeric: "tabular-nums",
                            textAlign: "center",
                          }}
                        >
                          {section.windowLabel}
                        </TableCell>
                        {metricDefs.map((metric) => {
                          const value = totals[metric.key] ?? null;
                          const best = bestValues[metric.key];
                          const isBest =
                            value !== null && best !== null && value === best;
                          return (
                            <TableCell
                              key={metric.key}
                              align="center"
                              data-best={isBest ? "true" : undefined}
                              sx={{
                                whiteSpace: "nowrap",
                                fontVariantNumeric: "tabular-nums",
                                ...(isBest
                                  ? {
                                      fontWeight: 700,
                                      color: "primary.main",
                                      bgcolor: alpha(
                                        theme.palette.primary.main,
                                        0.08,
                                      ),
                                    }
                                  : {}),
                              }}
                            >
                              {formatMetricValue(metric, value)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      {isExpanded && (
                        <ProjectCompareDetailRows
                          topic={topic}
                          section={section}
                          rows={sectionRows}
                          grain={grain}
                          metricDefs={metricDefs}
                          channel={splitByChannel ? channel : undefined}
                        />
                      )}
                    </Fragment>
                  );
                },
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {hasData && overflowWidth > 0 && (
        <Box
          ref={scrollProxyRef}
          data-testid="project-compare-sticky-scrollbar"
          role="presentation"
          onScroll={syncScrollFromProxy}
          sx={{
            // Sticks to the bottom of the viewport while this table is on
            // screen, so the wide table can always be scrolled horizontally.
            position: "sticky",
            bottom: 0,
            zIndex: 4,
            mt: 0.5,
            height: 12,
            overflowX: "auto",
            overflowY: "hidden",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            "&::-webkit-scrollbar": { height: 8 },
          }}
        >
          <Box sx={{ width: overflowWidth, height: 1 }} />
        </Box>
      )}
    </Box>
  );
}

export default function ProjectCompare({
  topic,
  filters,
}: {
  topic: AnalysisTopic;
  filters: AnalysisFilters;
}) {
  const theme = useTheme();
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Project metadata is shared with the filter bar's project picker, so both
  // controls read one cached load instead of fetching it twice.
  const {
    options: games,
    startMaps,
    loading: metadataLoading,
    error: metadataError,
    reload: reloadMetadata,
  } = useProjectCompareOptions();

  // Anchor rounds, the observation window, the project selection and the chart
  // metric are all page-level filters (rendered in the top filter bar and
  // persisted in the URL), so the view derives everything from them.  The memo
  // keeps the anchors array identity stable: the query plan is keyed on it.
  const selectedAnchors = useMemo(
    () => normalizeAnchors(filters.anchors),
    [filters.anchors],
  );
  const periodDays = filters.periodDays;
  const metricKey = filters.compareMetric ?? PROJECT_COMPARE_METRIC_KEYS[0];
  // Expanded detail rows are tracked at page level: while any table has open
  // detail rows the chart yields vertical space to the table.
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const toggleExpandedRow = useCallback((key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const toggleExpandedAll = useCallback((keys: string[], expand: boolean) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (expand) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  const [grain, setGrain] = useState<ProjectCompareGrain>(
    DEFAULT_PROJECT_COMPARE_GRAIN,
  );

  const [rowsByKey, setRowsByKey] = useState<
    Record<string, ProjectCompareSectionRows>
  >({});
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryToken, setQueryToken] = useState(0);
  // Scope of the most recently settled batch; lets the view show progress from
  // the first frame of a new selection instead of flashing an empty state.
  const [completedQueryKey, setCompletedQueryKey] = useState<string | null>(
    null,
  );

  // The comparison starts empty: the user chooses 基准 and 项目 in the filter
  // bar, and nothing is compared (or queried) until both are set.
  const selectedKeys = filters.projects;
  const selectedProjects = useMemo(() => {
    const byKey = new Map(games.map((game) => [projectKey(game), game]));
    return selectedKeys
      .map((key) => byKey.get(key))
      .filter((game): game is ProjectOption => game !== undefined);
  }, [games, selectedKeys]);

  const plan = useMemo(
    () =>
      planProjectCompareSections(
        selectedProjects,
        selectedAnchors,
        startMaps,
        periodDays,
      ),
    [periodDays, selectedAnchors, selectedProjects, startMaps],
  );

  const metricDefs = useMemo(() => projectCompareMetricDefs(topic), [topic]);
  const activeMetric = useMemo(
    () => topicMetric(topic, metricKey),
    [metricKey, topic],
  );
  const spendKey = useMemo(() => topicMetric(topic, "spend").key, [topic]);

  // Rows are keyed by the window they describe; when the selection or filters
  // change, stale rows stop matching and disappear instead of being shown
  // against the wrong window.
  const pageFilterKey = JSON.stringify([
    filters.regions,
    filters.media,
    filters.channels,
    filters.platforms,
  ]);
  const rowKeyForSection = useCallback(
    (section: ProjectCompareSection) =>
      `${section.key}|${section.start}|${section.end}|${pageFilterKey}`,
    [pageFilterKey],
  );

  const queries = useMemo(
    () => buildProjectCompareQueries(topic, filters, plan.sections),
    [filters, plan.sections, topic],
  );
  const queryKey = useMemo(
    () =>
      `${pageFilterKey}|${plan.sections
        .map((section) => `${section.key}|${section.start}|${section.end}`)
        .join("||")}`,
    [pageFilterKey, plan.sections],
  );

  const hasExpandedDetails = expandedKeys.size > 0;
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const measureChartHeight = useCallback(
    () => chartWrapRef.current?.getBoundingClientRect().height ?? 0,
    [],
  );
  // Expanding detail rows folds the chart away so the table gets the vertical
  // space; collapsing the details brings it back. The header toggle overrides
  // this for the current state.
  const [chartFolded, setChartFolded] = useState(false);

  useEffect(() => {
    setChartFolded(hasExpandedDetails);
  }, [hasExpandedDetails]);

  useEffect(() => {
    // New projects/anchors/window: the previous expansion keys are stale.
    setExpandedKeys(new Set());
  }, [queryKey]);

  useEffect(() => {
    if (queries.length === 0) {
      setQueryLoading(false);
      setQueryError(null);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setQueryLoading(true);
    setQueryError(null);
    const timer = window.setTimeout(() => {
      postAnalysisChartData(
        {
          topic: topic.id,
          queries,
          result_type: "full",
          result_format: "json",
          force: false,
        },
        { signal: controller.signal },
      )
        .then((response) => {
          if (!active || controller.signal.aborted) return;
          const parsed = parseProjectCompareResults(response, queries.length);
          const next: Record<string, ProjectCompareSectionRows> = {};
          plan.sections.forEach((section, index) => {
            next[rowKeyForSection(section)] = parsed[index] ?? [];
          });
          setRowsByKey(next);
        })
        .catch((error: unknown) => {
          if (!active || controller.signal.aborted || isAbortError(error)) {
            return;
          }
          setQueryError(parseErrorMessage(error, "项目对比数据加载失败"));
        })
        .finally(() => {
          if (!active) return;
          setQueryLoading(false);
          setCompletedQueryKey(queryKey);
        });
    }, PROJECT_COMPARE_QUERY_DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    pageFilterKey,
    plan.sections,
    queries,
    queryKey,
    queryToken,
    rowKeyForSection,
    topic.id,
  ]);

  const sectionResults = useMemo<ProjectCompareSectionRows[]>(
    () =>
      plan.sections.map(
        (section) => rowsByKey[rowKeyForSection(section)] ?? [],
      ),
    [plan.sections, rowKeyForSection, rowsByKey],
  );

  const awaitingFirstRows =
    plan.sections.length > 0 && completedQueryKey !== queryKey;
  const comparisonLoading = queryLoading || awaitingFirstRows;

  const tableRowsByAnchor = useMemo(() => {
    const map = new Map<AnchorKey, ProjectCompareTableRow[]>();
    for (const anchor of selectedAnchors) {
      map.set(
        anchor,
        projectCompareRowsForAnchor(
          topic,
          plan.sections,
          sectionResults,
          anchor,
          spendKey,
          metricDefs,
        ),
      );
    }
    return map;
  }, [
    metricDefs,
    plan.sections,
    sectionResults,
    selectedAnchors,
    spendKey,
    topic,
  ]);

  const chartModel = useMemo(
    () =>
      buildProjectCompareChartModel(
        topic,
        plan.sections,
        sectionResults,
        activeMetric,
        grain,
      ),
    [activeMetric, grain, plan.sections, sectionResults, topic],
  );
  const showChart = hasProjectCompareChartData(chartModel);

  const chartColors = useMemo<string[]>(() => {
    const palette = theme.palette.chart;
    if (palette && palette.length > 0) return [...palette];
    return [
      theme.palette.primary.main,
      theme.palette.warning.main,
      theme.palette.success.main,
      theme.palette.info.main,
      theme.palette.secondary.main,
    ];
  }, [theme]);

  const projectColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    selectedProjects.forEach((project, index) =>
      map.set(projectKey(project), index),
    );
    return map;
  }, [selectedProjects]);

  const chartOption = useMemo<EChartsOption>(() => {
    const series = chartModel.series.map((item) => {
      const colorIndex = projectColorIndex.get(item.projectKey) ?? 0;
      const color = chartColors[colorIndex % chartColors.length];
      const anchorIndex = Math.max(0, selectedAnchors.indexOf(item.anchor));
      return {
        name: item.name,
        type: "line" as const,
        data: item.values,
        connectNulls: false,
        showSymbol: chartModel.categories.length <= 40,
        symbol: "circle",
        symbolSize: 4,
        lineStyle: {
          width: 1.8,
          type: LINE_TYPES[Math.min(anchorIndex, LINE_TYPES.length - 1)],
          color,
        },
        itemStyle: { color },
        emphasis: { focus: "series" as const },
      };
    });
    return {
      color: chartColors,
      tooltip: {
        trigger: "axis",
        appendToBody: true,
        formatter: (params: unknown) => {
          const items = (Array.isArray(params) ? params : [params]) as {
            dataIndex?: number;
            seriesName?: string;
            value?: unknown;
          }[];
          if (items.length === 0) return "";
          const index = items[0]?.dataIndex ?? 0;
          const lines = [chartModel.categories[index] ?? ""];
          for (const item of items) {
            lines.push(
              `${item.seriesName ?? ""}: ${formatMetricValue(
                activeMetric,
                item.value,
              )}`,
            );
          }
          return lines.join("<br/>");
        },
      },
      legend: {
        type: "scroll",
        top: 0,
        itemWidth: 12,
        itemHeight: 8,
        textStyle: {
          fontSize: 11,
          color: theme.palette.text.secondary,
        },
      },
      grid: {
        left: 8,
        right: 18,
        top: 44,
        bottom: 26,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: chartModel.categories,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: theme.palette.divider } },
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          hideOverlap: true,
        },
      },
      yAxis: {
        type: "value",
        name: activeMetric.label,
        nameLocation: "end",
        nameGap: 10,
        nameTextStyle: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          align: "left",
        },
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: 11,
          formatter: (value: number) => formatAxisValue(activeMetric, value),
        },
        splitLine: { lineStyle: { color: theme.palette.divider } },
        axisLine: { lineStyle: { color: theme.palette.divider } },
      },
      series,
    };
  }, [
    activeMetric,
    chartColors,
    chartModel,
    projectColorIndex,
    selectedAnchors,
    theme.palette.divider,
    theme.palette.text.secondary,
  ]);

  const queryProjectCount = useMemo(
    () =>
      new Set(plan.sections.map((section) => projectKey(section.project))).size,
    [plan.sections],
  );

  const grainLabel =
    PROJECT_COMPARE_GRAINS.find((option) => option.key === grain)?.label ??
    "日";

  // Nothing is compared until the filter bar provides both a 基准 and at
  // least one 项目; each missing piece gets its own prompt.
  const missingAnchor = selectedAnchors.length === 0;
  const missingProjects = selectedProjects.length === 0;
  const showSelectionHint =
    !metadataLoading && !metadataError && (missingAnchor || missingProjects);
  const selectionHintTitle = missingAnchor
    ? "请选择基准"
    : "请选择要对比的项目";
  const selectionHintDetail = missingAnchor
    ? "在顶部筛选条「基准」中选择上线 / 首测 / 二测 / 三测（可多选）后开始对比。"
    : games.length === 0
      ? "未找到配置了上线/测试起始日期的项目，请先在分成配置中维护起始时间。"
      : "在顶部筛选条「项目」中选择要对比的项目（可多选）。";

  return (
    <Box>
      {metadataLoading && <LinearProgress sx={{ mb: 1 }} />}

      {metadataError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={reloadMetadata}>
              重试
            </Button>
          }
          sx={{ mb: 1.5 }}
        >
          {metadataError}
        </Alert>
      )}

      {comparisonLoading && (
        <Box sx={{ mb: 1.5 }}>
          <LinearProgress />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.5 }}
          >
            正在查询 {queryProjectCount} 个项目 × {selectedAnchors.length}{" "}
            个基准…
          </Typography>
        </Box>
      )}

      {queryError && !comparisonLoading && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setQueryToken((value) => value + 1)}
            >
              重试
            </Button>
          }
          sx={{ mb: 1.5 }}
        >
          {queryError}
        </Alert>
      )}

      {showSelectionHint && (
        <EmptyHint title={selectionHintTitle} detail={selectionHintDetail} />
      )}

      {!showSelectionHint && plan.skipped.length > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {plan.skipped.map((item) => item.label).join("；")}
        </Alert>
      )}

      {!showSelectionHint && showChart && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
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
                项目对比趋势
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {activeMetric.label} · 锚点后按{grainLabel}对齐
              </Typography>
              <Tooltip title={GRAIN_HINT}>
                <InfoOutlinedIcon
                  sx={{
                    fontSize: 15,
                    color: "text.disabled",
                    cursor: "help",
                  }}
                />
              </Tooltip>
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                ml: "auto",
              }}
            >
              <Tooltip title={chartFolded ? "展开图表" : "折叠图表"}>
                <IconButton
                  size="small"
                  aria-label={chartFolded ? "展开图表" : "折叠图表"}
                  onClick={() => setChartFolded((folded) => !folded)}
                  sx={{ mr: 0.25 }}
                >
                  {chartFolded ? (
                    <ExpandMoreIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <ExpandLessIcon sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </Tooltip>
              <Tooltip title="重新查询对比数据">
                <Button
                  size="small"
                  variant="text"
                  startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                  onClick={() => setQueryToken((value) => value + 1)}
                  sx={{ textTransform: "none", mr: 0.5 }}
                >
                  重新查询
                </Button>
              </Tooltip>
              {PROJECT_COMPARE_GRAINS.map((option) => {
                const active = grain === option.key;
                return (
                  <Chip
                    key={option.key}
                    size="small"
                    label={option.label}
                    variant={active ? "filled" : "outlined"}
                    color={active ? "primary" : "default"}
                    onClick={() => setGrain(option.key)}
                    sx={{ cursor: "pointer", minWidth: 28 }}
                  />
                );
              })}
            </Box>
          </Box>
          <Box
            ref={chartWrapRef}
            data-testid="project-compare-chart-wrap"
            data-folded={chartFolded ? "true" : "false"}
            aria-hidden={chartFolded ? "true" : undefined}
            sx={{
              maxHeight: chartFolded ? 0 : CHART_HEIGHT,
              opacity: chartFolded ? 0 : 1,
              overflow: "hidden",
              // Subtle fold/unfold: short, linear-ish easing, no bounce.
              transition: "max-height 200ms ease, opacity 160ms ease",
            }}
          >
            <EChart
              option={chartOption}
              height={CHART_HEIGHT}
              ariaLabel={`${activeMetric.label}项目对比趋势图`}
            />
          </Box>
        </Paper>
      )}

      {!showSelectionHint &&
        selectedAnchors.map((anchor) => {
          const rows = tableRowsByAnchor.get(anchor) ?? [];
          if (rows.length === 0) return null;
          return (
            <ProjectCompareAnchorTable
              key={anchor}
              topic={topic}
              anchor={anchor}
              rows={rows}
              metricDefs={metricDefs}
              periodDays={periodDays}
              grain={grain}
              expandedKeys={expandedKeys}
              onToggleRow={toggleExpandedRow}
              onToggleAll={toggleExpandedAll}
              fillViewport={hasExpandedDetails}
              chartFolded={chartFolded}
              getChartHeight={measureChartHeight}
              showExternalChip={selectedAnchors.length > 1}
              loading={comparisonLoading || Boolean(queryError)}
            />
          );
        })}

      {!showSelectionHint &&
        !queryLoading &&
        selectedProjects.length > 0 &&
        plan.sections.length === 0 && (
          <EmptyHint title="所选项目与基准下均无可用起始日期" />
        )}
    </Box>
  );
}
