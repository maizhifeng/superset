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
}

export interface AnalysisDimension {
  key: string;
  label: string;
}

export type AnalysisChartType = "bar" | "line";
export type AnalysisAxis = "left" | "right";

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
  "retention-matrix" | "ltv-roi" | "efficiency-scatter";

export interface AnalysisExtraView {
  type: AnalysisExtraViewType;
  title: string;
  description?: string;
  /** Extra metrics the totals query must fetch for this view. */
  totalsMetrics?: string[];
  /** Extra metrics the breakdown query must fetch for this view. */
  breakdownMetrics?: string[];
}

export interface AnalysisTopic {
  id: string;
  title: string;
  description: string;
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
