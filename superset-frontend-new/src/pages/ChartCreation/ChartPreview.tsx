import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Skeleton from "@mui/material/Skeleton";
import ReactEChartsCore from "echarts-for-react/lib/core";
import type { EChartsOption } from "echarts";
import { getECharts } from "@/utils/echarts";
import DataPreviewTable from "@/components/DataPreviewTable";
import PivotTable from "@/components/PivotTable";
import type { WideMetricComponent } from "@/utils/pivot";
import type { ChartDataPayload, ChartDataRow } from "@/types/api";
import { formatMetricValue, type MetricFormatMap } from "@/utils/formatNumber";
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
  metricFormatMap?: MetricFormatMap;
  onSortChange?: (
    sorts: { column: string; direction: "asc" | "desc" }[],
  ) => void;
  page?: number;
  hasMore?: boolean;
  onPageChange?: (page: number) => void;
}

function PivotSkeleton() {
  const headerWidths = [96, 88, 72, 84, 76, 64];
  const rowWidths = [110, 84, 96, 72, 88, 60, 92, 78];
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "grey.50",
          flexShrink: 0,
        }}
      >
        {headerWidths.map((w, i) => (
          <Skeleton
            key={i}
            sx={{ height: 14, borderRadius: 1, flexShrink: 0 }}
            width={w}
          />
        ))}
      </Box>
      {rowWidths.map((w, r) => (
        <Box
          key={r}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          <Skeleton
            sx={{ height: 12, borderRadius: 1, flexShrink: 0 }}
            width={w}
          />
          {[0, 1, 2, 3, 4].map((c) => (
            <Skeleton
              key={c}
              sx={{
                height: 12,
                borderRadius: 1,
                flex: 1,
                maxWidth: 96,
                opacity: 1 - (c + (r % 2)) * 0.08,
              }}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
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
  metricFormatMap,
  onSortChange,
  page,
  hasMore,
  onPageChange,
}: ChartPreviewProps) {
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
          <PivotSkeleton />
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
              totalRows={chartTotalsRows ?? undefined}
              subtotalRows={chartSubtotalRows ?? undefined}
              aggregateFunction={DEFAULT_PIVOT_CONFIG.aggregateFunction}
              transposePivot={DEFAULT_PIVOT_CONFIG.transposePivot}
              combineMetric={DEFAULT_PIVOT_CONFIG.combineMetric}
              rowTotals={DEFAULT_PIVOT_CONFIG.rowTotals}
              colTotals={DEFAULT_PIVOT_CONFIG.colTotals}
              metricsLayout={DEFAULT_PIVOT_CONFIG.metricsLayout}
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
        ) : bigNumberValue && resolvedType === "big_number" ? (
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
        ) : option && chartLibReady ? (
          <ReactEChartsCore
            echarts={getECharts()}
            option={option}
            style={{ height: "100%", width: "100%", minHeight: 250 }}
            notMerge
            lazyUpdate
          />
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
