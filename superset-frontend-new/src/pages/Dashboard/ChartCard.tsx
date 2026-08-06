import {
  memo,
  useRef,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import ContentCopy from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import FlipIcon from "@mui/icons-material/Flip";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenOutlined from "@mui/icons-material/FullscreenOutlined";
import LeaderboardOutlined from "@mui/icons-material/LeaderboardOutlined";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import { keyframes } from "@emotion/react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { buildEChartsOption, getECharts } from "@/utils/echarts";

const barBounce = keyframes`
  0%, 100% { transform: scaleY(0.25); }
  50% { transform: scaleY(1); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const loadingBarColors = [
  "primary.main",
  "warning.main",
  "info.main",
  "success.main",
  "error.main",
];

function ChartLoadingSkeleton() {
  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        flex: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 0.75,
          height: 80,
        }}
      >
        {loadingBarColors.map((color, i) => (
          <Box
            key={i}
            sx={{
              width: 20,
              height: `${[60, 85, 40, 70, 50][i]}%`,
              borderRadius: 0.75,
              bgcolor: color,
              opacity: 0.4,
              transformOrigin: "bottom",
              animation: `${barBounce} ${0.6 + i * 0.15}s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </Box>
      <Typography variant="caption" color="text.disabled">
        加载中...
      </Typography>
    </Box>
  );
}
import DataPreviewTable from "@/components/DataPreviewTable";
import type { CellFormatter } from "@/components/DataPreviewTable";
import { useEChartsType } from "@/hooks/useEChartsType";
import MirrorTable from "@/pages/Dashboard/MirrorTable";
import {
  formatMetricValue,
  formatPercentage,
  type MetricFormatMap,
} from "@/utils/formatNumber";
import { formatDateValue } from "@/utils/dateHeuristics";
import { useNotificationStore } from "@/store/notificationStore";
import { useFullscreenStore } from "@/store/fullscreenStore";
import type { ChartDataPayload, ChartDataRow, ChartData } from "@/types/api";
import PivotTable, { type PivotTableProps } from "@/components/PivotTable";
import type { WideMetricComponent } from "@/utils/pivot";
import { DEFAULT_PIVOT_CONFIG } from "@/pages/ChartCreation/useChartEditor";

export interface CompareDimension {
  dimension: string;
  values: string[];
}

export interface CompareConfig {
  enabled: boolean;
  chartId: number;
  dimensions: CompareDimension[];
}

const LONG_PRESS_MS = 500;

interface ChartCardProps {
  chartId: number;
  sliceName?: string;
  vizType: string;
  data?: ChartDataPayload;
  loading?: boolean;
  meta?: ChartData | { slice_name?: string };
  containerWidth: number;
  onRefresh: (chartId: number) => void;
  onEdit: (chartId: number) => void;
  onDelete: (chartId: number) => void;
  onInsight?: (chartId: number) => void;
  compareConfig?: CompareConfig | null;
  mirrorData?: ChartDataPayload;
  onToggleCompare: (chartId: number) => void;
  onOpenCompareBigScreen?: (
    chartId: number,
    chartData?: ChartDataPayload,
  ) => void;
  totalRow?: ChartDataRow | null;
  pivotTotalRows?: ChartDataRow[];
  pivotSubtotalRows?: ChartDataRow[][];
  intervalSeconds?: number;
  onCycleInterval?: () => void;
  metricFormatMap?: MetricFormatMap;
  page?: number;
  hasMore?: boolean;
  onPageChange?: (page: number) => void;
  sizeSelector?: ReactNode;
  cardSize?: "small" | "medium" | "full";
}

function pctSplitIndex(
  sorted: ChartDataRow[],
  col: string,
  pct: number,
): number {
  const total = sorted.reduce((s, r) => s + Number(r[col]), 0);
  if (total === 0) return sorted.length;
  const threshold = total * pct;
  let cum = 0;
  for (let i = 0; i < sorted.length; i++) {
    cum += Number(sorted[i][col]);
    if (cum >= threshold) return i + 1;
  }
  return sorted.length;
}

