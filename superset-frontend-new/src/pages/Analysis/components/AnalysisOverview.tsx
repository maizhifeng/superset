import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Grid2 } from "@/superset-ui-mui/components";
import { deltaColor, metricDelta } from "../delta";
import { formatMetricValue } from "../format";
import type { AnalysisMetric } from "../types";
import {
  ANALYSIS_OVERVIEW_WINDOW_DAYS,
  analysisOverviewMetrics,
  useAnalysisOverview,
} from "../hooks/useAnalysisOverview";

interface OverviewTileProps {
  metric: AnalysisMetric;
  value: unknown;
  previousValue: unknown;
  /** Concrete dates of the window the delta compares against. */
  comparisonRange?: string;
  loading: boolean;
}

function OverviewTile({
  metric,
  value,
  previousValue,
  comparisonRange,
  loading,
}: OverviewTileProps) {
  const delta = loading ? null : metricDelta(metric, value, previousValue);
  const comparisonTooltip = comparisonRange
    ? `与对比窗口 ${comparisonRange} 比较（与统计窗口等长）`
    : "与上一个等长统计周期对比";
  return (
    <Box
      sx={{
        height: "100%",
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ fontWeight: 600 }}
        >
          {metric.label}
        </Typography>
        {metric.description && (
          <Tooltip title={metric.description}>
            <InfoOutlinedIcon
              aria-label={`${metric.label}口径说明`}
              sx={{ fontSize: 14, color: "text.disabled" }}
            />
          </Tooltip>
        )}
      </Box>

      {loading ? (
        <>
          <Skeleton variant="text" width="65%" height={32} />
          <Skeleton variant="text" width="45%" height={16} />
        </>
      ) : (
        <>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              lineHeight: 1.25,
              fontVariantNumeric: "tabular-nums",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {formatMetricValue(metric, value)}
          </Typography>
          <Box
            sx={{
              minHeight: 18,
              display: "flex",
              alignItems: "center",
              gap: 0.25,
            }}
          >
            {delta ? (
              <Tooltip title={comparisonTooltip}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.25,
                    minWidth: 0,
                  }}
                >
                  {delta.direction === "up" && (
                    <ArrowUpwardIcon
                      sx={{
                        fontSize: 14,
                        color: deltaColor(metric, delta.direction),
                      }}
                    />
                  )}
                  {delta.direction === "down" && (
                    <ArrowDownwardIcon
                      sx={{
                        fontSize: 14,
                        color: deltaColor(metric, delta.direction),
                      }}
                    />
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: deltaColor(metric, delta.direction),
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {delta.text}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    noWrap
                    sx={{ display: { xs: "none", sm: "inline" } }}
                  >
                    环比上期
                  </Typography>
                </Box>
              </Tooltip>
            ) : (
              <Typography variant="caption" color="text.disabled">
                暂无对比
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

/**
 * "近 30 天总览": four headline KPIs for the shared federated dataset with a
 * period-over-period delta.  It is a secondary strip, so a failed request
 * degrades to one compact retry row instead of blocking the topic hall.
 */
export default function AnalysisOverview() {
  const { data, loading, error, refresh } = useAnalysisOverview();
  const metrics = analysisOverviewMetrics();
  const windowStart = data?.range.start;
  const windowEnd = data?.range.end;
  const previousStart = data?.range.previousStart;
  const previousEnd = data?.range.previousEnd;

  return (
    <Paper
      variant="outlined"
      data-testid="analysis-overview"
      sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2 }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            近 {ANALYSIS_OVERVIEW_WINDOW_DAYS} 天总览
          </Typography>
          <Tooltip title="成本口径：最近 30 天汇总，并与上一个等长窗口对比；仅统计 ad_combined_report 合并数据集。">
            <InfoOutlinedIcon
              aria-label="总览口径说明"
              sx={{ fontSize: 16, color: "text.disabled" }}
            />
          </Tooltip>
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 0.25, sm: 1.25 },
            rowGap: 0.25,
            flexWrap: "wrap",
            justifyContent: { xs: "flex-start", sm: "flex-end" },
          }}
        >
          {windowStart && windowEnd && (
            <Typography variant="caption" color="text.secondary" noWrap>
              统计窗口 {windowStart} ~ {windowEnd}
            </Typography>
          )}
          {previousStart && previousEnd && (
            <Typography variant="caption" color="text.secondary" noWrap>
              对比窗口 {previousStart} ~ {previousEnd}
            </Typography>
          )}
          <Tooltip title="刷新总览">
            <span>
              <IconButton
                size="small"
                aria-label="刷新总览数据"
                onClick={refresh}
                disabled={loading}
                sx={{ color: "text.secondary" }}
              >
                <RefreshIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {error ? (
        <Box
          role="alert"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: "action.hover",
          }}
        >
          <ErrorOutlineIcon sx={{ fontSize: 18, color: "error.main" }} />
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {error}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            onClick={refresh}
          >
            重试
          </Button>
        </Box>
      ) : (
        <Grid2 container spacing={1.5}>
          {metrics.map((metric) => (
            <Grid2 key={metric.key} size={{ xs: 6, md: 3 }}>
              <OverviewTile
                metric={metric}
                value={data?.current?.[metric.key]}
                previousValue={data?.previous?.[metric.key]}
                comparisonRange={
                  previousStart && previousEnd
                    ? `${previousStart} ~ ${previousEnd}`
                    : undefined
                }
                loading={loading}
              />
            </Grid2>
          ))}
        </Grid2>
      )}
    </Paper>
  );
}
