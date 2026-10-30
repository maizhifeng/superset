import { useMemo } from "react";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import type { ChartDataRow } from "@/types/api";
import { formatPctValue } from "@/utils/formatNumber";
import { formatMetricValue, toNumber } from "../format";
import { PAID_RETENTION_DAYS, topicMetric } from "../topics";
import type { AnalysisTopic } from "../types";

const MAX_ROWS = 20;

export default function RetentionMatrix({
  topic,
  rows,
  dimension,
  platforms = [],
  loading,
}: {
  topic: AnalysisTopic;
  rows: ChartDataRow[];
  dimension: string;
  /** Page-level platform filter, used to flag the overseas data gap. */
  platforms?: string[];
  loading: boolean;
}) {
  const theme = useTheme();
  const dimensionLabel =
    topic.dimensions.find((item) => item.key === dimension)?.label ?? dimension;

  // The overseas source currently hard-codes paid-retention counts to 0, so
  // any view scoped to overseas (or an oversea row in the platform breakdown)
  // must be shown as "unavailable" rather than a real 0% retention.
  const overseasFiltered = platforms.includes("oversea");
  const overseasRowExists =
    dimension === "平台" &&
    rows.some((row) => String(row[dimension] ?? "").trim() === "oversea");
  const overseasUnavailable = overseasFiltered || overseasRowExists;
  const isOverseasUnavailable = (row: ChartDataRow) =>
    overseasFiltered ||
    (dimension === "平台" &&
      String(row[dimension] ?? "").trim() === "oversea");

  const visibleRows = useMemo(
    () =>
      [...rows]
        .sort(
          (a, b) =>
            (toNumber(b["新增进入"]) ?? 0) - (toNumber(a["新增进入"]) ?? 0),
        )
        .slice(0, MAX_ROWS),
    [rows],
  );

  const visibleDays = useMemo(() => {
    const days = PAID_RETENTION_DAYS.filter((day) =>
      visibleRows.some((row) => (toNumber(row[`${day}日付费留存率`]) ?? 0) > 0),
    );
    return days.length > 0 ? days : PAID_RETENTION_DAYS;
  }, [visibleRows]);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const row of visibleRows) {
      for (const day of visibleDays) {
        const value = toNumber(row[`${day}日付费留存率`]);
        if (value !== null && value > max) max = value;
      }
    }
    return max;
  }, [visibleDays, visibleRows]);

  if (!loading && rows.length === 0) {
    return (
      <Box
        sx={{
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">当前筛选条件下暂无留存数据</Typography>
      </Box>
    );
  }

  const rowLabelSx = {
    position: "sticky",
    left: 0,
    zIndex: 1,
    bgcolor: "background.paper",
    borderRight: "1px solid",
    borderRightColor: "divider",
    maxWidth: 240,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as const;

  return (
    <Box>
      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {/* Colour-scale legend: retention is encoded as heat intensity, so the
          matrix needs a key even though the cells carry tooltips/values. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 0.75,
          mb: 1,
        }}
      >
        <Tooltip title="颜色越深代表付费留存率越高；0% 与缺失值使用弱化样式">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ cursor: "help" }}
          >
            颜色强度
          </Typography>
        </Tooltip>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          0%
        </Typography>
        <Box
          aria-hidden
          sx={{
            width: 96,
            height: 8,
            borderRadius: 4,
            border: "1px solid",
            borderColor: "divider",
            background: `linear-gradient(90deg, ${alpha(
              theme.palette.primary.main,
              0.04,
            )} 0%, ${alpha(theme.palette.primary.main, 0.52)} 100%)`,
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          最高 {maxValue > 0 ? formatPctValue(maxValue, 1) : "–"}
        </Typography>
      </Box>
      {overseasUnavailable && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            mb: 1,
            px: 1,
            py: 0.5,
            borderRadius: 1.5,
            border: "1px solid",
            borderColor: (theme) => alpha(theme.palette.warning.main, 0.3),
            bgcolor: (theme) => alpha(theme.palette.warning.main, 0.06),
          }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 15, color: "warning.main" }} />
          <Typography variant="caption" color="text.secondary">
            海外平台付费留存明细暂未接入，相关单元格以「–」展示；海外付费人数、充值等其他指标正常。
          </Typography>
        </Box>
      )}
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ maxHeight: 520, borderRadius: 2 }}
      >
        <Table stickyHeader size="small" aria-label="付费留存矩阵">
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  fontWeight: 700,
                  bgcolor: "surface.variant",
                  minWidth: 160,
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                }}
              >
                {dimensionLabel}
              </TableCell>
              {visibleDays.map((day) => (
                <TableCell
                  key={day}
                  align="right"
                  sx={{
                    fontWeight: 700,
                    bgcolor: "surface.variant",
                    whiteSpace: "nowrap",
                  }}
                >
                  {day}日
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((row, index) => (
              <TableRow
                key={`${row[dimension] ?? index}-${index}`}
                hover
                sx={{
                  // Heat cells are translucent, so the row hover tint blends
                  // through them; the sticky label needs an explicit tint.
                  "&:hover .retention-row-label": {
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                  },
                }}
              >
                <TableCell
                  className="retention-row-label"
                  sx={{
                    ...rowLabelSx,
                    fontWeight: 600,
                  }}
                  title={String(row[dimension] ?? "")}
                >
                  {String(row[dimension] ?? "–")}
                </TableCell>
                {visibleDays.map((day) => {
                  if (isOverseasUnavailable(row)) {
                    return (
                      <TableCell
                        key={day}
                        align="right"
                        sx={{
                          color: "text.disabled",
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Tooltip title="海外数据源暂未提供付费留存明细">
                          <span>–</span>
                        </Tooltip>
                      </TableCell>
                    );
                  }
                  const metricDef = topicMetric(topic, `${day}日付费留存率`);
                  const value = toNumber(row[metricDef.key]);
                  const missing = value === null;
                  const zero = value === 0;
                  const intensity =
                    value !== null && value > 0 && maxValue > 0
                      ? Math.max(0.04, Math.min(0.52, (value / maxValue) * 0.52))
                      : 0;
                  return (
                    <TableCell
                      key={day}
                      align="right"
                      className="retention-heat-cell"
                      sx={{
                        bgcolor:
                          intensity > 0
                            ? alpha(theme.palette.primary.main, intensity)
                            : undefined,
                        color: missing || zero
                          ? "text.disabled"
                          : intensity > 0.36
                            ? theme.palette.primary.contrastText
                            : "text.primary",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatMetricValue(metricDef, value)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {rows.length > MAX_ROWS && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1 }}
        >
          仅展示新增进入最多的 {MAX_ROWS} 个{dimensionLabel}，共 {rows.length}{" "}
          个。
        </Typography>
      )}
      {visibleDays.length < PAID_RETENTION_DAYS.length && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1 }}
        >
          仅展示当前筛选下有数据的天数；未展示的天数在所选区间内暂无记录。
        </Typography>
      )}
    </Box>
  );
}
