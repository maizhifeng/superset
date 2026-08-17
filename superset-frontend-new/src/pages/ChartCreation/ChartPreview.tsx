import { useRef, useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import DownloadIcon from "@mui/icons-material/Download";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReactEChartsCore from "echarts-for-react/lib/core";
import type { EChartsOption } from "echarts";
import { getECharts } from "@/utils/echarts";
import DataPreviewTable from "@/components/DataPreviewTable";
import PivotTable from "@/components/PivotTable";
import ChartLoadingSkeleton from "@/components/ChartLoadingSkeleton";
import type { WideMetricComponent } from "@/utils/pivot";
import type { ChartDataPayload, ChartDataRow } from "@/types/api";
import { formatMetricValue, type MetricFormatMap } from "@/utils/formatNumber";
import { useNotificationStore } from "@/store/notificationStore";
import { DEFAULT_PIVOT_CONFIG } from "./useChartEditor";

interface ChartPreviewProps {
  datasourceId: string;
  resolvedType: string;
  hasValidType: boolean;
  metrics: string[];
  pivotMetricKeys: string[];
  groupby: string[];
  groupbyColumns: string[];
  chartData: ChartDataPayload | null;
  chartTotalsRows?: ChartDataRow[] | null;
  chartSubtotalRows?: ChartDataRow[][] | null;
  loadingData: boolean;
  chartLibReady: boolean;
  option: EChartsOption | null;
  bigNumberValue: string | null;
  /** big_number 预览下标明的指标名称。 */
  primaryMetricLabel?: string;
  metricFormatMap?: MetricFormatMap;
  onSortChange?: (
    sorts: { column: string; direction: "asc" | "desc" }[],
  ) => void;
  page?: number;
  hasMore?: boolean;
  onPageChange?: (page: number) => void;
}

export default function ChartPreview({
  datasourceId,
  resolvedType,
  hasValidType,
  metrics,
  pivotMetricKeys,
  groupby,
  groupbyColumns,
  chartData,
  chartTotalsRows,
  chartSubtotalRows,
  loadingData,
  chartLibReady,
  option,
  bigNumberValue,
  primaryMetricLabel,
  metricFormatMap,
  onSortChange,
  page,
  hasMore,
  onPageChange,
}: ChartPreviewProps) {
  // True when the query succeeded and produced at least one row. ECharts can
  // still emit an `option` when the dataset is empty (e.g. no matching rows),
  // so we rely on the row count rather than the option to decide whether a
  // friendly empty-state should replace an otherwise blank canvas.
  const hasData =
    resolvedType === "table" || resolvedType === "pivot_table_v2"
      ? Boolean(chartData?.data && chartData.data.length > 0)
      : Boolean(
          bigNumberValue ||
            (chartData?.data && chartData.data.length > 0),
        );

  const notify = useNotificationStore((s) => s.notify);
  const chartRef = useRef<InstanceType<typeof ReactEChartsCore> | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void previewRef.current?.requestFullscreen();
  };

  // 导出当前 ECharts 预览为 PNG。ECharts 会按当前容器尺寸渲染。
  const handleDownloadPng = () => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;
    try {
      const dataUrl = instance.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#fff",
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `chart-preview-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      notify({ severity: "success", message: "预览图已导出" });
    } catch {
      notify({ severity: "error", message: "导出图片失败" });
    }
  };

  // 复制当前显示的大数字数值到剪贴板。
  const handleCopyBigNumber = async () => {
    if (!bigNumberValue) return;
    try {
      await navigator.clipboard.writeText(bigNumberValue);
      notify({ severity: "success", message: "已复制数值" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  return (
    <Box
      sx={{
        flex: { md: 1 },
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          bgcolor: "background.paper",
          minHeight: 200,
          overflow: "auto",
        }}
      >
        {!datasourceId ? (
          <Typography variant="body2" color="text.disabled">
            选择数据集以查看预览
          </Typography>
        ) : !hasValidType ? (
          <Typography variant="body2" color="text.disabled">
            正在分析数据以获取最佳图表类型...
          </Typography>
        ) : metrics.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            请至少选择一个指标
          </Typography>
        ) : resolvedType === "pivot_table_v2" && loadingData ? (
          <ChartLoadingSkeleton />
        ) : loadingData && !chartData ? (
          <CircularProgress size={24} />
        ) : resolvedType === "table" ? (
          <DataPreviewTable
            data={chartData}
            onSortChange={onSortChange}
            formatCell={(key, val) => {
              if (val === null || val === undefined) return "";
              return formatMetricValue(key, val, metricFormatMap);
            }}
            serverPagination
            page={page}
            hasMore={hasMore}
            onPageChange={onPageChange}
            showExport
          />
        ) : resolvedType === "pivot_table_v2" && chartData?.data ? (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <PivotTable
              data={chartData.data}
              groupbyRows={groupby}
              groupbyColumns={groupbyColumns}
              metrics={pivotMetricKeys}
              dateColumns={(chartData.colnames ?? []).filter(
                (_, i) => (chartData.coltypes ?? [])[i] === 2,
              )}
              totalRows={chartTotalsRows ?? undefined}
              subtotalRows={chartSubtotalRows ?? undefined}
              aggregateFunction={DEFAULT_PIVOT_CONFIG.aggregateFunction}
              transposePivot={DEFAULT_PIVOT_CONFIG.transposePivot}
              combineMetric={DEFAULT_PIVOT_CONFIG.combineMetric}
              rowTotals={DEFAULT_PIVOT_CONFIG.rowTotals}
              colTotals={DEFAULT_PIVOT_CONFIG.colTotals}
              metricsLayout={DEFAULT_PIVOT_CONFIG.metricsLayout}
              // Explore is for layout tuning, not full-data review: the 95%
              // mode keeps only the top row groups by the first metric, so
              // previews stay light even on wide datasets.
              pct95={
                pivotMetricKeys.length > 0
                  ? {
                      enabled: true,
                      metric: pivotMetricKeys[0],
                      threshold: 0.95,
                    }
                  : undefined
              }
              wideData={
                (
                  chartData as ChartDataPayload & {
                    metric_components?: Record<string, unknown>;
                  }
                ).metric_components
                  ? {
                      rows: chartData.data,
                      components: (
                        chartData as ChartDataPayload & {
                          metric_components?: Record<string, unknown>;
                        }
                      ).metric_components as Record<
                        string,
                        WideMetricComponent
                      >,
                    }
                  : undefined
              }
              formatCell={(key, val) => {
                if (val === null || val === undefined) return "";
                return formatMetricValue(key, val, metricFormatMap);
              }}
            />
          </Box>
        ) : chartData && !hasData && !loadingData ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
              color: "text.disabled",
              py: 4,
            }}
          >
            <Box
              component="span"
              sx={{
                fontSize: "2rem",
                lineHeight: 1,
                opacity: 0.6,
              }}
            >
              🗂️
            </Box>
            <Typography variant="body2">暂无数据</Typography>
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", opacity: 0.8 }}
            >
              当前筛选条件下没有匹配的记录，请调整指标、分组或筛选条件后重试。
            </Typography>
          </Box>
        ) : bigNumberValue && resolvedType === "big_number" ? (
          <Box
            sx={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Tooltip title="复制数值">
              <IconButton
                size="small"
                onClick={() => void handleCopyBigNumber()}
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  zIndex: 2,
                  bgcolor: "background.paper",
                  boxShadow: "var(--mui-palette-shadow-sm)",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {primaryMetricLabel && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 0.25, maxWidth: "100%" }}
                >
                  {primaryMetricLabel}
                </Typography>
              )}
              <Typography
                variant="h2"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: "2rem", sm: "3rem" },
                  lineHeight: 1.2,
                }}
              >
                {bigNumberValue}
              </Typography>
            </Box>
          </Box>
        ) : option && chartLibReady ? (
          <Box
            ref={previewRef}
            sx={{
              position: "relative",
              width: "100%",
              height: "100%",
              minHeight: 250,
            }}
          >
            <ReactEChartsCore
              ref={chartRef}
              echarts={getECharts()}
              option={option}
              style={{ height: "100%", width: "100%", minHeight: 250 }}
              notMerge
              lazyUpdate
            />
            <Tooltip title={isFullscreen ? "退出全屏" : "全屏查看"}>
              <IconButton
                size="small"
                onClick={toggleFullscreen}
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  zIndex: 2,
                  bgcolor: "background.paper",
                  boxShadow: "var(--mui-palette-shadow-sm)",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                {isFullscreen ? (
                  <FullscreenExitIcon sx={{ fontSize: 16 }} />
                ) : (
                  <FullscreenIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title="导出为 PNG">
              <IconButton
                size="small"
                onClick={handleDownloadPng}
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 32,
                  zIndex: 2,
                  bgcolor: "background.paper",
                  boxShadow: "var(--mui-palette-shadow-sm)",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <DownloadIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        ) : option ? (
          <CircularProgress size={20} />
        ) : chartData ? (
          <Typography variant="body2" color="text.disabled">
            未返回数据
          </Typography>
        ) : (
          <CircularProgress size={24} />
        )}
      </Box>
    </Box>
  );
}
