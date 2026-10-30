import dayjs from "dayjs";
import type { AnalysisAnomaly, DrillAnomaly } from "./anomalies";
import { formatMetricValue } from "./format";
import { totalsMetrics } from "./topics";
import type { AnalysisMetric, AnalysisTopic } from "./types";

export interface SummaryContributor {
  value: string;
  detail: DrillAnomaly;
}

/** One dimension's decomposition of the anomaly day. */
export interface SummaryBreakdown {
  dimensionLabel: string;
  contributors: SummaryContributor[];
}

export interface ViewSummaryInput {
  topic: AnalysisTopic;
  /** Aggregated row for the current statistics window (KPI totals). */
  totalsRow: Record<string, unknown> | null;
  /** Resolved statistics window, e.g. `2026-09-28 ~ 2026-10-27`. */
  windowLabel: string;
  windowDays: number;
  /** Metric the anomaly detector runs on. */
  metric: AnalysisMetric | null;
  anomaly: AnalysisAnomaly;
  /** Per-dimension decompositions (主游戏 → 渠道商 → 媒体). */
  breakdowns: SummaryBreakdown[];
}

/** Colouring intent for a highlighted number in the narrative. */
export type SummaryTone = "value" | "negative" | "positive" | "neutral";

export interface SummaryToken {
  text: string;
  tone?: SummaryTone;
}

/** One narrative paragraph: overview or one dimension's decomposition. */
export interface SummaryParagraph {
  key: string;
  tokens: SummaryToken[];
}

const plain = (text: string): SummaryToken => ({ text });
const value = (text: string): SummaryToken => ({ text, tone: "value" });

/** Large counts read more naturally in 万/亿 than in scientific notation. */
function readableValue(metric: AnalysisMetric, input: unknown): string {
  const numeric = Number(input);
  if (!Number.isFinite(numeric)) return formatMetricValue(metric, input);
  if (metric.format === "percent") {
    return formatMetricValue(metric, numeric);
  }
  const abs = Math.abs(numeric);
  const trim = (scaled: number) => {
    const scaledAbs = Math.abs(scaled);
    const digits = scaledAbs >= 1000 ? 0 : scaledAbs >= 10 ? 1 : 2;
    return scaled.toLocaleString("zh-CN", { maximumFractionDigits: digits });
  };
  if (abs >= 1e8) return `${trim(numeric / 1e8)} 亿`;
  if (abs >= 1e4) return `${trim(numeric / 1e4)} 万`;
  // Large plain numbers read better rounded to whole units.
  if (metric.format === "decimal" && abs >= 1000) {
    return numeric.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  }
  return formatMetricValue(metric, numeric);
}

function humanDate(input: string): string {
  const parsed = dayjs(input);
  if (parsed.isValid()) {
    return `${parsed.month() + 1} 月 ${parsed.date()} 日`;
  }
  const match = /^(\d{2})-(\d{2})$/.exec(input);
  if (match) return `${Number(match[1])} 月 ${Number(match[2])} 日`;
  return input;
}

function humanWindow(label: string): string {
  const [start, end] = label.split("~").map((part) => part.trim());
  if (!start || !end) return label;
  return `${humanDate(start)}至 ${humanDate(end)}`;
}

/** "高出 87.3%" / "低了 22.0%", still keeping the colour tone separate. */
function deltaTokens(
  direction: "up" | "down",
  text: string,
  tone: SummaryTone,
): SummaryToken[] {
  return [plain(direction === "up" ? "高出 " : "低了 "), { text, tone }];
}

/** The shared "当天 X，7 日移动平均 Y，高出 Z" clause. */
function describeMetrics(
  contributor: SummaryContributor,
  metric: AnalysisMetric,
): SummaryToken[] {
  const { detail } = contributor;
  return [
    plain(`当天 ${metric.label} `),
    value(readableValue(metric, detail.value)),
    plain("，7 日移动平均约 "),
    value(readableValue(metric, detail.baselineMean)),
    plain("，"),
    ...deltaTokens(detail.direction, detail.deltaText, detail.severity),
  ];
}

