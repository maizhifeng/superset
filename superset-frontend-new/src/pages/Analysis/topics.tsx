import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CampaignIcon from "@mui/icons-material/Campaign";
import type { AdhocMetric } from "@/utils/query/types";
import type {
  AnalysisMetric,
  AnalysisMetricFormat,
  AnalysisTopic,
} from "./types";

/**
 * Analysis topics share one federated dataset.  The dataset id and the time
 * column live here because the query builder, the filter-value loader and the
 * page all need them.
 */
export const ANALYSIS_DATASET_ID = 26;
export const ANALYSIS_TIME_COLUMN = "日期";

/**
 * Paid-retention milestones available for the 30-day observation window.  The
 * dataset also exposes 60/90-day columns, but a 30-day topic window cannot
 * mature them, so they are intentionally left out for now.
 */
export const PAID_RETENTION_DAYS = [2, 3, 4, 5, 6, 7, 14, 21, 30];

/**
 * Milestones used by the LTV / ROI recovery curves.  Milestones beyond the
 * topic observation window would still be immature for the selected cohorts,
 * so the first version stops at day 30.
 */
export const LTV_ROI_DAYS = [1, 3, 7, 14, 30];

/** Aggregate a raw dataset column; the dataset defines no saved SUM metrics. */
function sum(column: string): AdhocMetric {
  return {
    expressionType: "SIMPLE",
    column: { column_name: column },
    aggregate: "SUM",
    label: column,
  };
}

function metric(
  key: string,
  label: string,
  format: AnalysisMetricFormat,
  metricValue: string | AdhocMetric,
  description?: string,
  maturityDays?: number,
): AnalysisMetric {
  return {
    key,
    label,
    format,
    metric: metricValue,
    description,
    ...(maturityDays ? { maturityDays } : {}),
  };
}

const number = (
  key: string,
  label: string,
  metricValue: string | AdhocMetric,
  description?: string,
) => metric(key, label, "number", metricValue, description);

const percent = (
  key: string,
  label: string,
  metricValue: string | AdhocMetric,
  description?: string,
  maturityDays?: number,
) => metric(key, label, "percent", metricValue, description, maturityDays);

const decimal = (
  key: string,
  label: string,
  metricValue: string | AdhocMetric,
  description?: string,
  maturityDays?: number,
) => metric(key, label, "decimal", metricValue, description, maturityDays);

/** Mark metrics where an increase is desirable (ROI, retention, LTV, ...). */
const higherBetter = (metricDef: AnalysisMetric): AnalysisMetric => ({
  ...metricDef,
  higherIsBetter: true,
});

/** Mark metrics where an increase is undesirable (CPA, cost per payer, ...). */
const lowerBetter = (metricDef: AnalysisMetric): AnalysisMetric => ({
  ...metricDef,
  higherIsBetter: false,
});

/** Common additive metrics. */
const spend = number("消耗", "消耗", sum("消耗"), "投放消耗（未扣返点）");
const netSpend = number(
  "返点后消耗",
  "返点后消耗",
  sum("返点后消耗"),
  "扣除返点后的实际消耗",
);
const newUsers = number(
  "新增进入",
  "新增进入",
  sum("新增进入"),
  "统计周期内进入游戏的新增用户数",
);
const revenue1 = number("1日充值", "1日充值", sum("1日充值"));
const revenue = number("充值流水", "充值流水", sum("充值流水"));
const cumulativeRevenue = number(
  "累计充值",
  "累计充值",
  sum("累计充值"),
  "用户生命周期内的累计充值",
);
const payers1 = number("1日付费数", "1日付费数", sum("1日付费数"));
const activePayers = number("活跃付费", "活跃付费", sum("活跃付费"));
const cumulativePayers = number("累计付费数", "累计付费数", sum("累计付费数"));

