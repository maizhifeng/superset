import { memo, useRef, useMemo, useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DragHandleIcon from "@mui/icons-material/DragIndicator";
import FlipIcon from "@mui/icons-material/Flip";
import CloseIcon from "@mui/icons-material/Close";
import LeaderboardOutlined from "@mui/icons-material/LeaderboardOutlined";
import { keyframes } from "@emotion/react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { buildEChartsOption, getECharts } from "@/utils/echarts";

const barBounce = keyframes`
  0%, 100% { transform: scaleY(0.25); }
  50% { transform: scaleY(1); }
`;

const loadingBarColors = [
  "var(--mui-palette-primary-main, #20a7c9)",
  "var(--mui-palette-warning-main, #ff7f44)",
  "var(--mui-palette-info-main, #66bcfe)",
  "var(--mui-palette-success-main, #5ac189)",
  "var(--mui-palette-error-main, #e0432e)",
];

function ChartLoadingSkeleton() {
  return (
    <Box
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
        Loading...
      </Typography>
    </Box>
  );
}
import DataPreviewTable from "@/components/DataPreviewTable";
import type { CellFormatter } from "@/components/DataPreviewTable";
import { useEChartsType } from "@/hooks/useEChartsType";
import MirrorTable from "@/pages/Dashboard/MirrorTable";

export interface CompareDimension {
  dimension: string;
  values: string[];
}

export interface CompareConfig {
  enabled: boolean;
  chartId: number;
  dimensions: CompareDimension[];
}

interface ChartCardProps {
  chartId: number;
  sliceName?: string;
  vizType: string;
  data?: Record<string, unknown>;
  loading?: boolean;
  meta?: { slice_name?: string };
  isDragging: boolean;
  containerWidth: number;
  onRefresh: (chartId: number) => void;
  onEdit: (chartId: number) => void;
  onDelete: (chartId: number) => void;
  compareConfig?: CompareConfig | null;
  mirrorData?: Record<string, unknown>;
  onToggleCompare: (chartId: number) => void;
  onOpenCompareBigScreen?: (chartId: number, chartData?: Record<string, unknown>) => void;
  otherRow?: Record<string, unknown> | null;
  onFetchOtherRow?: (
    chartId: number,
    excludeColumn: string,
    excludeValues: string[],
  ) => void;
  totalRow?: Record<string, unknown> | null;
}

function pct95SplitIndex(
  sorted: Record<string, unknown>[],
  col: string,
): number {
  const total = sorted.reduce((s, r) => s + Number(r[col]), 0);
  if (total === 0) return sorted.length;
  const threshold = total * 0.95;
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
  isDragging,
  containerWidth,
  onRefresh,
  onEdit,
  onDelete,
  compareConfig,
  mirrorData,
  onToggleCompare,
  onOpenCompareBigScreen,
  otherRow,
  onFetchOtherRow,
  totalRow,
}: ChartCardProps) {
  const [pct95Active, setPct95Active] = useState(true);
  const option = data ? buildEChartsOption(vizType, data) : null;
  const chartLibReady = useEChartsType(vizType);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();

  function formatDateValue(value: unknown): string | null {
    if (typeof value === "number") {
      if (value > 1e12 && value < 1e16) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
      }
      if (value > 19000000 && value < 21000000 && value < 1e9) {
        const s = String(Math.floor(value));
        if (s.length === 8) {
          return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        }
      }
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return null;
  }

  const tableFormatCell: CellFormatter | undefined = useMemo(() => {
    if (!data) return undefined;
    const colnames = (data as Record<string, unknown>).colnames as
      | string[]
      | undefined;
    const coltypes = (data as Record<string, unknown>).coltypes as
      | number[]
      | undefined;
    if (!colnames || !coltypes) return undefined;
    const dateCols = new Set(colnames.filter((_, i) => coltypes[i] === 2));
    return (key: string, value: unknown) => {
      if (value === null || value === undefined) return "";
      if (dateCols.has(key)) {
        const formatted = formatDateValue(value);
        if (formatted !== null) return formatted;
      }
      if (typeof value === "number" && !Number.isInteger(value)) {
        if (/^(roi_|pay_rate_|retention_)/i.test(key))
          return value.toFixed(1) + "%";
        return value.toFixed(1);
      }
      return String(value);
    };
  }, [data]);

  const { sortMetricCol, dimCol } = useMemo(() => {
    if (!data) return { sortMetricCol: "", dimCol: "" };
    const colnames = (data as Record<string, unknown>).colnames as
      | string[]
      | undefined;
    const coltypes = (data as Record<string, unknown>).coltypes as
      | number[]
      | undefined;
    if (!colnames || !coltypes) return { sortMetricCol: "", dimCol: "" };
    const smCol = colnames.find((c) => /n_unum|na_devnum/i.test(c)) || "";
    const dCol =
      colnames.find((c) => /report_date_calc|report_week_calc/i.test(c)) ||
      colnames.find((c) => /^papp_id$/i.test(c)) ||
      colnames.find((_, i) => coltypes[i] !== 0 && coltypes[i] !== 3) ||
      colnames[0] ||
      "";
    return { sortMetricCol: smCol, dimCol: dCol };
  }, [data]);

  const rows = Array.isArray(
    (data as Record<string, unknown> | undefined)?.data,
  )
    ? ((data as Record<string, unknown>).data as Record<string, unknown>[])
    : [];

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
        ? pct95SplitIndex(sorted, sortMetricCol)
        : rows.length,
    [sorted, pct95Active, sortMetricCol],
  );

  const hasRemaining =
    pct95Active && !!sortMetricCol && !!dimCol && splitIdx < rows.length;

  const prevDataRef = useRef(data);
  const prevExcludeRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (data !== prevDataRef.current) {
      prevDataRef.current = data;
    }
  }, [data]);

  useEffect(() => {
    if (!hasRemaining || !sortMetricCol) return;
    const colnames_ = (data as Record<string, unknown> | undefined)
      ?.colnames as string[] | undefined;
    const coltypes = (data as Record<string, unknown> | undefined)?.coltypes as
      | number[]
      | undefined;
    const dimIdx = colnames_?.indexOf(dimCol) ?? -1;
    const isDateDim = dimIdx >= 0 && coltypes?.[dimIdx] === 2;
    const excludeVals = [
      ...new Set(
        sorted.slice(0, splitIdx).map((r) => {
          const raw = r[dimCol];
          if (isDateDim && typeof raw === "number") {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
          }
          return String(raw);
        }),
      ),
    ];
    const allDimVals = new Set(
      sorted.map((r) => {
        const raw = r[dimCol];
        if (isDateDim && typeof raw === "number") {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
        }
        return String(raw);
      }),
    );
    if (
      excludeVals.length > 0 &&
      excludeVals.length < allDimVals.size &&
      JSON.stringify(excludeVals) !== JSON.stringify(prevExcludeRef.current) &&
      onFetchOtherRow
    ) {
      prevExcludeRef.current = excludeVals;
      onFetchOtherRow(chartId, dimCol, excludeVals);
    }
  }, [
    hasRemaining,
    sortMetricCol,
    sorted,
    splitIdx,
    dimCol,
    data,
    chartId,
    onFetchOtherRow,
  ]);

  const processedData = useMemo(() => {
    if (!data) return data;

    let resultRows: Record<string, unknown>[];
    let hasMods = false;

    if (pct95Active && sortMetricCol && splitIdx < rows.length) {
      const topRows = sorted.slice(0, splitIdx);
      if (otherRow) {
        resultRows = [...topRows, otherRow];
      } else {
        resultRows = topRows;
      }
      hasMods = true;
    } else {
      resultRows = [...rows];
    }

    if (totalRow && dimCol) {
      resultRows = [
        ...resultRows,
        { ...totalRow, [dimCol]: "合计", __isSummary: true },
      ];
      hasMods = true;
    }

    if (!hasMods) return data;
    return { ...data, data: resultRows } as Record<string, unknown>;
  }, [
    data,
    rows,
    sorted,
    pct95Active,
    sortMetricCol,
    splitIdx,
    otherRow,
    totalRow,
    dimCol,
  ]);

  const touchStart = () => {
    if (containerWidth >= 600) return;
    longPressTimer.current = setTimeout(() => onEdit(chartId), 600);
  };
  const touchEnd = () => clearTimeout(longPressTimer.current);
  const touchMove = () => clearTimeout(longPressTimer.current);

  const isCompareActive =
    compareConfig?.enabled && compareConfig.chartId === chartId;

  return (
    <Card
      onTouchStart={touchStart}
      onTouchEnd={touchEnd}
      onTouchMove={touchMove}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 2,
        border: 0,
        bgcolor: "background.paper",
        boxShadow: isCompareActive
          ? "0 0 0 2px var(--mui-palette-primary-main, #20a7c9), 0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.06)"
          : isDragging
            ? "0 4px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.10)"
            : "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.06)",
        transition:
          "box-shadow 200ms cubic-bezier(0, 0, 0.2, 1), transform 200ms cubic-bezier(0, 0, 0.2, 1)",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.10)",
        },
      }}
    >
      <Box
        className="drag-handle"
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1.5,
          py: 0.5,
          cursor: "move",
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          backgroundImage:
            "linear-gradient(to bottom, rgba(32,167,201,0.03), transparent)",
        }}
      >
        <DragHandleIcon
          sx={{ fontSize: 18, color: "text.disabled", mr: 0.5, flexShrink: 0 }}
        />
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
        {vizType === "table" && (
          <>
            <Tooltip title={pct95Active ? "Show all rows" : "95% mode"}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setPct95Active((prev) => !prev);
                }}
                sx={{
                  p: 0.5,
                  color: pct95Active ? "primary.main" : "action.active",
                }}
              >
                <LeaderboardOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={isCompareActive ? "Stop comparing" : "Compare"}>
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
                  color: isCompareActive ? "primary.main" : undefined,
                }}
              >
                <FlipIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title="Refresh">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh(chartId);
            }}
            sx={{ p: 0.5 }}
          >
            <RefreshIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit Chart">
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
        <Tooltip title="Remove from Dashboard">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(chartId);
            }}
            sx={{ p: 0.5, color: "error.main" }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
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
            />
          )
        ) : option && chartLibReady ? (
          <ReactEChartsCore
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
  );
}

export default memo(ChartCard, (prev, next) => {
  return (
    prev.chartId === next.chartId &&
    prev.vizType === next.vizType &&
    prev.isDragging === next.isDragging &&
    prev.containerWidth === next.containerWidth &&
    prev.meta?.slice_name === next.meta?.slice_name &&
    prev.sliceName === next.sliceName &&
    prev.data === next.data &&
    prev.loading === next.loading &&
    prev.mirrorData === next.mirrorData &&
    prev.compareConfig === next.compareConfig &&
    prev.onRefresh === next.onRefresh &&
    prev.otherRow === next.otherRow &&
    prev.totalRow === next.totalRow
  );
});
