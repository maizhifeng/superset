import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import ReactEChartsCore from "echarts-for-react/lib/core";
import type { EChartsOption } from "echarts";
import { getECharts } from "@/utils/echarts";
import DataPreviewTable from "@/components/DataPreviewTable";
import { formatMetricValue, type MetricFormatMap } from "@/utils/formatNumber";

const TEMPORAL_TYPE = 2;

interface ChartPreviewProps {
  datasourceId: string;
  resolvedType: string;
  hasValidType: boolean;
  metrics: string[];
  chartData: Record<string, unknown> | null;
  loadingData: boolean;
  chartLibReady: boolean;
  option: EChartsOption | null;
  bigNumberValue: string | null;
  metricFormatMap?: MetricFormatMap;
  onSortChange?: (
    sorts: { column: string; direction: "asc" | "desc" }[],
  ) => void;
}

export default function ChartPreview({
  datasourceId,
  resolvedType,
  hasValidType,
  metrics,
  chartData,
  loadingData,
  chartLibReady,
  option,
  bigNumberValue,
  metricFormatMap,
  onSortChange,
}: ChartPreviewProps) {
  const colnames = (chartData as Record<string, unknown> | null)?.colnames as
    | string[]
    | undefined;
  const coltypes = (chartData as Record<string, unknown> | null)?.coltypes as
    | number[]
    | undefined;

  const temporalCols = useMemo(() => {
    if (!colnames || !coltypes) return new Set<string>();
    const set = new Set<string>();
    for (let i = 0; i < colnames.length; i++) {
      if (coltypes[i] === TEMPORAL_TYPE) set.add(colnames[i]);
    }
    return set;
  }, [colnames, coltypes]);

  const tableData = useMemo(() => {
    if (!chartData || resolvedType !== "table") return chartData;
    const rows = Array.isArray((chartData as Record<string, unknown>).data)
      ? ((chartData as Record<string, unknown>).data as Record<
          string,
          unknown
        >[])
      : [];
    if (!colnames || !coltypes || rows.length === 0) return chartData;
    const smIdx = colnames.findIndex(
      (_, i) => i > 0 && coltypes[i] === 0,
    );
    const dimCols = smIdx > 0 ? colnames.slice(0, smIdx) : [];
    if (dimCols.length === 0) return chartData;
    const totalRow: Record<string, unknown> = {};
    dimCols.forEach((col, i) => {
      totalRow[col] = i === 0 ? "合计" : "—";
    });
    for (const col of colnames) {
      if (dimCols.includes(col)) continue;
      const sum = rows.reduce(
        (s, r) => s + (typeof r[col] === "number" ? (r[col] as number) : 0),
        0,
      );
      totalRow[col] = sum;
    }
    return {
      ...chartData,
      data: [...rows, { ...totalRow, __isSummary: true }],
    } as Record<string, unknown>;
  }, [chartData, resolvedType, colnames, coltypes]);

  function formatDateCell(val: unknown): string {
    if (typeof val === "number") {
      const d = new Date(val);
      const y = d.getFullYear();
      if (y > 1900 && y < 2100) return d.toLocaleDateString();
    }
    if (typeof val === "string" && /^\d{2,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(val)) {
      return val;
    }
    return String(val ?? "");
  }

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
        ) : loadingData && !chartData ? (
          <CircularProgress size={24} />
        ) : resolvedType === "table" ? (
          <DataPreviewTable
            data={tableData}
            maxRows={500}
            onSortChange={onSortChange}
            formatCell={(key, val) => {
              if (val === null || val === undefined) return "";
              if (temporalCols.has(key)) return formatDateCell(val);
              return formatMetricValue(key, val, metricFormatMap);
            }}
          />
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