const cpa = lowerBetter(decimal("cpa", "CPA", "cpa", "返点后消耗 / 新增进入"));
const cpp = lowerBetter(
  decimal("cpp", "CPP", "cpp", "返点后消耗 / 1日付费数（单付费用户获客成本）"),
);
const revenueRoi = higherBetter(
  percent("流水ROI", "流水ROI", "流水ROI", "充值流水 / 返点后消耗"),
);
const payRate1 = higherBetter(
  percent("1日付费率", "1日付费率", "1日付费率", "1日付费数 / 新增进入", 1),
);
const retention2 = higherBetter(
  percent("2日留存率", "2日留存率", "2日留存率", "2日留存数 / 新增进入", 2),
);
const naturalNew = higherBetter(
  percent("自然新增%", "自然新增%", "自然新增%", "自然量新增 / 全部新增"),
);
const cumulativeRoi = higherBetter(
  percent("累计roi", "累计ROI", "累计roi", "累计充值 / 返点后消耗"),
);

function roi(day: number): AnalysisMetric {
  return higherBetter(
    percent(
      `roi_${day}`,
      `ROI-第${day}天`,
      `roi_${day}`,
      `第${day}天充值 / 返点后消耗`,
      day,
    ),
  );
}

function ltv(day: number): AnalysisMetric {
  return higherBetter(
    decimal(
      `ltv_${day}`,
      `LTV-第${day}天`,
      `ltv_${day}`,
      `第${day}天充值 / 新增进入`,
      day,
    ),
  );
}

function paidRetention(day: number): AnalysisMetric {
  return higherBetter(
    percent(
      `${day}日付费留存率`,
      `${day}日付费留存率`,
      `${day}日付费留存率`,
      `${day}日付费留存数 / 1日付费数`,
      day,
    ),
  );
}

const GAME_DIMENSIONS = [
  { key: "主游戏", label: "主游戏" },
  { key: "媒体", label: "媒体" },
  { key: "渠道商", label: "渠道商" },
  { key: "平台", label: "平台" },
  { key: "地区", label: "地区" },
];

const paidRetentionMetrics = Object.fromEntries(
  PAID_RETENTION_DAYS.map((day) => [`${day}日付费留存率`, paidRetention(day)]),
) as Record<string, AnalysisMetric>;

// Breakdown-table aliases: the cost table shows the day-1 payback columns.
const ltv1Column = { ...ltv(1), label: "LTV1" };
const roi1Column = { ...roi(1), label: "ROI1" };

const ltvRoiMetrics = Object.fromEntries([
  ...LTV_ROI_DAYS.map((day) => [`ltv_${day}`, ltv(day)]),
  ...LTV_ROI_DAYS.map((day) => [`roi_${day}`, roi(day)]),
]) as Record<string, AnalysisMetric>;

