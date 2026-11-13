import type { ReactNode } from "react";
import type { AdhocMetric } from "@/utils/query/types";

/** How a metric is rendered in KPI cards, charts and tables. */
export type AnalysisMetricFormat = "number" | "percent" | "decimal";

export interface AnalysisMetric {
  /** Field name in the chart-data response. */
  key: string;
  label: string;
  /** Dataset metric name or an ad-hoc metric definition. */
  metric: string | AdhocMetric;
  format: AnalysisMetricFormat;
  /** Short definition shown in a tooltip next to the metric label. */
  description?: string;
  /** Whether an increase in this metric is a positive outcome. */
  higherIsBetter?: boolean;
  /**
   * Observation window in days.  Values for dates inside this window are not
   * mature yet and are rendered as gaps instead of misleading zeros.
   */
  maturityDays?: number;
  decimals?: number;
  /**
   * Catalog key of the denominator used to re-aggregate this rate metric over
   * a coarser bucket (day → week/month).  A bucket's rate is the ratio of the
   * bucket's sums, so aggregating daily rates weights each day by this volume
   * instead of averaging ratios.  Only meaningful for non-additive metrics.
   */
  bucketWeight?: string;
}

export interface AnalysisDimension {
  key: string;
  label: string;
}

export type AnalysisChartType = "bar" | "line";
export type AnalysisAxis = "left" | "right" | "right2";

export interface AnalysisTrendSeries {
  /** Key in the topic metric catalog. */
  metric: string;
  type: AnalysisChartType;
  axis?: AnalysisAxis;
  /**
   * Catalog key of the denominator used by rate metrics. Weekly aggregation
   * weights the daily rates by this volume metric so a week's rate equals the
   * ratio of the weekly sums instead of a naive average of daily ratios.
   */
  weightBy?: string;
}

export type AnalysisExtraViewType =
  "retention-matrix" | "ltv-roi" | "efficiency-scatter" | "project-compare";

/**
 * Standard page sections a topic renders above its extra view.  A topic whose
 * extra view owns the whole page hides the ones it does not use, which also
 * skips their queries.
 */
export type AnalysisPageSection = "kpis" | "trend" | "breakdown";

export interface AnalysisExtraView {
  type: AnalysisExtraViewType;
  title: string;
  description?: string;
  /** Extra metrics the totals query must fetch for this view. */
  totalsMetrics?: string[];
  /** Extra metrics the breakdown query must fetch for this view. */
  breakdownMetrics?: string[];
  /**
   * Metric-catalog keys the view compares, in display order.  Also used by the
   * "查看 SQL" dialog when the topic hides the standard sections, so the
   * preview shows the view's own query instead of an empty one.
   */
  metrics?: string[];
  /**
   * Hide the section title/description row above the view.  Set by views whose
   * own header already explains the content (project comparison).
   */
  hideHeader?: boolean;
}

export interface AnalysisTopic {
  id: string;
  title: string;
  description: string;
  /**
   * When set, the topic's queries are executed by the backend from the
   * topic's own trimmed SQL (no Superset dataset involved).  Unset topics
   * still run on the shared legacy dataset (``ANALYSIS_DATASET_ID``).
   */
  backendSql?: boolean;
  /**
   * ``"wip"`` marks a topic that has not been migrated to backend SQL yet;
   * the UI shows a "未完工" badge and keeps the legacy dataset.
   */
  status?: "wip";
  icon: ReactNode;
  /** MUI palette token used by the topic card accent. */
  color: string;
  /**
   * Longest observation window used by the topic's KPI/table metrics.  When
   * set, totals and breakdown queries end this many days before today so they
   * only aggregate mature cohorts.
   */
  maturityDays?: number;
  /** Catalog of metrics referenced by the KPI, trend and breakdown configs. */
  metrics: Record<string, AnalysisMetric>;
  /** Metric-catalog keys shown as KPI cards. */
  kpis: string[];
  trend: {
    series: AnalysisTrendSeries[];
    /** Optional note shown above the trend chart (observation windows, etc.). */
    note?: string;
  };
  /**
   * Metric-catalog key used for the dashed previous-period line and anomaly
   * detection.  Defaults to the first trend series.
   */
  comparisonMetric?: string;
  dimensions: AnalysisDimension[];
  defaultDimension: string;
  /**
   * Filter-bar controls the topic hides.  A topic whose own view owns one of
   * the dimensions (for example the project comparison selects projects in
   * its own picker) hides that global filter to avoid two competing scopes;
   * values carried in the URL are ignored as well, so the visible scope always
   * matches the effective one.
   */
  hiddenFilters?: string[];
  /**
   * Preferred order of the remaining column filters (filter keys).  Filters not
   * listed keep the shared definition order after the pinned ones.
   */
  filterOrder?: string[];
  /**
   * Standard sections this topic replaces with its extra view.  The hidden
   * sections are neither rendered nor queried, so a comparison view never pays
   * for a KPI / trend / breakdown scan it does not show.
   */
  hiddenSections?: AnalysisPageSection[];
  /**
   * Hide the date-range control.  Used by the project comparison, whose
   * observation window (基准 + 窗口) replaces the page date range.
   */
  hideDateRange?: boolean;
  /**
   * Ordered hierarchy used by row drill-down.  A row click keeps the current
   * value as a filter and moves the table to the next dimension.  Defaults to
   * the order of {@link dimensions} when omitted.
   */
  drilldownPath?: string[];
  breakdown: {
    /** Metric-catalog keys shown in the breakdown table. */
    metrics: string[];
    /** Metric-catalog key used for the default sort. */
    orderBy: string;
  };
  extra?: AnalysisExtraView;
}
