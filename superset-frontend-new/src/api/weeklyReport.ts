import api from "@/api";

const DATASOURCE = { id: 26, type: "table" as const };

type SupersetMetric =
  | {
      expressionType: "SIMPLE";
      column: { column_name: string };
      aggregate: string;
      label: string;
    }
  | string;

interface ReportRow {
  主游戏?: string;
  渠道商?: string;
  媒体?: string;
  平台?: string;
  日期?: number;
  "SUM(ad_real_cost)"?: number;
  "SUM(n_unum)"?: number;
  roi_1?: number;
  ltv_1?: number;
  ltv_2?: number;
  ltv_3?: number;
  ltv_4?: number;
  ltv_5?: number;
  ltv_6?: number;
  ltv_7?: number;
  [key: string]: unknown;
}

type Row = ReportRow;

const COST_METRIC: SupersetMetric = {
  expressionType: "SIMPLE",
  column: { column_name: "返点后消耗" },
  aggregate: "SUM",
  label: "SUM(ad_real_cost)",
};

const USER_METRIC: SupersetMetric = {
  expressionType: "SIMPLE",
  column: { column_name: "新增进入" },
  aggregate: "SUM",
  label: "SUM(n_unum)",
};

const CPA_METRIC: SupersetMetric = "cpa";
const ROI1_METRIC: SupersetMetric = "roi_1";
const LTV1_METRIC: SupersetMetric = "ltv_1";
const LTV_METRICS: SupersetMetric[] = [
  "ltv_1",
  "ltv_2",
  "ltv_3",
  "ltv_4",
  "ltv_5",
  "ltv_6",
  "ltv_7",
];

const BASE_METRICS: SupersetMetric[] = [
  COST_METRIC,
  USER_METRIC,
  CPA_METRIC,
  ROI1_METRIC,
  LTV1_METRIC,
];

const COL = {
  MEDIA: "媒体",
  CHANNEL: "渠道商",
  PLATFORM: "平台",
  PROJECT: "主游戏",
  DATE: "日期",
  COST: "SUM(ad_real_cost)",
  USERS: "SUM(n_unum)",
} as const;

const MIN_DISPLAY_RATIO = 0.01;
const DISPLAY_SAFEGUARD_MIN = 5;

const LTV_KEYS = [
  "ltv_1",
  "ltv_2",
  "ltv_3",
  "ltv_4",
  "ltv_5",
  "ltv_6",
  "ltv_7",
];
const LTV_COLS = ["LTV1", "LTV2", "LTV3", "LTV4", "LTV5", "LTV6", "LTV7"];

function fmt(v: unknown, decimals = 2): string {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(decimals);
  }
  return String(v);
}

function fmtLtvRow(v: number[]): string {
  return v.length === 7
    ? v.map((x) => fmt(x)).join(" | ")
    : LTV_COLS.map(() => "-").join(" | ");
}