export const ANALYSIS_TOPICS: AnalysisTopic[] = [
  {
    id: "cost",
    title: "成本分析",
    description:
      "按日期、游戏、媒体与渠道拆解消耗和新增，跟踪 CPA 与回收效率。",
    icon: <RequestQuoteIcon sx={{ fontSize: 22 }} />,
    color: "primary.main",
    metrics: {
      spend,
      netSpend,
      newUsers,
      cpa,
      cpp,
      revenue1,
      roi7: roi(7),
      naturalNew,
      revenueRoi,
      ltv1: ltv1Column,
      roi1: roi1Column,
    },
    kpis: ["spend", "netSpend", "newUsers", "cpa", "cpp"],
    trend: {
      series: [
        { metric: "netSpend", type: "bar", axis: "left" },
        { metric: "cpa", type: "line", axis: "right", weightBy: "newUsers" },
      ],
    },
    comparisonMetric: "cpa",
    dimensions: GAME_DIMENSIONS,
    defaultDimension: "主游戏",
    drilldownPath: ["主游戏", "渠道商", "媒体"],
    breakdown: {
      metrics: [
        "spend",
        "netSpend",
        "newUsers",
        "naturalNew",
        "cpa",
        "cpp",
        "ltv1",
        "roi1",
      ],
      orderBy: "netSpend",
    },
  },
  {
    id: "retention",
    title: "留存分析",
    description: "查看新增与付费留存走势，按游戏、媒体与渠道对比长期留存质量。",
    icon: <AutorenewIcon sx={{ fontSize: 22 }} />,
    color: "success.main",
    maturityDays: 30,
    metrics: {
      newUsers,
      payers1,
      payRate1,
      retention2,
      paidRetention2: paidRetention(2),
      paidRetention7: paidRetention(7),
      paidRetention30: paidRetention(30),
      ...paidRetentionMetrics,
    },
    kpis: [
      "newUsers",
      "retention2",
      "payers1",
      "payRate1",
      "paidRetention7",
      "paidRetention30",
    ],
    trend: {
      series: [
        {
          metric: "retention2",
          type: "line",
          axis: "left",
          weightBy: "newUsers",
        },
        // 1-day pay rate is an order of magnitude below the 16-47% retention
        // rates; on a shared axis its line collapses into a flat band, so it
        // gets its own right-hand scale.
        {
          metric: "payRate1",
          type: "line",
          axis: "right",
          weightBy: "newUsers",
        },
        {
          metric: "paidRetention7",
          type: "line",
          axis: "left",
          weightBy: "payers1",
        },
      ],
      note: "留存指标有观察窗口：最近 2/7/30 天尚未成熟，对应曲线尾部会留空而不是记作 0。",
    },
    dimensions: GAME_DIMENSIONS,
    defaultDimension: "主游戏",
    drilldownPath: ["主游戏", "渠道商", "媒体"],
    breakdown: {
      metrics: [
        "newUsers",
        "payers1",
        "retention2",
        "payRate1",
        "paidRetention2",
        "paidRetention7",
        "paidRetention30",
      ],
      orderBy: "newUsers",
    },
    extra: {
      type: "retention-matrix",
      title: "付费留存矩阵",
      description:
        "行是当前维度，列是付费留存天数；付费留存率 = N日付费留存数 / 1日付费数。",
      breakdownMetrics: PAID_RETENTION_DAYS.map((day) => `${day}日付费留存率`),
    },
  },
  {
    id: "ltv-roi",
    title: "LTV / ROI 分析",
    description: "对比不同回收周期的 LTV 与 ROI，评估获客投入的长期回报。",
    icon: <TrendingUpIcon sx={{ fontSize: 22 }} />,
    color: "info.main",
    maturityDays: 30,
    metrics: {
      newUsers,
      netSpend,
      ...ltvRoiMetrics,
      cumulativeRoi,
    },
    kpis: ["ltv_1", "ltv_7", "ltv_30", "roi_1", "roi_7", "cumulativeRoi"],
    trend: {
      series: [
        { metric: "ltv_7", type: "line", axis: "left", weightBy: "newUsers" },
        { metric: "roi_7", type: "line", axis: "right", weightBy: "netSpend" },
      ],
      note: "LTV7 / ROI7 需要 7 天观察窗口，最近 7 天的曲线尾部会留空。",
    },
    dimensions: GAME_DIMENSIONS,
    defaultDimension: "主游戏",
    drilldownPath: ["主游戏", "渠道商", "媒体"],
    breakdown: {
      metrics: [
        "newUsers",
        "ltv_1",
        "ltv_7",
        "ltv_30",
        "roi_1",
        "roi_7",
        "roi_30",
        "cumulativeRoi",
      ],
      orderBy: "newUsers",
    },
    extra: {
      type: "ltv-roi",
      title: "LTV / ROI 回收曲线",
      description:
        "横轴是回收天数（当前展示 1/3/7/14/30 天），LTV 以新增用户为单位，ROI 以返点后消耗为单位。",
      totalsMetrics: LTV_ROI_DAYS.map((day) => `ltv_${day}`).concat(
        LTV_ROI_DAYS.map((day) => `roi_${day}`),
      ),
    },
  },
  {
    id: "payment",
    title: "付费分析",
    description: "跟踪充值流水、付费人数与付费率，定位付费表现的变化。",
    icon: <AccountBalanceWalletIcon sx={{ fontSize: 22 }} />,
    color: "warning.main",
    metrics: {
      revenue,
      cumulativeRevenue,
      newUsers,
      payers1,
      payRate1,
      activePayers,
      cumulativePayers,
    },
    kpis: [
      "revenue",
      "cumulativeRevenue",
      "payers1",
      "payRate1",
      "activePayers",
      "cumulativePayers",
    ],
    trend: {
      series: [
        { metric: "revenue", type: "bar", axis: "left" },
        {
          metric: "payRate1",
          type: "line",
          axis: "right",
          weightBy: "newUsers",
        },
      ],
    },
    dimensions: GAME_DIMENSIONS,
    defaultDimension: "主游戏",
    drilldownPath: ["主游戏", "渠道商", "媒体"],
    breakdown: {
      metrics: [
        "revenue",
        "cumulativeRevenue",
        "payers1",
        "payRate1",
        "activePayers",
        "cumulativePayers",
      ],
      orderBy: "revenue",
    },
  },
  {
    id: "channel",
    title: "渠道 / 媒体分析",
    description: "按媒体与渠道商比较消耗、CPA 与回收，识别高效投放。",
    icon: <CampaignIcon sx={{ fontSize: 22 }} />,
    color: "secondary.main",
    metrics: {
      spend,
      netSpend,
      newUsers,
      cpa,
      revenue,
      revenueRoi,
    },
    kpis: ["spend", "netSpend", "newUsers", "cpa", "revenue", "revenueRoi"],
    trend: {
      series: [
        { metric: "netSpend", type: "bar", axis: "left" },
        {
          metric: "revenueRoi",
          type: "line",
          axis: "right",
          weightBy: "netSpend",
        },
      ],
    },
    dimensions: [
      { key: "媒体", label: "媒体" },
      { key: "渠道商", label: "渠道商" },
      { key: "平台", label: "平台" },
      { key: "主游戏", label: "主游戏" },
    ],
    defaultDimension: "媒体",
    drilldownPath: ["主游戏", "渠道商", "媒体"],
    breakdown: {
      metrics: [
        "spend",
        "netSpend",
        "newUsers",
        "cpa",
        "revenue",
        "revenueRoi",
      ],
      orderBy: "netSpend",
    },
    extra: {
      type: "efficiency-scatter",
      title: "投放效率分布",
      description:
        "横轴 CPA，纵轴流水 ROI（均为对数刻度），气泡大小代表返点后消耗；左上角（低 CPA、高 ROI）通常是高效渠道。",
    },
  },
];

