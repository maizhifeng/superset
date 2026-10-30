import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeltaArrow from "./DeltaArrow";
import DownloadIcon from "@mui/icons-material/Download";
import dayjs from "dayjs";
import type { GridColDef, GridSortModel } from "@mui/x-data-grid";
import DataGridTable from "@/components/DataGridTable";
import { useNotificationStore } from "@/store/notificationStore";
import type { ChartDataRow } from "@/types/api";
import { downloadCsv } from "@/utils/exportCsv";
import type { DrillAnomaly } from "../anomalies";
import { formatFullDay, formatMetricValue, toNumber } from "../format";
import { ANALYSIS_TIME_COLUMN, topicMetric } from "../topics";
import type { AnalysisMetric, AnalysisTopic } from "../types";

interface TableRow {
  __id: string;
  __dimension: string;
  [key: string]: string | number | null;
}

export default function AnalysisBreakdownTable({
  topic,
  rows,
  dimension,
  onDimensionChange,
  onDrill,
  drillHint,
  focusDate,
  focusWeek,
  anomalies,
  anomalyMetricLabel,
  anomalyMetric,
  unavailableMetricKeys = [],
  unavailableAllRows = false,
  unavailableDimensionValues = [],
  onRowHover,
  loading,
  height = 460,
}: {
  topic: AnalysisTopic;
  rows: ChartDataRow[];
  dimension: string;
  onDimensionChange: (dimension: string) => void;
  onDrill?: (dimension: string, value: string) => void;
  drillHint?: string;
  focusDate?: string;
  /** Sunday start of a drilled week, shown in the caption instead of a day. */
  focusWeek?: string;
  /** Rolling-baseline scores for the drilled day, keyed by dimension value. */
  anomalies?: Map<string, DrillAnomaly>;
  /** Fired after a short hover dwell so the next drill level can prefetch. */
  onRowHover?: (dimensionValue: string) => void;
  /** Metric label used by the anomaly column header. */
  anomalyMetricLabel?: string;
  /** Metric object used to format current/baseline values in the tooltip. */
  anomalyMetric?: AnalysisMetric | null;
  /** Metric field keys whose source data is unavailable (rendered as "–"). */
  unavailableMetricKeys?: string[];
  /** Mask unavailable metrics on every row (e.g. an overseas-only filter). */
  unavailableAllRows?: boolean;
  /** Mask unavailable metrics only on these dimension values (e.g. oversea row). */
  unavailableDimensionValues?: string[];
  loading: boolean;
  height?: number;
}) {
  const isTimeDimension = dimension === ANALYSIS_TIME_COLUMN;
  const dimensionLabel = isTimeDimension
    ? ANALYSIS_TIME_COLUMN
    : (topic.dimensions.find((item) => item.key === dimension)?.label ??
      dimension);
  const orderByKey = topicMetric(topic, topic.breakdown.orderBy).key;

  // Date rows read chronologically; category rows keep the topic's metric order.
  // Mirror the DataGrid sort state so the caption can name the active sort.
  const [sortModel, setSortModel] = useState<GridSortModel>([
    isTimeDimension
      ? { field: "__dimension", sort: "asc" }
      : { field: orderByKey, sort: "desc" },
  ]);

  // A drill can switch the dimension in place (e.g. 渠道商 → 日期); reset the
  // grid sort to the natural order for the new dimension.
  useEffect(() => {
    setSortModel([{ field: isTimeDimension ? "__dimension" : orderByKey, sort: isTimeDimension ? "asc" : "desc" }]);
  }, [isTimeDimension, orderByKey]);

  const hoverTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    },
    [],
  );

  // Combinations with no new users only add noise to the breakdown (they have
  // no CPA/retention denominator); hide them when the topic exposes 新增进入.
  const newUsersKey = useMemo(
    () =>
      topic.breakdown.metrics.includes("newUsers")
        ? topicMetric(topic, "newUsers").key
        : null,
    [topic],
  );

  // While a drill switches the dimension, SWR keeps the previous rows in
  // memory. They would render with an empty dimension column ("–") until the
  // new response lands, so treat a dimension mismatch as still loading.
  const { displayRows, rowsMatchDimension } = useMemo(() => {
    const matches =
      rows.length === 0 ||
      rows.some(
        (row) => row[dimension] !== undefined && row[dimension] !== null,
      );
    if (!matches) return { displayRows: [], rowsMatchDimension: false };
    if (!newUsersKey) {
      return { displayRows: rows, rowsMatchDimension: true };
    }
    return {
      displayRows: rows.filter((row) => {
        if (!Object.prototype.hasOwnProperty.call(row, newUsersKey)) {
          // Partial fixtures / older cached payloads without the volume column.
          return true;
        }
        const value = toNumber(row[newUsersKey]);
        return value !== null && value > 0;
      }),
      rowsMatchDimension: true,
    };
  }, [dimension, newUsersKey, rows]);

  const tableRows = useMemo<TableRow[]>(() => {
    const mapped = displayRows.map((row, index) => {
        const dimensionValue = String(row[dimension] ?? "–");
        const result: TableRow = {
          __id: `${dimension}-${index}`,
          __dimension: isTimeDimension
            ? formatFullDay(dimensionValue)
            : dimensionValue,
        };
        for (const key of topic.breakdown.metrics) {
          const metricDef = topicMetric(topic, key);
          result[metricDef.key] = row[metricDef.key] ?? null;
        }
        const anomaly = anomalies?.get(dimensionValue);
        if (anomaly) {
          // Signed value so the column can be sorted numerically; the rest are
          // display/branching hints read by the cell renderer.
          result.__anomalyDelta =
            anomaly.direction === "up" ? anomaly.deltaValue : -anomaly.deltaValue;
          result.__anomalyDeltaText = anomaly.deltaText;
          result.__anomalyDirection = anomaly.direction;
          result.__anomalySignificant = anomaly.significant ? 1 : 0;
          result.__anomalySeverity = anomaly.severity;
          result.__anomalyText = anomaly.text;
          result.__anomalyValue = anomaly.value;
          result.__anomalyBaseline = anomaly.baselineMean;
          result.__anomalySamples = anomaly.baselineSamples;
        } else {
          result.__anomalyDelta = null;
        }
        return result;
    });
    // The grid is uncontrolled, so the query's metric order would otherwise
    // decide the display order; date rows must read chronologically.
    return isTimeDimension
      ? [...mapped].sort((left, right) =>
          String(left.__dimension).localeCompare(String(right.__dimension)),
        )
      : mapped;
  }, [anomalies, dimension, displayRows, isTimeDimension, topic]);

  const rowValueById = useMemo(
    () => new Map(tableRows.map((row) => [row.__id, row.__dimension])),
    [tableRows],
  );

  const scheduleRowHover = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onRowHover) return;
    const rowElement = (event.target as HTMLElement).closest(
      ".MuiDataGrid-row",
    );
    const rowId = rowElement?.getAttribute("data-id");
    const value = rowId ? rowValueById.get(rowId) : undefined;
    if (!value || value === "–") return;
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      onRowHover(value);
    }, 100);
  };

  const columns = useMemo<GridColDef[]>(() => {
    const metricColumns: GridColDef[] = topic.breakdown.metrics.map((key) => {
      const metricDef = topicMetric(topic, key);
      return {
        field: metricDef.key,
        headerName: metricDef.label,
        type: "number",
        flex: 1,
        minWidth: 110,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          const masked =
            unavailableMetricKeys.includes(metricDef.key) &&
            (unavailableAllRows ||
              unavailableDimensionValues.includes(
                String(params.row.__dimension ?? ""),
              ));
          if (masked) {
            return (
              <Tooltip title="海外数据源暂未提供付费留存明细">
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.8125rem",
                    color: "text.disabled",
                    whiteSpace: "nowrap",
                  }}
                >
                  –
                </Typography>
              </Tooltip>
            );
          }
          return (
            <Typography
              variant="body2"
              sx={{
                fontSize: "0.8125rem",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {formatMetricValue(metricDef, params.value)}
            </Typography>
          );
        },
      };
    });

    const anomalyColumns: GridColDef[] = anomalies
      ? [
          {
            field: "__anomalyDelta",
            headerName: "较均线",
            type: "number",
            flex: 0.9,
            minWidth: 120,
            align: "right",
            headerAlign: "right",
            valueGetter: (_value, row) => row.__anomalyDelta ?? null,
            renderCell: (params) => {
              const delta = params.row.__anomalyDelta;
              if (delta === null || delta === undefined) {
                return (
                  <Typography
                    variant="body2"
                    sx={{ fontSize: "0.8125rem", color: "text.disabled" }}
                  >
                    –
                  </Typography>
                );
              }
              const significant = params.row.__anomalySignificant === 1;
              const severity = String(params.row.__anomalySeverity ?? "");
              const direction =
                params.row.__anomalyDirection === "up"
                  ? ("up" as const)
                  : ("down" as const);
              const deltaLabel = String(params.row.__anomalyDeltaText ?? "");
              const formatAnomalyValue = (value: unknown) => {
                if (anomalyMetric) {
                  return formatMetricValue(anomalyMetric, value);
                }
                if (value === null || value === undefined) return "–";
                const numeric = Number(value);
                return Number.isFinite(numeric)
                  ? numeric.toLocaleString("zh-CN", {
                      maximumFractionDigits: 2,
                    })
                  : String(value);
              };
              const tooltip = `${
                significant ? "显著异常：" : "未达显著阈值："
              }${params.row.__anomalyText ?? ""}（当前 ${formatAnomalyValue(
                params.row.__anomalyValue,
              )}，7 日移动平均 ${formatAnomalyValue(
                params.row.__anomalyBaseline,
              )}，${String(params.row.__anomalySamples ?? "–")} 天样本）`;
              const content = significant ? (
                <Chip
                  size="small"
                  variant="outlined"
                  color={
                    severity === "negative"
                      ? "error"
                      : severity === "positive"
                        ? "success"
                        : "warning"
                  }
                  label={deltaLabel}
                  icon={<DeltaArrow direction={direction} />}
                  sx={{
                    height: 20,
                    "& .MuiChip-label": {
                      px: 0.75,
                      fontSize: "0.6875rem",
                      fontVariantNumeric: "tabular-nums",
                    },
                    "& .MuiChip-icon": {
                      color: "inherit",
                      ml: 0.5,
                      mr: -0.25,
                    },
                  }}
                />
              ) : (
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.25,
                  }}
                >
                  <DeltaArrow direction={direction} color="text.secondary" />
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: "0.8125rem",
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {deltaLabel}
                  </Typography>
                </Box>
              );
              return <Tooltip title={tooltip}>{content}</Tooltip>;
            },
          },
        ]
      : [];

    return [
      {
        field: "__dimension",
        headerName: dimensionLabel,
        flex: 1,
        minWidth: 170,
        renderCell: (params) => {
          const value = String(params.value ?? "");
          const canDrill = Boolean(onDrill) && value !== "" && value !== "–";
          const content = (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                minWidth: 0,
                maxWidth: "100%",
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {value}
              </Typography>
              {canDrill && (
                <ChevronRightIcon
                  sx={{
                    fontSize: 14,
                    color: "text.disabled",
                    flexShrink: 0,
                    opacity: 0,
                    transform: "translateX(-2px)",
                    transition:
                      "opacity 120ms ease, transform 120ms ease",
                    ".MuiDataGrid-row:hover &, .MuiDataGrid-row:focus-within &":
                      { opacity: 1, transform: "translateX(0)" },
                    "@media (hover: none)": { opacity: 1 },
                  }}
                />
              )}
            </Box>
          );
          if (!canDrill) return content;
          return (
            <Tooltip title={drillHint ?? "点击查看下一层明细"}>
              {content}
            </Tooltip>
          );
        },
      },
      ...anomalyColumns,
      ...metricColumns,
    ];
  }, [
    anomalies,
    anomalyMetric,
    dimensionLabel,
    drillHint,
    onDrill,
    topic,
    unavailableAllRows,
    unavailableDimensionValues,
    unavailableMetricKeys,
  ]);

  /** Active sort as human text: the dimension column or a metric column. */
  const sortSummary = useMemo(() => {
    const sortItem = sortModel[0];
    if (!sortItem) return "当前未排序";
    const label =
      sortItem.field === "__dimension"
        ? dimensionLabel
        : (() => {
            const metricKey = topic.breakdown.metrics.find(
              (key) => topicMetric(topic, key).key === sortItem.field,
            );
            return metricKey
              ? topicMetric(topic, metricKey).label
              : sortItem.field;
          })();
    return `当前按 ${label} ${sortItem.sort === "asc" ? "升序" : "降序"}排列`;
  }, [dimensionLabel, sortModel, topic]);

  // While the first page of rows is still in flight, "共 0 个" would read as an
  // empty result; show progress instead and only report counts once settled.
  const summary =
    loading && (tableRows.length === 0 || !rowsMatchDimension)
      ? "正在加载明细数据…"
      : `共 ${tableRows.length} 个${dimensionLabel} · ${sortSummary}`;
  // Title + subtitle share one line to save vertical space; the full sentence
  // stays available from the tooltip.
  const detailParts = [
    `按 ${dimensionLabel} 汇总`,
    drillHint ?? null,
    focusDate
      ? `明细日期 ${focusDate}`
      : focusWeek
        ? `明细周 ${focusWeek} ~ ${dayjs(focusWeek).add(6, "day").format("MM-DD")}`
        : null,
    newUsersKey ? "仅显示新增进入 > 0 的组合" : null,
    unavailableMetricKeys.length > 0
      ? "海外数据源暂未提供付费留存明细，相关列以「–」展示"
      : null,
    anomalies
      ? `较均线 = 各${dimensionLabel}的 ${
          anomalyMetricLabel ?? "指标"
        } 较自身 7 日移动平均（不含当天）（红/绿=显著异常，可点表头排序）`
      : null,
  ].filter(Boolean);
  const summaryLine = [summary, ...detailParts].join(" · ");

  const notify = useNotificationStore((state) => state.notify);
  const handleExport = () => {
    const metricDefs = topic.breakdown.metrics.map((key) =>
      topicMetric(topic, key),
    );
    const csvColumns = [dimensionLabel, ...metricDefs.map((m) => m.label)];
    const csvRows = tableRows.map((row) => {
      const output: Record<string, unknown> = {
        [dimensionLabel]: row.__dimension,
      };
      for (const metricDef of metricDefs) {
        // Export raw values, not the display-formatted K/M/percent strings,
        // so the CSV stays usable for pivoting and further analysis.
        output[metricDef.label] = row[metricDef.key] ?? "";
      }
      return output;
    });
    const filename = `${topic.title.replace(/[\\/:*?"<>|]/g, "-")}-${dimensionLabel}-${dayjs().format("YYYYMMDD-HHmm")}.csv`;
    downloadCsv(csvColumns, csvRows, filename);
    notify({
      severity: "success",
      message: `已导出 ${csvRows.length} 行 CSV`,
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            gap: 1,
            minWidth: 0,
            flex: 1,
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, flexShrink: 0 }}
          >
            维度拆解
          </Typography>
          <Tooltip title={summaryLine}>
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
              {summaryLine}
            </Typography>
          </Tooltip>
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
            onClick={handleExport}
            disabled={loading || tableRows.length === 0}
            sx={{ textTransform: "none" }}
          >
            导出 CSV
          </Button>
          <TextField
            select
            size="small"
            label="拆解维度"
            value={dimension}
            onChange={(event) => onDimensionChange(event.target.value)}
            sx={{ minWidth: 150 }}
          >
            {topic.dimensions.map((item) => (
              <MenuItem key={item.key} value={item.key}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Box>

      {!loading && tableRows.length === 0 ? (
        <Box
          sx={{
            height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 2,
            color: "text.secondary",
          }}
        >
          <Typography variant="body2">当前筛选条件下暂无明细数据</Typography>
        </Box>
      ) : (
        <Box
          sx={{ position: "relative", height }}
          onMouseOver={scheduleRowHover}
        >
          <DataGridTable
            rows={tableRows}
            columns={columns}
            loading={loading}
            getRowId={(row) => row.__id}
            disableRowSelectionOnClick
            onRowClick={
              onDrill
                ? (params) => {
                    const value = String(params.row.__dimension ?? "");
                    if (value && value !== "–") {
                      onDrill(dimension, value);
                    }
                  }
                : undefined
            }
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            pageSizeOptions={[25, 50, 100]}
            sortingOrder={["desc", "asc", null]}
            sx={{
              // DataGridTable centres all cells by default; numeric columns
              // explicitly opt into right alignment, so honour that here or
              // the header (right aligned) and values (centred) diverge.
              // Header titles use 10px padding while the shared cell style
              // uses 12px, so match both ends for exact alignment.
              "& .MuiDataGrid-cell": {
                paddingLeft: "10px",
                paddingRight: "10px",
              },
              "& .MuiDataGrid-cell--textRight": {
                justifyContent: "flex-end",
                textAlign: "right",
              },
              // Drilling is the row-level action; make that unambiguous.
              "& .MuiDataGrid-row": {
                cursor: onDrill ? "pointer" : "default",
              },
            }}
            initialState={{
              pagination: { paginationModel: { page: 0, pageSize: 25 } },
              sorting: {
                sortModel: [{ field: orderByKey, sort: "desc" }],
              },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
