import { memo, type RefObject } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import AddIcon from "@mui/icons-material/Add";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import type { ChartData, ChartDataPayload, ChartDataRow } from "@/types/api";
import ChartCard from "@/pages/Dashboard/ChartCard";
import type { CompareConfig } from "@/pages/Dashboard/ChartCard";
import type { ChartLayoutItem } from "@/utils/dashboard/layout";

const MIN_CARD_WIDTH = 120;
const MOBILE_BREAKPOINT = 768;

function sizeValue(cols: number, fraction: number): number {
  return Math.max(1, Math.round(cols * fraction));
}

function buildSizeOptions(colCount: number) {
  const options = [
    { label: "小", value: sizeValue(colCount, 1 / 3), height: 10 },
    { label: "中", value: sizeValue(colCount, 2 / 3), height: 14 },
    { label: "全宽", value: colCount, height: 18 },
  ];
  const seen = new Set<number>();
  return options.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

function SizeSelector({
  currentW,
  currentH,
  maxCols,
  onChange,
}: {
  currentW: number;
  currentH: number;
  maxCols: number;
  onChange: (w: number, h: number) => void;
}) {
  const options = buildSizeOptions(maxCols);
  const effectiveW = currentW === maxCols ? maxCols : currentW;

  return (
    <ToggleButtonGroup
      size="small"
      value={effectiveW}
      exclusive
      onChange={(_, v) => {
        if (v === null) return;
        const opt = options.find((o) => o.value === v);
        onChange(v, opt?.height ?? currentH);
      }}
    >
      {options.map((o) => (
        <ToggleButton
          key={o.label}
          value={o.value}
          sx={{ px: 1, py: 0.25, fontSize: "0.75rem" }}
        >
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

interface DashboardGridProps {
  containerWidth: number;
  layoutItems: ChartLayoutItem[];
  chartMeta: Record<number, ChartData>;
  chartData: Record<number, ChartDataPayload>;
  chartLoading: Record<number, boolean>;
  saving: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onSizeChange: (chartId: number, newW: number, newH: number) => void;
  onRefresh: (chartId: number) => void;
  onEdit: (chartId: number) => void;
  onDelete: (chartId: number) => void;
  onInsight?: (chartId: number) => void;
  onAddChart?: () => void;
  compareConfig?: CompareConfig | null;
  mirrorData?: ChartDataPayload;
  onToggleCompare: (chartId: number) => void;
  onOpenCompareBigScreen?: (
    chartId: number,
    chartData?: ChartDataPayload,
  ) => void;
  totalRows?: Record<number, ChartDataRow | null>;
  pivotTotalRows?: Record<number, ChartDataRow[]>;
  pivotSubtotalRows?: Record<number, ChartDataRow[][]>;
  intervalSeconds?: number;
  onCycleInterval?: () => void;
  metricFormatMaps?: Record<number, Record<string, string>>;
  chartPages?: Record<number, number>;
  chartHasMore?: Record<number, boolean>;
  onChartPageChange?: (chartId: number, page: number) => void;
}

function DashboardGrid({
  containerWidth,
  layoutItems,
  chartMeta,
  chartData,
  chartLoading,
  saving,
  containerRef,
  onSizeChange,
  onRefresh,
  onEdit,
  onDelete,
  onInsight,
  onAddChart,
  compareConfig,
  mirrorData,
  onToggleCompare,
  onOpenCompareBigScreen,
  totalRows,
  pivotTotalRows,
  pivotSubtotalRows,
  intervalSeconds,
  onCycleInterval,
  metricFormatMaps,
  chartPages,
  chartHasMore,
  onChartPageChange,
}: DashboardGridProps) {
  const isMobile = containerWidth < MOBILE_BREAKPOINT;
  const colCount = isMobile
    ? 1
    : Math.max(1, Math.floor(containerWidth / MIN_CARD_WIDTH));

  if (layoutItems.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          textAlign: "center",
          borderRadius: 2,
          boxShadow: "var(--mui-palette-shadow-card)",
        }}
      >
        <BarChartOutlinedIcon
          sx={{ fontSize: 48, color: "text.disabled", mb: 1 }}
        />
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          此仪表板暂无图表
        </Typography>
        {onAddChart && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onAddChart}
          >
            添加图表
          </Button>
        )}
      </Box>
    );
  }

  const gapPx = isMobile ? 4 : 6;
  const H_UNIT = 24;

  function itemPct(w: number): string {
    if (w >= colCount) return "100%";
    if (w <= sizeValue(colCount, 1 / 3)) return `${(1 / 3) * 100}%`;
    if (w <= sizeValue(colCount, 2 / 3)) return `${(2 / 3) * 100}%`;
    return `${(w / colCount) * 100}%`;
  }

  return (
    <Box ref={containerRef}>
      {saving && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            bgcolor: "background.paper",
            px: 1,
            py: 0.25,
            borderRadius: 1,
            boxShadow: 1,
          }}
        >
          <CircularProgress size={10} />
          <Typography variant="caption" color="text.secondary">
            保存中...
          </Typography>
        </Box>
      )}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          width: "100%",
          alignItems: "stretch",
        }}
      >
        {layoutItems.map((item) => {
          const meta = chartMeta[item.chartId];
          const dsId = meta?.datasource_id ?? 0;
          const metricFormatMap = metricFormatMaps?.[dsId];
          const itemCols = isMobile ? 1 : Math.min(item.w || 6, colCount);
          const pct = isMobile ? "100%" : itemPct(itemCols);
          const cardHeight = isMobile ? "auto" : `${(item.h || 14) * H_UNIT}px`;

          const smallThreshold = sizeValue(colCount, 1 / 3);
          const cardSize =
            itemCols <= smallThreshold
              ? "small"
              : itemCols >= colCount
                ? "full"
                : "medium";

          return (
            <Box
              key={item.i}
              sx={{
                flex: `0 0 calc(${pct} - ${gapPx * 2}px)`,
                height: cardHeight,
                minWidth: 0,
                m: `${gapPx}px`,
              }}
            >
              <ChartCard
                chartId={item.chartId}
                sliceName={item.sliceName}
                vizType={meta?.viz_type || "bar"}
                data={chartData[item.chartId]}
                loading={!!chartLoading[item.chartId]}
                meta={meta}
                containerWidth={containerWidth}
                onRefresh={onRefresh}
                onEdit={onEdit}
                onDelete={onDelete}
                onInsight={onInsight}
                compareConfig={compareConfig}
                mirrorData={mirrorData}
                onToggleCompare={onToggleCompare}
                onOpenCompareBigScreen={onOpenCompareBigScreen}
                totalRow={totalRows?.[item.chartId]}
                pivotTotalRows={pivotTotalRows?.[item.chartId]}
                pivotSubtotalRows={pivotSubtotalRows?.[item.chartId]}
                intervalSeconds={intervalSeconds}
                onCycleInterval={onCycleInterval}
                metricFormatMap={metricFormatMap}
                page={chartPages?.[item.chartId] ?? 0}
                hasMore={chartHasMore?.[item.chartId] ?? false}
                onPageChange={(p) => onChartPageChange?.(item.chartId, p)}
                cardSize={cardSize}
                sizeSelector={
                  !isMobile ? (
                    <SizeSelector
                      currentW={itemCols}
                      currentH={item.h}
                      maxCols={colCount}
                      onChange={(w, h) => onSizeChange(item.chartId, w, h)}
                    />
                  ) : undefined
                }
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default memo(DashboardGrid);