export function getAnalysisTopic(
  topicId: string | undefined,
): AnalysisTopic | null {
  if (!topicId) return null;
  return ANALYSIS_TOPICS.find((topic) => topic.id === topicId) ?? null;
}

export function topicMetric(topic: AnalysisTopic, key: string): AnalysisMetric {
  const metricDef = topic.metrics[key];
  if (!metricDef) {
    throw new Error(`Unknown analysis metric: ${key}`);
  }
  return metricDef;
}

/**
 * Two catalog entries can point at the same response field (for example a
 * named KPI and the raw paid-retention column used by the matrix).  Dedupe by
 * the actual response key so the request never asks for the same metric twice.
 */
function dedupeMetrics(metrics: AnalysisMetric[]): AnalysisMetric[] {
  const seen = new Set<string>();
  return metrics.filter((metricDef) => {
    if (seen.has(metricDef.key)) return false;
    seen.add(metricDef.key);
    return true;
  });
}

/** Metric definitions used by the totals (KPI) query. */
export function totalsMetrics(topic: AnalysisTopic): AnalysisMetric[] {
  const keys = new Set([...topic.kpis, ...(topic.extra?.totalsMetrics ?? [])]);
  return dedupeMetrics([...keys].map((key) => topicMetric(topic, key)));
}

/** Metric definitions used by the trend query. */
export function trendMetrics(topic: AnalysisTopic): AnalysisMetric[] {
  const weights = topic.trend.series
    .map((series) => series.weightBy)
    .filter((key): key is string => Boolean(key));
  return dedupeMetrics(
    [...topic.trend.series.map((series) => series.metric), ...weights].map(
      (key) => topicMetric(topic, key),
    ),
  );
}

/** Metric definitions used by the breakdown query. */
export function breakdownMetrics(topic: AnalysisTopic): AnalysisMetric[] {
  const keys = new Set([
    ...topic.breakdown.metrics,
    ...(topic.extra?.breakdownMetrics ?? []),
  ]);
  return dedupeMetrics([...keys].map((key) => topicMetric(topic, key)));
}