function topContributors(contributors: SummaryContributor[]): {
  list: SummaryContributor[];
  significant: boolean;
} {
  const significant = contributors.filter((item) => item.detail.significant);
  if (significant.length > 0) {
    return { list: significant.slice(0, 2), significant: true };
  }
  return {
    list: [...contributors]
      .sort(
        (left, right) =>
          Math.abs(right.detail.deltaValue) -
          Math.abs(left.detail.deltaValue),
      )
      .slice(0, 2),
    significant: false,
  };
}

/**
 * Turn the current view into plain-language paragraphs: a period overview plus
 * one paragraph per dimension (主游戏 / 渠道商 / 媒体). Numbers carry a tone so
 * the rendered narrative can colour the values that matter.
 */
export function buildViewSummary(input: ViewSummaryInput): SummaryParagraph[] {
  const {
    topic,
    totalsRow,
    windowLabel,
    windowDays,
    metric,
    anomaly,
    breakdowns,
  } = input;
  const paragraphs: SummaryParagraph[] = [];

  // 1) Overall picture in everyday wording.
  const overview: SummaryToken[] = [];
  // Only the topic's primary volume metric is called out in the overview
  // (for cost analysis that is 消耗; 返点后消耗 is deliberately omitted).
  const additive = totalsMetrics(topic)
    .filter((item) => item.format === "number")
    .slice(0, 1);
  const totalsParts: SummaryToken[][] = [];
  for (const [itemIndex, item] of additive.entries()) {
    const total = totalsRow ? totalsRow[item.key] : null;
    if (total === null || total === undefined) continue;
    const numeric = Number(total);
    const part: SummaryToken[] = [
      ...(itemIndex === 0 ? [plain("累计")] : []),
      plain(item.label),
      plain(" "),
      value(readableValue(item, numeric)),
    ];
    if (Number.isFinite(numeric) && windowDays > 0) {
      part.push(
        plain("，平均每天约 "),
        value(readableValue(item, numeric / windowDays)),
      );
    }
    totalsParts.push(part);
  }
  if (totalsParts.length > 0 && windowLabel) {
    overview.push(plain("过去 "), plain(`${windowDays}`), plain(" 天"));
    if (windowDays > 0) {
      overview.push(plain("（"), plain(humanWindow(windowLabel)), plain("），"));
    } else {
      overview.push(plain("，"));
    }
    totalsParts.forEach((part, index) => {
      if (index > 0) overview.push(plain("；"));
      overview.push(...part);
    });
    overview.push(plain("。"));
  }
  if (metric) {
    overview.push(
      plain("其中 "),
      plain(humanDate(anomaly.date)),
      plain("的 "),
      plain(metric.label),
      plain(" 为 "),
      value(readableValue(metric, anomaly.value)),
      plain("，比 7 日移动平均"),
      ...deltaTokens(anomaly.direction, anomaly.deltaText, anomaly.severity),
      plain("。"),
    );
  }
  if (overview.length > 0) {
    paragraphs.push({ key: "overview", tokens: overview });
  }

  if (!metric) return paragraphs;

  // 2) One conversational paragraph per dimension, in drill-path order.
  for (const breakdown of breakdowns) {
    const tokens: SummaryToken[] = [plain(`从${breakdown.dimensionLabel}来看，`)];
    const { list, significant } = topContributors(breakdown.contributors);
    if (list.length === 0) {
      tokens.push(plain("历史数据还不够，暂时无法判断。"));
    } else if (significant) {
      tokens.push(plain("主要来自「"), plain(list[0].value), plain("」："));
      tokens.push(...describeMetrics(list[0], metric));
      if (list[1]) {
        tokens.push(
          plain("；「"),
          plain(list[1].value),
          plain("」次之："),
          ...describeMetrics(list[1], metric),
        );
      }
      tokens.push(plain("。"));
    } else {
      tokens.push(plain("波动最大的是"));
      list.forEach((contributor, index) => {
        if (index > 0) tokens.push(plain("、"));
        tokens.push(plain("「"), plain(contributor.value), plain("」（"));
        tokens.push(...describeMetrics(contributor, metric));
        tokens.push(plain("）"));
      });
      tokens.push(plain("，但都没有达到异常判定标准。"));
    }
    paragraphs.push({
      key: `dimension-${breakdown.dimensionLabel}`,
      tokens,
    });
  }

  return paragraphs;
}
