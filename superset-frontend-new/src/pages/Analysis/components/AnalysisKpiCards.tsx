import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeltaArrow from "./DeltaArrow";
import { deltaColor, metricDelta } from "../delta";
import { formatMetricValue } from "../format";
import type { AnalysisMetric } from "../types";

/**
 * One-line KPI strip.
 *
 * Each card keeps the label, the value and the period-over-period delta on a
 * single row (delta right-aligned), which keeps the chart and table inside the
 * first screen. On phones the row is allowed to wrap.
 */
export default function AnalysisKpiCards({
  metrics,
  row,
  previousRow,
  comparisonRange,
  unavailableMetricKeys = [],
  loading,
}: {
  metrics: AnalysisMetric[];
  row: Record<string, unknown> | null;
  previousRow?: Record<string, unknown> | null;
  /** Concrete dates of the period the deltas compare against. */
  comparisonRange?: string;
  /** Metric field keys whose source data is unavailable (rendered as "–"). */
  unavailableMetricKeys?: string[];
  loading: boolean;
}) {
  const comparisonTooltip = comparisonRange
    ? `与对比窗口 ${comparisonRange} 比较（与统计窗口等长）`
    : "与上一个等长统计周期对比";
  // Six KPIs are noticeably narrower than five, so scale the type down a notch
  // instead of truncating labels such as 累计付费数.
  const dense = metrics.length >= 6;
  return (
    // A CSS grid keeps every KPI on one row on desktop (5 or 6 cards) instead
    // of leaving an empty half-row when the count does not divide 12.
    <Box
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: "repeat(2, minmax(0, 1fr))",
          md: "repeat(3, minmax(0, 1fr))",
          lg: `repeat(${Math.max(metrics.length, 1)}, minmax(0, 1fr))`,
        },
      }}
    >
      {metrics.map((metric) => {
        const delta = loading
          ? null
          : metricDelta(metric, row?.[metric.key], previousRow?.[metric.key]);
        const deltaTone = delta
          ? deltaColor(metric, delta.direction)
          : "text.disabled";
        const unavailable = unavailableMetricKeys.includes(metric.key);
        return (
          <Paper
            key={metric.key}
            variant="outlined"
            sx={{
              position: "relative",
              overflow: "hidden",
              minWidth: 0,
              px: dense ? 1 : 1.25,
              py: 1.25,
              minHeight: 58,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              gap: dense ? 0.375 : 0.5,
              flexWrap: { xs: "wrap", sm: "nowrap" },
              rowGap: 0.25,
              // Slim top accent keeps the strip visually attached to the page.
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                bgcolor: "primary.main",
                opacity: 0.55,
              },
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                minWidth: 0,
                flexShrink: 1,
              }}
            >
              <Tooltip
                title={
                  metric.description
                    ? `${metric.label} — ${metric.description}`
                    : metric.label
                }
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 600,
                    fontSize: dense ? "0.625rem" : "0.75rem",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: 1.2,
                    cursor: metric.description ? "help" : "default",
                  }}
                >
                  {metric.label}
                </Typography>
              </Tooltip>
            </Box>

            {loading ? (
              <Skeleton variant="text" width={64} height={26} />
            ) : unavailable ? (
              <Tooltip title="海外数据源暂未提供付费留存明细">
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: dense
                      ? { lg: "1rem", xl: "1.1rem" }
                      : { lg: "1.2rem", xl: "1.3rem" },
                    lineHeight: 1.15,
                    color: "text.disabled",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  –
                </Typography>
              </Tooltip>
            ) : (
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: dense
                    ? { lg: "1rem", xl: "1.1rem" }
                    : { lg: "1.2rem", xl: "1.3rem" },
                  lineHeight: 1.15,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {formatMetricValue(metric, row?.[metric.key])}
              </Typography>
            )}

            <Tooltip title={comparisonTooltip}>
              <Box
                sx={{
                  ml: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.25,
                  flexShrink: 0,
                }}
              >
                {loading ? (
                  <Skeleton variant="text" width={46} height={18} />
                ) : unavailable ? (
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    –
                  </Typography>
                ) : delta ? (
                  <>
                    <DeltaArrow direction={delta.direction} color={deltaTone} />
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        fontSize: dense ? "0.625rem" : "0.75rem",
                        color: deltaTone,
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {delta.text}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.disabled",
                        whiteSpace: "nowrap",
                        display: { xs: "none", xl: "inline" },
                      }}
                    >
                      较上期
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography variant="caption" sx={{ color: "text.disabled" }}>
                      –
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.disabled",
                        display: { xs: "none", xl: "inline" },
                      }}
                    >
                      较上期
                    </Typography>
                  </>
                )}
              </Box>
            </Tooltip>
          </Paper>
        );
      })}
    </Box>
  );
}