function parseBatchResult(resp: unknown): { rows: Row[]; cols: string[] } {
  if (resp == null || typeof resp !== "object") return { rows: [], cols: [] };
  const r = resp as { data?: Row[]; colnames?: string[] };
  return { rows: r.data ?? [], cols: r.colnames ?? [] };
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00`;
}

function weekLabel(ts: number, w1Start: Date, w2Start: Date): string {
  if (ts == null || Number.isNaN(ts)) return "";
  const w1Ms = w1Start.getTime();
  const w2Ms = w2Start.getTime();
  if (ts >= w2Ms) return "W2";
  if (ts >= w1Ms) return "W1";
  return "";
}

function extractDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export interface WeeklyReportData {
  summaryContext: string;
  week1Label: string;
  week2Label: string;
}

function getLastTwoWeekBounds() {
  const now = new Date();
  const currentSun = new Date(now);
  currentSun.setDate(now.getDate() - now.getDay());
  currentSun.setHours(0, 0, 0, 0);

  const w2End = new Date(currentSun);
  w2End.setDate(currentSun.getDate() - 1);
  const w2Start = new Date(w2End);
  w2Start.setDate(w2End.getDate() - 6);
  w2Start.setHours(0, 0, 0, 0);

  const w1End = new Date(w2Start);
  w1End.setDate(w2Start.getDate() - 1);
  const w1Start = new Date(w1End);
  w1Start.setDate(w1End.getDate() - 6);
  w1Start.setHours(0, 0, 0, 0);

  const rangeStr = `${formatISODate(w1Start)} : ${formatISODate(currentSun)}`;
  return { w1Start, w1End, w2Start, w2End, rangeStr };
}

interface ProjAccum {
  cost: number;
  users: number;
  roi1Weighted: number;
  ltv1Weighted: number;
}

function rankAndGroup(
  w1Map: Map<string, ProjAccum>,
  w2Map: Map<string, ProjAccum>,
  maxItems: number,
): string[] {
  const totalW2 = [...w2Map.values()].reduce((s, v) => s + v.cost, 0);
  const threshold = totalW2 * MIN_DISPLAY_RATIO;
  const items = [...new Set([...w1Map.keys(), ...w2Map.keys()])]
    .filter(
      (n) => (w1Map.get(n)?.cost ?? 0) > 0 || (w2Map.get(n)?.cost ?? 0) > 0,
    )
    .map((n) => ({ name: n, w2Cost: w2Map.get(n)?.cost ?? 0 }))
    .sort((a, b) => b.w2Cost - a.w2Cost);
  const topNames: string[] = [];
  const otherItems: string[] = [];
  for (const item of items) {
    if (
      topNames.length < maxItems &&
      (item.w2Cost >= threshold || topNames.length < DISPLAY_SAFEGUARD_MIN)
    ) {
      topNames.push(item.name);
    } else {
      otherItems.push(item.name);
    }
  }
  if (otherItems.length > 0) {
    const w1o: ProjAccum = {
      cost: 0,
      users: 0,
      roi1Weighted: 0,
      ltv1Weighted: 0,
    };
    const w2o: ProjAccum = {
      cost: 0,
      users: 0,
      roi1Weighted: 0,
      ltv1Weighted: 0,
    };
    for (const n of otherItems) {
      const d1 = w1Map.get(n);
      if (d1) {
        w1o.cost += d1.cost;
        w1o.users += d1.users;
        w1o.roi1Weighted += d1.roi1Weighted;
        w1o.ltv1Weighted += d1.ltv1Weighted;
      }
      const d2 = w2Map.get(n);
      if (d2) {
        w2o.cost += d2.cost;
        w2o.users += d2.users;
        w2o.roi1Weighted += d2.roi1Weighted;
        w2o.ltv1Weighted += d2.ltv1Weighted;
      }
    }
    w1Map.set("其他", w1o);
    w2Map.set("其他", w2o);
    topNames.push("其他");
  }
  return topNames;
}

function fmtMetrics(d: ProjAccum | undefined): [string, string, string] {
  if (!d || d.cost === 0) return ["-", "-", "-"];
  const cpa = d.users > 0 ? fmt(d.cost / d.users) : "-";
  const roi1 =
    d.cost > 0 ? `${((d.roi1Weighted / d.cost) * 100).toFixed(1)}%` : "-";
  const ltv1 = d.users > 0 ? fmt(d.ltv1Weighted / d.users) : "-";
  return [cpa, roi1, ltv1];
}

function buildWeekBlock(
  names: string[],
  getData: (n: string) => ProjAccum | undefined,
  extraGet: (n: string) => string[],
  writeExtraSum: (
    cost: number,
    users: number,
    roi1W: number,
    ltv1W: number,
  ) => string,
): {
  rows: string[];
  cost: number;
  users: number;
  roi1W: number;
  ltv1W: number;
} {
  const rows: string[] = [];
  let cost = 0,
    users = 0,
    roi1W = 0,
    ltv1W = 0;

  for (const n of names) {
    const d = getData(n);
    if (!d || d.cost === 0) continue;
    cost += d.cost;
    users += d.users;
    roi1W += d.roi1Weighted;
    ltv1W += d.ltv1Weighted;
    rows.push(
      `| | ${n} | ${fmt(d.cost, 0)} | ${fmt(d.users, 0)} | ${extraGet(n)} |`,
    );
  }
  rows.push(
    `| | **合计** | **${fmt(cost, 0)}** | **${fmt(users, 0)}** | ${writeExtraSum(cost, users, roi1W, ltv1W)} |`,
  );

  return { rows, cost, users, roi1W, ltv1W };
}

function dimensionTable(
  headerCol: string,
  names: string[],
  getW1: (n: string) => ProjAccum | undefined,
  getW2: (n: string) => ProjAccum | undefined,
  extraCols: string[],
  extraW1: (n: string) => string[],
  extraW2: (n: string) => string[],
  week1Label: string,
  week2Label: string,
): string[] {
  const lines: string[] = [];
  const allCols = ["星期", headerCol, "消耗", "新增用户", ...extraCols];
  lines.push(`| ${allCols.join(" | ")} |`);
  lines.push(`|${allCols.map(() => "------").join("|")}|`);

  function writeExtraSum(
    cost: number,
    users: number,
    roi1W: number,
    ltv1W: number,
  ): string {
    return extraCols
      .map((col) => {
        if (col === "CPA" && users > 0) return fmt(cost / users, 2);
        if (col === "ROI1" && cost > 0)
          return `${fmt((roi1W / cost) * 100, 1)}%`;
        if (col === "LTV1" && users > 0) return fmt(ltv1W / users, 2);
        return "-";
      })
      .join(" | ");
  }

  lines.push(`| **${week1Label}** | | | | |`);
  lines.push(
    ...buildWeekBlock(names, getW1, (n) => extraW1(n), writeExtraSum).rows,
  );

  lines.push(`| **${week2Label}** | | | | |`);
  lines.push(
    ...buildWeekBlock(names, getW2, (n) => extraW2(n), writeExtraSum).rows,
  );

  return lines;
}

function accumulateDimension(
  rows: Row[],
  nameField: string,
  w1Start: Date,
  w2Start: Date,
) {
  const w1 = new Map<string, ProjAccum>();
  const w2 = new Map<string, ProjAccum>();

  for (const r of rows) {
    const wl = weekLabel(Number(r[COL.DATE]), w1Start, w2Start);
    const name = String(r[nameField] ?? "");
    if (!name) continue;
    const map = wl === "W2" ? w2 : w1;
    const prev = map.get(name) ?? {
      cost: 0,
      users: 0,
      roi1Weighted: 0,
      ltv1Weighted: 0,
    };
    const cost = Number(r[COL.COST]) || 0;
    const users = Number(r[COL.USERS]) || 0;
    prev.cost += cost;
    prev.users += users;
    prev.roi1Weighted += (Number(r.roi_1) || 0) * cost;
    prev.ltv1Weighted += (Number(r.ltv_1) || 0) * users;
    map.set(name, prev);
  }

  return { w1Map: w1, w2Map: w2 };
}

export async function fetchWeeklyReportData(): Promise<WeeklyReportData> {
  const baseQuery = {
    datasource: DATASOURCE,
    result_format: "json" as const,
    result_type: "full" as const,
  };

  const bounds = getLastTwoWeekBounds();
  const { w1Start, w1End, w2Start, w2End } = bounds;

  const twoWeekFilter = {
    granularity: "日期" as const,
    time_range: bounds.rangeStr,
  };

  const orderDesc = [[COL.COST, false]];

  const ltvQueryMetrics: SupersetMetric[] = [
    COST_METRIC,
    USER_METRIC,
    CPA_METRIC,
    ROI1_METRIC,
    ...LTV_METRICS,
  ];

  const resp = await api.post("/chart/data", {
    ...baseQuery,
    queries: [
      {
        metrics: BASE_METRICS,
        columns: [COL.MEDIA, COL.DATE],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 500,
      },
      {
        metrics: BASE_METRICS,
        columns: [COL.CHANNEL, COL.DATE],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 500,
      },
      {
        metrics: BASE_METRICS,
        columns: [COL.PLATFORM, COL.DATE],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 500,
      },
      {
        metrics: ltvQueryMetrics,
        columns: [COL.PROJECT, COL.DATE],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 1000,
      },
    ],
  });

  const results =
    (resp as { data?: { result?: unknown[] } }).data?.result ?? [];
  const parseAt = (idx: number) => parseBatchResult(results[idx]);
  const rMedia = parseAt(0);
  const rChannel = parseAt(1);
  const rPlatform = parseAt(2);
  const rLtvTrend = parseAt(3);

  const week1Label = `${extractDateStr(w1Start.getTime())}-${extractDateStr(w1End.getTime())}`;
  const week2Label = `${extractDateStr(w2Start.getTime())}-${extractDateStr(w2End.getTime())}`;

  const sections: string[] = [];

  const { w1Map: mediaW1, w2Map: mediaW2 } = accumulateDimension(
    rMedia.rows,
    COL.MEDIA,
    w1Start,
    w2Start,
  );
  const { w1Map: channelW1, w2Map: channelW2 } = accumulateDimension(
    rChannel.rows,
    COL.CHANNEL,
    w1Start,
    w2Start,
  );
  const { w1Map: platformW1, w2Map: platformW2 } = accumulateDimension(
    rPlatform.rows,
    COL.PLATFORM,
    w1Start,
    w2Start,
  );

  const allMediaNames = rankAndGroup(mediaW1, mediaW2, 12);
  const allChannelNames = rankAndGroup(channelW1, channelW2, 12);
  const allPlatformNames = rankAndGroup(platformW1, platformW2, 12);

  sections.push("## 核心指标概览", "");
  sections.push(
    ...dimensionTable(
      "平台",
      allPlatformNames,
      (n) => platformW1.get(n),
      (n) => platformW2.get(n),
      ["CPA", "ROI1", "LTV1"],
      (n) => fmtMetrics(platformW1.get(n)),
      (n) => fmtMetrics(platformW2.get(n)),
      week1Label,
      week2Label,
    ),
  );
  sections.push("");

  interface PcDay {
    wl: string;
    cost: number;
    users: number;
    roi1Weighted: number;
    ltvVals: number[];
  }
  const pcDays = new Map<string, PcDay[]>();

  for (const r of rLtvTrend.rows) {
    const proj = String(r[COL.PROJECT] ?? "");
    if (!proj) continue;
    const ts = Number(r[COL.DATE]);
    if (!ts || Number.isNaN(ts)) continue;
    const wl = weekLabel(ts, w1Start, w2Start);
    if (!wl) continue;
    const ltvVals = LTV_KEYS.map((k) => Number(r[k]) || 0);
    const cost = Number(r[COL.COST]) || 0;
    const users = Number(r[COL.USERS]) || 0;
    if (!pcDays.has(proj)) pcDays.set(proj, []);
    pcDays.get(proj)!.push({
      wl,
      cost,
      users,
      roi1Weighted: (Number(r.roi_1) || 0) * cost,
      ltvVals,
    });
  }

  interface PcAvg {
    w1Cost: number;
    w1Users: number;
    w1Roi1W: number;
    w1: number[];
    w2Cost: number;
    w2Users: number;
    w2Roi1W: number;
    w2: number[];
    totalCost: number;
  }
  const pcAvg = new Map<string, PcAvg>();
  for (const [key, days] of pcDays) {
    const w1D = days.filter((d) => d.wl === "W1");
    const w2D = days.filter((d) => d.wl === "W2");
    const avg = (arr: number[][]) =>
      arr.length > 0
        ? arr[0].map((_, i) => arr.reduce((s, v) => s + v[i], 0) / arr.length)
        : [];
    pcAvg.set(key, {
      w1Cost: w1D.reduce((s, d) => s + d.cost, 0),
      w1Users: w1D.reduce((s, d) => s + d.users, 0),
      w1Roi1W: w1D.reduce((s, d) => s + d.roi1Weighted, 0),
      w1: avg(w1D.map((d) => d.ltvVals)),
      w2Cost: w2D.reduce((s, d) => s + d.cost, 0),
      w2Users: w2D.reduce((s, d) => s + d.users, 0),
      w2Roi1W: w2D.reduce((s, d) => s + d.roi1Weighted, 0),
      w2: avg(w2D.map((d) => d.ltvVals)),
      totalCost: [...w1D, ...w2D].reduce((s, d) => s + d.cost, 0),
    });
  }

  const pcSorted = [...pcAvg.entries()]
    .filter(([, v]) => v.totalCost > 0)
    .sort((a, b) => b[1].totalCost - a[1].totalCost);

  if (pcSorted.length > 0) {
    sections.push("## 分项目数据", "");
    const allCols = [
      "星期",
      "项目",
      "消耗",
      "新增用户",
      "CPA",
      "ROI1",
      ...LTV_COLS,
      "增长系数",
    ];
    sections.push(`| ${allCols.join(" | ")} |`);
    sections.push(`|${allCols.map(() => "------").join("|")}|`);

    for (const [projName, d] of pcSorted) {
      const coef1 = d.w1[6] && d.w1[0] ? (d.w1[6] / d.w1[0]).toFixed(2) : "-";
      const coef2 = d.w2[6] && d.w2[0] ? (d.w2[6] / d.w2[0]).toFixed(2) : "-";
      const cpa1 = d.w1Users > 0 ? fmt(d.w1Cost / d.w1Users) : "-";
      const cpa2 = d.w2Users > 0 ? fmt(d.w2Cost / d.w2Users) : "-";
      const roi1_1 =
        d.w1Cost > 0 ? `${((d.w1Roi1W / d.w1Cost) * 100).toFixed(1)}%` : "-";
      const roi1_2 =
        d.w2Cost > 0 ? `${((d.w2Roi1W / d.w2Cost) * 100).toFixed(1)}%` : "-";
      sections.push(
        `| **${week1Label}** | ${projName} ` +
          `| ${fmt(d.w1Cost, 0)} | ${fmt(d.w1Users, 0)} | ${cpa1} | ${roi1_1} ` +
          `| ${fmtLtvRow(d.w1)} | ${coef1} |`,
      );
      sections.push(
        `| **${week2Label}** | ${projName} ` +
          `| ${fmt(d.w2Cost, 0)} | ${fmt(d.w2Users, 0)} | ${cpa2} | ${roi1_2} ` +
          `| ${fmtLtvRow(d.w2)} | ${coef2} |`,
      );
    }
    sections.push("");
  }

  sections.push("## 分渠道商数据", "");
  sections.push(
    ...dimensionTable(
      "渠道商名称",
      allChannelNames,
      (n) => channelW1.get(n),
      (n) => channelW2.get(n),
      ["CPA", "ROI1", "LTV1"],
      (n) => fmtMetrics(channelW1.get(n)),
      (n) => fmtMetrics(channelW2.get(n)),
      week1Label,
      week2Label,
    ),
  );
  sections.push("");

  sections.push("## 分媒体数据", "");
  sections.push(
    ...dimensionTable(
      "媒体名称",
      allMediaNames,
      (n) => mediaW1.get(n),
      (n) => mediaW2.get(n),
      ["CPA", "ROI1", "LTV1"],
      (n) => fmtMetrics(mediaW1.get(n)),
      (n) => fmtMetrics(mediaW2.get(n)),
      week1Label,
      week2Label,
    ),
  );
  sections.push("");

  return { summaryContext: sections.join("\n"), week1Label, week2Label };
}