function ChartCard({
  chartId,
  sliceName,
  vizType,
  data,
  loading: chartLoading,
  meta,
  containerWidth,
  onRefresh,
  onEdit,
  onDelete,
  onInsight,
  compareConfig,
  mirrorData,
  onToggleCompare,
  onOpenCompareBigScreen,
  totalRow,
  pivotTotalRows,
  pivotSubtotalRows,
  intervalSeconds,
  onCycleInterval,
  metricFormatMap,
  page = 0,
  hasMore,
  onPageChange,
  sizeSelector,
  cardSize,
}: ChartCardProps) {
  const theme = useTheme();
  const storageKey = `pct95_threshold_${chartId}`;
  const [pct95Threshold, setPct95Threshold] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    const val = saved !== null ? Number(saved) : 0.95;
    return val === 0 || val === 0.95 || val === 0.99 ? val : 0.95;
  });
  const pct95Active = pct95Threshold > 0;
  useEffect(() => {
    localStorage.setItem(storageKey, String(pct95Threshold));
  }, [pct95Threshold, storageKey]);
  // Refresh only when the user toggles p95 on, not on initial mount: the
  // initial chart/data fetch already covers the full distribution, and the
  // p95 split is computed client-side, so a mount-time refetch just doubles
  // the backend query cost.
  const prevPct95Ref = useRef(pct95Active);
  useEffect(() => {
    if (pct95Active && !prevPct95Ref.current) {
      onRefresh(chartId);
    }
    prevPct95Ref.current = pct95Active;
  }, [pct95Active, chartId, onRefresh]);
  const chartLibReady = useEChartsType(vizType);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const chartRef = useRef<any>(null);

  const [localCountdown, setLocalCountdown] = useState<number | undefined>(
    undefined,
  );
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!intervalSeconds || intervalSeconds <= 0) {
      setLocalCountdown(undefined);
      return;
    }
    const shiftSec = (chartId * 7) % Math.min(30, intervalSeconds);
    const staggerReset = (chartId * 7) % 10;
    setLocalCountdown(intervalSeconds - shiftSec);
    const tickMs = 1000 + ((chartId * 13) % 100);
    const id = setInterval(() => {
      setLocalCountdown((prev) => {
        if (prev === undefined || prev <= 1) {
          onRefreshRef.current(chartId);
          return intervalSeconds + staggerReset;
        }
        return prev - 1;
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [intervalSeconds, chartId]);
  const cardRef = useRef<HTMLDivElement>(null);
  const notify = useNotificationStore((s) => s.notify);
  const fullscreen = useFullscreenStore();
  const setForceLandscape = useFullscreenStore((st) => st.setForceLandscape);
  const isActiveFullscreen = fullscreen.activeChartId === chartId;

  const getTextContent = (source: ChartDataPayload | undefined) => {
    const raw = source || data;
    const colnames = raw?.colnames ?? [];
    const rows = Array.isArray(raw?.data) ? raw.data : [];
    if (colnames.length === 0) return null;
    const header = colnames.join("\t");
    const body = rows
      .map((r) => colnames.map((c) => String(r[c] ?? "")).join("\t"))
      .join("\n");
    return `${header}\n${body}`;
  };

  const writeTextClipboard = async (text: string) => {
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const tryImageCopy = async (): Promise<boolean> => {
    if (typeof ClipboardItem === "undefined") return false;
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return false;
    try {
      const dataUrl = instance.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#fff",
      });
      const blob = await fetch(dataUrl).then((r) => r.blob());
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  };

  const copyData = async () => {
    try {
      if (vizType !== "table" && (await tryImageCopy())) {
        notify({ severity: "success", message: "已复制到剪贴板" });
        return;
      }
      const text = getTextContent(processedData);
      if (!text) {
        notify({ severity: "warning", message: "暂无数据可复制" });
        return;
      }
      await writeTextClipboard(text);
      notify({ severity: "success", message: "已复制到剪贴板" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  const tableFormatCell: CellFormatter | undefined = useMemo(() => {
    if (!data) return undefined;
    const colnames = data.colnames;
    const coltypes = data.coltypes;
    if (!colnames || !coltypes) return undefined;
    const dateCols = new Set(colnames.filter((_, i) => coltypes[i] === 2));
    return (key: string, value: unknown) => {
      if (value === null || value === undefined) return "";
      if (dateCols.has(key)) {
        const formatted = formatDateValue(value);
        if (formatted !== null) return formatted;
      }
      return formatMetricValue(key, value, metricFormatMap);
    };
  }, [data, metricFormatMap]);

  const { sortMetricCol, dimCols } = useMemo(() => {
    if (!data) return { sortMetricCol: "", dimCols: [] as string[] };
    const colnames = data.colnames;
    const coltypes = data.coltypes;
    if (!colnames || !coltypes)
      return { sortMetricCol: "", dimCols: [] as string[] };
    const smCol =
      colnames.find((_, i) => i > 0 && coltypes[i] === 0) || colnames[1] || "";
    const smIdx = colnames.indexOf(smCol);
    const dCols = smIdx > 0 ? colnames.slice(0, smIdx) : [];
    return { sortMetricCol: smCol, dimCols: dCols };
  }, [data]);

  const rows = useMemo(
    () => (Array.isArray(data?.data) ? data.data : []),
    [data?.data],
  );

  const sorted = useMemo(
    () =>
      pct95Active && sortMetricCol
        ? [...rows].sort(
            (a, b) => Number(b[sortMetricCol]) - Number(a[sortMetricCol]),
          )
        : rows,
    [rows, pct95Active, sortMetricCol],
  );

  const splitIdx = useMemo(
    () =>
      pct95Active && sortMetricCol
        ? pctSplitIndex(sorted, sortMetricCol, pct95Threshold)
        : rows.length,
    [sorted, pct95Active, sortMetricCol, pct95Threshold, rows.length],
  );

  const processedData = useMemo(() => {
    if (!data) return data;

    let resultRows: ChartDataRow[];
    let hasMods = false;

    if (
      pct95Active &&
      sortMetricCol &&
      splitIdx < rows.length &&
      vizType !== "pivot_table_v2"
    ) {
      resultRows = sorted.slice(0, splitIdx);
      hasMods = true;
    } else {
      resultRows = [...rows];
    }

    if (totalRow && dimCols.length > 0 && vizType === "table") {
      resultRows = [
        ...resultRows,
        {
          ...totalRow,
          [dimCols[0]]: "合计",
          __isSummary: true,
        } as ChartDataRow,
      ];
      hasMods = true;
    }

    if (!hasMods) return data;
    return { ...data, data: resultRows };
  }, [
    data,
    rows,
    sorted,
    pct95Active,
    sortMetricCol,
    splitIdx,
    totalRow,
    dimCols,
    vizType,
  ]);

  const option = useMemo(
    () =>
      processedData
        ? buildEChartsOption(
            vizType,
            processedData,
            metricFormatMap,
            theme.palette.chart,
            false,
            cardSize,
          )
        : null,
    [vizType, processedData, metricFormatMap, theme.palette.chart, cardSize],
  );

  const pivotProps: PivotTableProps | null = useMemo(() => {
    if (vizType !== "pivot_table_v2") return null;
    const rawMeta = meta as ChartData | undefined;
    const raw = rawMeta?.params || rawMeta?.form_data || "{}";
    let fd: Record<string, unknown> = {};
    try {
      fd = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
    } catch {
      return null;
    }
    const metricsList = Array.isArray(fd.metrics)
      ? (fd.metrics as unknown[]).map((m) => {
          if (typeof m === "string") return m;
          const obj = m as {
            label?: string;
            column?: { column_name?: string };
          };
          return obj.label || obj.column?.column_name || "";
        })
      : [];
    const chartPayload = data;
    const hasWideData =
      Boolean(chartPayload?.metric_components) &&
      Array.isArray(chartPayload?.data);
    const payloadColnames = chartPayload?.colnames ?? [];
    const payloadColtypes = chartPayload?.coltypes ?? [];
    const dateColumns = payloadColnames.filter(
      (_, i) => payloadColtypes[i] === 2,
    );
    return {
      groupbyRows: Array.isArray(fd.groupbyRows)
        ? (fd.groupbyRows as string[])
        : [],
      groupbyColumns: Array.isArray(fd.groupbyColumns)
        ? (fd.groupbyColumns as string[])
        : [],
      metrics: metricsList.filter(Boolean),
      totalRows: pivotTotalRows,
      subtotalRows: pivotSubtotalRows,
      aggregateFunction: DEFAULT_PIVOT_CONFIG.aggregateFunction,
      transposePivot: DEFAULT_PIVOT_CONFIG.transposePivot,
      combineMetric: DEFAULT_PIVOT_CONFIG.combineMetric,
      rowTotals: DEFAULT_PIVOT_CONFIG.rowTotals,
      colTotals: DEFAULT_PIVOT_CONFIG.colTotals,
      metricsLayout: DEFAULT_PIVOT_CONFIG.metricsLayout,
      formatCell: tableFormatCell,
      dateColumns,
      wideData: hasWideData
        ? {
            rows: chartPayload.data as ChartDataRow[],
            components: (chartPayload.metric_components ?? {}) as Record<
              string,
              WideMetricComponent
            >,
          }
        : undefined,
    };
  }, [vizType, meta, tableFormatCell, pivotTotalRows, pivotSubtotalRows, data]);

  const toggleFullScreen = async () => {
    fullscreen.setFullscreen(chartId);
    const isLandscape = (screen.orientation as any)?.type?.startsWith?.(
      "landscape",
    );
    if (isLandscape) return;
    const canLock = typeof (screen.orientation as any)?.lock === "function";
    if (canLock) {
      try {
        await (screen.orientation as any).lock("landscape");
      } catch {
        fullscreen.setForceLandscape(true);
      }
    } else {
      fullscreen.setForceLandscape(true);
    }
  };

  const exitFullScreen = () => {
    fullscreen.exit();
    (screen.orientation as any)?.unlock?.();
  };

  useEffect(() => {
    if (!isActiveFullscreen || !fullscreen.forceLandscape) return;
    const mql = window.matchMedia("(orientation: landscape)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setForceLandscape(false);
    };
    handler(mql);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [isActiveFullscreen, fullscreen.forceLandscape, setForceLandscape]);

  const touchStart = () => {
    if (containerWidth >= 600) return;
    longPressTimer.current = setTimeout(() => onEdit(chartId), 600);
  };
  const touchEnd = () => clearTimeout(longPressTimer.current);
  const touchMove = () => clearTimeout(longPressTimer.current);

  const isCompareActive =
    compareConfig?.enabled && compareConfig.chartId === chartId;
  const isMobile = containerWidth < 600;

  return (
    <>
      <Card
        ref={cardRef}
        onTouchStart={touchStart}
        onTouchEnd={touchEnd}
        onTouchMove={touchMove}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          boxShadow: isCompareActive
            ? "0 0 0 2px var(--mui-palette-primary-main), var(--mui-palette-shadow-popover)"
            : "var(--mui-palette-shadow-card)",
          transition:
            "box-shadow 250ms cubic-bezier(0, 0, 0.2, 1), transform 250ms cubic-bezier(0, 0, 0.2, 1)",
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: "var(--mui-palette-shadow-cardHover)",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 1.5,
            py: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            gap: 0.5,
          }}
        >
          {sizeSelector}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meta?.slice_name || sliceName || `Chart #${chartId}`}
          </Typography>
          <Tooltip
            title={
              pct95Threshold === 0.95
                ? "前95%"
                : pct95Threshold === 0.99
                  ? "前99%"
                  : "精简模式"
            }
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setPct95Threshold((prev) =>
                  prev === 0 ? 0.95 : prev === 0.95 ? 0.99 : 0,
                );
              }}
              sx={{
                p: 0.5,
                ml: isMobile ? 0.5 : 0,
                color: pct95Active ? "primary.main" : "action.active",
              }}
            >
              <LeaderboardOutlined sx={{ fontSize: isMobile ? 22 : 18 }} />
            </IconButton>
          </Tooltip>
          {pct95Active && (
            <Typography
              variant="caption"
              sx={{ color: "primary.main", fontWeight: 600, mr: 0.5 }}
            >
              {formatPercentage(Math.round(pct95Threshold * 100), 0)}
            </Typography>
          )}
          {vizType === "table" && (
            <Tooltip title={isCompareActive ? "停止对比" : "对比"}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenCompareBigScreen) {
                    onOpenCompareBigScreen(chartId, data);
                  } else {
                    onToggleCompare(chartId);
                  }
                }}
                sx={{
                  p: 0.5,
                  ml: isMobile ? 0.5 : 0,
                  color: isCompareActive ? "primary.main" : undefined,
                }}
              >
                <FlipIcon sx={{ fontSize: isMobile ? 22 : 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip
            title={
              localCountdown !== undefined && localCountdown > 0
                ? `自动刷新 ${Math.floor(localCountdown / 60)}:${String(localCountdown % 60).padStart(2, "0")} · 单击切换 · 长按刷新`
                : intervalSeconds && intervalSeconds > 0
                  ? `${intervalSeconds}s`
                  : "单击开启自动刷新"
            }
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
              }}
              onMouseDown={() => {
                refreshTimer.current = setTimeout(() => {
                  refreshTimer.current = undefined;
                  onRefresh(chartId);
                }, LONG_PRESS_MS);
              }}
              onMouseUp={() => {
                if (refreshTimer.current) {
                  clearTimeout(refreshTimer.current);
                  refreshTimer.current = undefined;
                  onCycleInterval?.();
                }
              }}
              onMouseLeave={() => {
                if (refreshTimer.current) {
                  clearTimeout(refreshTimer.current);
                  refreshTimer.current = undefined;
                }
              }}
              sx={{ p: 0.5, ml: isMobile ? 0.5 : 0 }}
            >
              <RefreshIcon
                sx={{
                  fontSize: isMobile ? 22 : 18,
                  color:
                    localCountdown !== undefined && localCountdown > 0
                      ? "primary.main"
                      : "action.disabled",
                  animation:
                    localCountdown !== undefined && localCountdown > 0
                      ? `${spin} 4s linear infinite`
                      : undefined,
                }}
              />
            </IconButton>
          </Tooltip>
          <Tooltip title={vizType === "table" ? "复制为文本" : "复制为图片"}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                void copyData();
              }}
              sx={{ p: 0.5, ml: isMobile ? 0.5 : 0 }}
            >
              <ContentCopy sx={{ fontSize: isMobile ? 22 : 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="AI 洞察">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onInsight?.(chartId);
              }}
              sx={{ p: 0.5, ml: isMobile ? 0.5 : 0, color: "primary.main" }}
            >
              <AutoAwesome sx={{ fontSize: isMobile ? 22 : 18 }} />
            </IconButton>
          </Tooltip>
          {!isMobile && (
            <Tooltip title="编辑图表">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(chartId);
                }}
                sx={{ p: 0.5 }}
              >
                <OpenInNewIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          {isMobile && (
            <Tooltip title={isActiveFullscreen ? "退出全屏" : "全屏"}>
              <IconButton
                size="small"
                onClick={() => void toggleFullScreen()}
                sx={{ p: 0.5, ml: isMobile ? 0.5 : 0 }}
              >
                <FullscreenOutlined sx={{ fontSize: isMobile ? 22 : 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="从仪表板移除">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(chartId);
              }}
              sx={{ p: 0.5, ml: isMobile ? 0.5 : 0, color: "error.main" }}
            >
              <CloseIcon sx={{ fontSize: isMobile ? 22 : 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <CardContent
          sx={{
            flex: 1,
            p: 1,
            "&:last-child": { pb: 1 },
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            minWidth: 0,
          }}
        >
          {chartLoading ? (
            <ChartLoadingSkeleton />
          ) : vizType === "table" && data ? (
            isCompareActive ? (
              <MirrorTable
                dimensions={compareConfig.dimensions}
                data={mirrorData}
                onClose={() => onToggleCompare(chartId)}
                formatCell={tableFormatCell}
              />
            ) : (
              <DataPreviewTable
                data={processedData}
                maxRows={100}
                formatCell={tableFormatCell}
                serverPagination={!pct95Active}
                page={page}
                hasMore={hasMore}
                onPageChange={onPageChange}
              />
            )
          ) : vizType === "pivot_table_v2" && data?.data && pivotProps ? (
            <PivotTable data={data.data} {...pivotProps} />
          ) : option && chartLibReady ? (
            <ReactEChartsCore
              ref={chartRef}
              echarts={getECharts()}
              option={option}
              style={{ height: "100%", width: "100%" }}
              notMerge
              lazyUpdate
            />
          ) : option ? (
            <ChartLoadingSkeleton />
          ) : (
            <ChartLoadingSkeleton />
          )}
        </CardContent>
      </Card>
      {isActiveFullscreen &&
        createPortal(
          <>
            <Box
              sx={{
                position: "fixed",
                inset: 0,
                zIndex: 99998,
                bgcolor: "var(--mui-palette-shadow-backdrop)",
              }}
              onClick={exitFullScreen}
            />
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                position: "fixed",
                top: "50%",
                left: "50%",
                width: "90vw",
                height: "90vh",
                transform: "translate(-50%, -50%)",
                zIndex: 99999,
                overflow: "hidden",
                bgcolor: "background.paper",
                borderRadius: 2,
                boxShadow: 24,
              }}
            >
              <Box
                sx={
                  fullscreen.forceLandscape
                    ? {
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "90vh",
                        height: "90vw",
                        transform: "translate(-50%, -50%) rotate(90deg)",
                        display: "flex",
                        flexDirection: "column",
                      }
                    : {
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                      }
                }
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    px: 1.5,
                    py: 0.5,
                    bgcolor: "background.paper",
                    paddingTop: "calc(4px + env(safe-area-inset-top, 0px))",
                  }}
                >
                  <Box
                    sx={{
                      flex: 1,
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta?.slice_name || sliceName || `Chart #${chartId}`}
                  </Box>
                  <Tooltip title="退出全屏">
                    <IconButton
                      size="small"
                      onClick={exitFullScreen}
                      sx={{ p: 0.5 }}
                    >
                      <CloseIcon sx={{ fontSize: 22 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
                  {vizType === "table" && data ? (
                    <DataPreviewTable
                      data={processedData}
                      maxRows={100}
                      formatCell={tableFormatCell}
                      serverPagination={!pct95Active}
                      page={page}
                      hasMore={hasMore}
                      onPageChange={onPageChange}
                    />
                  ) : vizType === "pivot_table_v2" &&
                    data?.data &&
                    pivotProps ? (
                    <PivotTable data={data.data} {...pivotProps} />
                  ) : option && chartLibReady ? (
                    <ReactEChartsCore
                      echarts={getECharts()}
                      option={option}
                      style={{ height: "100%", width: "100%" }}
                      notMerge
                      lazyUpdate
                    />
                  ) : (
                    <ChartLoadingSkeleton />
                  )}
                </Box>
              </Box>
            </Box>
          </>,
          document.body,
        )}
    </>
  );
}

export default memo(ChartCard, (prev, next) => {
  return (
    prev.chartId === next.chartId &&
    prev.vizType === next.vizType &&
    prev.containerWidth === next.containerWidth &&
    prev.meta?.slice_name === next.meta?.slice_name &&
    prev.sliceName === next.sliceName &&
    prev.data === next.data &&
    prev.loading === next.loading &&
    prev.mirrorData === next.mirrorData &&
    prev.compareConfig === next.compareConfig &&
    prev.onRefresh === next.onRefresh &&
    prev.totalRow === next.totalRow &&
    prev.intervalSeconds === next.intervalSeconds &&
    prev.page === next.page &&
    prev.hasMore === next.hasMore &&
    prev.onPageChange === next.onPageChange
  );
});
