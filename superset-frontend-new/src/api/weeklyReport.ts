import api from "@/api";

const DATASOURCE = { id: 26, type: "table" as const };

interface Row {
  [key: string]: unknown;
}

const COST_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "ad_real_cost" },
  aggregate: "SUM" as const,
  label: "SUM(ad_real_cost)",
};

const USER_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "n_unum" },
  aggregate: "SUM" as const,
  label: "SUM(n_unum)",
};

function fmt(v: unknown, decimals = 2): string {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(decimals);
  }
  return String(v);
}

function parseResult(resp: unknown) {
  const r = (resp as { data?: { result?: unknown[] } })?.data?.result?.[0] as
    | { data?: Row[]; colnames?: string[] }
    | undefined;
  return { rows: r?.data ?? [], cols: r?.colnames ?? [] };
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

function getLastTwoWeekBounds(): {
  w1Start: Date; w1End: Date; w2Start: Date; w2End: Date;
  rangeStr: string;
} {
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

export async function fetchWeeklyReportData(): Promise<WeeklyReportData> {
  const baseQuery = {
    datasource: DATASOURCE,
    result_format: "json" as const,
    result_type: "full" as const,
  };

  const bounds = getLastTwoWeekBounds();
  const { w1Start, w2Start } = bounds;

  const twoWeekFilter = {
    granularity: "report_date_calc" as const,
    time_range: bounds.rangeStr,
  };

  const orderDesc = [["SUM(ad_real_cost)", false]];

  const [q2, q3, q4, q5] = await Promise.all([
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"] as unknown[],
        columns: ["channel_name", "report_date_calc"],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 500,
      }],
    }),
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"] as unknown[],
        columns: ["cch_name", "report_date_calc"],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 500,
      }],
    }),
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"] as unknown[],
        columns: ["platform", "report_date_calc"],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 500,
      }],
    }),
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [
          COST_METRIC, USER_METRIC,
          "cpa", "roi_1",
          "ltv_1", "ltv_2", "ltv_3", "ltv_4", "ltv_5", "ltv_6", "ltv_7",
        ] as unknown[],
        columns: ["papp_name", "cch_name", "report_date_calc"],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 1000,
      }],
    }),
  ]);

  const rMedia = parseResult(q2);
  const rChannel = parseResult(q3);
  const rPlatform = parseResult(q4);
  const rLtvTrend = parseResult(q5);

  const week1Label = `${extractDateStr(w1Start.getTime())}-${extractDateStr(new Date(w1Start.getTime() + 6 * 86400000).getTime())}`;
  const week2Label = `${extractDateStr(w2Start.getTime())}-${extractDateStr(new Date(w2Start.getTime() + 6 * 86400000).getTime())}`;

  const sections: string[] = [];

  // --- Top project list and combined project+channel data ---
  const projCostMap = new Map<string, number>();
  for (const r of rLtvTrend.rows) {
    const name = String(r.papp_name ?? "");
    if (!name) continue;
    projCostMap.set(name, (projCostMap.get(name) ?? 0) + (Number(r["SUM(ad_real_cost)"]) || 0));
  }
  const allProjNames = [...projCostMap.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([n]) => n);

  interface ProjAccum { cost: number; users: number; cpa: number; roi1: number; ltv1: number }

  function rankAndGroup(
    w1Map: Map<string, ProjAccum | { cost: number; users: number }>,
    w2Map: Map<string, ProjAccum | { cost: number; users: number }>,
    maxItems: number,
  ): string[] {
    const totalW2 = [...w2Map.values()].reduce((s, v) => s + v.cost, 0);
    const threshold = totalW2 * 0.01;
    const items = [...new Set([...w1Map.keys(), ...w2Map.keys()])]
      .filter((n) => (w1Map.get(n)?.cost ?? 0) > 0 || (w2Map.get(n)?.cost ?? 0) > 0)
      .map((n) => ({ name: n, w2Cost: w2Map.get(n)?.cost ?? 0 }))
      .sort((a, b) => b.w2Cost - a.w2Cost);
    const topNames: string[] = [];
    const otherItems: string[] = [];
    for (const item of items) {
      if (topNames.length < maxItems && (item.w2Cost >= threshold || topNames.length < 5)) {
        topNames.push(item.name);
      } else {
        otherItems.push(item.name);
      }
    }
    if (otherItems.length > 0) {
      const w1o = { cost: 0, users: 0, cpa: 0, roi1: 0, ltv1: 0 };
      const w2o = { cost: 0, users: 0, cpa: 0, roi1: 0, ltv1: 0 };
      for (const n of otherItems) {
        const d1 = w1Map.get(n); if (d1) { w1o.cost += d1.cost; w1o.users += d1.users; }
        const d2 = w2Map.get(n); if (d2) { w2o.cost += d2.cost; w2o.users += d2.users; }
      }
      w1Map.set("其他", w1o as ProjAccum);
      w2Map.set("其他", w2o as ProjAccum);
      topNames.push("其他");
    }
    return topNames;
  }

  // --- Per-media aggregation ---
  const mediaW1 = new Map<string, ProjAccum>();
  const mediaW2 = new Map<string, ProjAccum>();

  for (const r of rMedia.rows) {
    const wl = weekLabel(Number(r.report_date_calc), w1Start, w2Start);
    const name = String(r.channel_name ?? "");
    if (!name) continue;
    const map = wl === "W2" ? mediaW2 : mediaW1;
    const prev = map.get(name) ?? { cost: 0, users: 0, cpa: 0, roi1: 0, ltv1: 0 };
    prev.cost += Number(r["SUM(ad_real_cost)"]) || 0;
    prev.users += Number(r["SUM(n_unum)"]) || 0;
    if (Number(r.cpa) > 0) prev.cpa = Number(r.cpa);
    if (Number(r.roi_1) > 0) prev.roi1 = Number(r.roi_1);
    if (Number(r.ltv_1) > 0) prev.ltv1 = Number(r.ltv_1);
    map.set(name, prev);
  }

  const allMediaNames = rankAndGroup(mediaW1, mediaW2, 12);

  // --- Per-channel partner aggregation ---
  const channelW1 = new Map<string, ProjAccum>();
  const channelW2 = new Map<string, ProjAccum>();

  for (const r of rChannel.rows) {
    const wl = weekLabel(Number(r.report_date_calc), w1Start, w2Start);
    const name = String(r.cch_name ?? "");
    if (!name) continue;
    const map = wl === "W2" ? channelW2 : channelW1;
    const prev = map.get(name) ?? { cost: 0, users: 0, cpa: 0, roi1: 0, ltv1: 0 };
    prev.cost += Number(r["SUM(ad_real_cost)"]) || 0;
    prev.users += Number(r["SUM(n_unum)"]) || 0;
    if (Number(r.cpa) > 0) prev.cpa = Number(r.cpa);
    if (Number(r.roi_1) > 0) prev.roi1 = Number(r.roi_1);
    if (Number(r.ltv_1) > 0) prev.ltv1 = Number(r.ltv_1);
    map.set(name, prev);
  }

  const allChannelNames = rankAndGroup(channelW1, channelW2, 12);

  // --- Per-platform aggregation ---
  const platformW1 = new Map<string, ProjAccum>();
  const platformW2 = new Map<string, ProjAccum>();

  for (const r of rPlatform.rows) {
    const wl = weekLabel(Number(r.report_date_calc), w1Start, w2Start);
    const name = String(r.platform ?? "");
    if (!name) continue;
    const map = wl === "W2" ? platformW2 : platformW1;
    const prev = map.get(name) ?? { cost: 0, users: 0, cpa: 0, roi1: 0, ltv1: 0 };
    prev.cost += Number(r["SUM(ad_real_cost)"]) || 0;
    prev.users += Number(r["SUM(n_unum)"]) || 0;
    if (Number(r.cpa) > 0) prev.cpa = Number(r.cpa);
    if (Number(r.roi_1) > 0) prev.roi1 = Number(r.roi_1);
    if (Number(r.ltv_1) > 0) prev.ltv1 = Number(r.ltv_1);
    map.set(name, prev);
  }

  const allPlatformNames = rankAndGroup(platformW1, platformW2, 12);

  // Helper to build a dimension table with W1/W2 row groups + per-group subtotal
  function dimensionTable(
    headerCol: string,
    names: string[],
    getW1: (n: string) => ProjAccum | { cost: number; users: number } | undefined,
    getW2: (n: string) => ProjAccum | { cost: number; users: number } | undefined,
    extraCols: string[],
    extraW1: (n: string) => string[],
    extraW2: (n: string) => string[],
  ): string[] {
    const lines: string[] = [];
    const allCols = ["星期", headerCol, "消耗", "新增用户", ...extraCols];
    lines.push(`| ${allCols.join(" | ")} |`);
    lines.push(`|${allCols.map(() => "------").join("|")}|`);

    function writeExtra(n: string, get: (n: string) => string[]): string {
      return get(n).join(" | ");
    }

    function writeExtraSum(
      cost: number, users: number,
      roi1Weighted: number, ltv1Weighted: number,
    ): string {
      return extraCols.map((col) => {
        if (col === "CPA" && users > 0) return fmt(cost / users, 2);
        if (col === "ROI1" && cost > 0) return fmt(roi1Weighted / cost, 1) + "%";
        if (col === "LTV1" && users > 0) return fmt(ltv1Weighted / users, 2);
        return "-";
      }).join(" | ");
    }

    let w1Cost = 0; let w1Users = 0; let w1Roi1W = 0; let w1Ltv1W = 0;

    lines.push(`| **${week1Label}** | | | |${"|"} `);
    for (const n of names) {
      const d = getW1(n);
      if (!d || d.cost === 0) continue;
      w1Cost += d.cost;
      w1Users += d.users;
      if ("roi1" in d && d.roi1) w1Roi1W += d.roi1 * d.cost;
      if ("ltv1" in d && d.ltv1) w1Ltv1W += d.ltv1 * d.users;
      lines.push(`| | ${n} | ${fmt(d.cost, 0)} | ${fmt(d.users, 0)} | ${writeExtra(n, extraW1)} |`);
    }
    lines.push(`| | **合计** | **${fmt(w1Cost, 0)}** | **${fmt(w1Users, 0)}** | ${writeExtraSum(w1Cost, w1Users, w1Roi1W, w1Ltv1W)} |`);

    let w2Cost = 0; let w2Users = 0; let w2Roi1W = 0; let w2Ltv1W = 0;

    lines.push(`| **${week2Label}** | | | |${"|"} `);
    for (const n of names) {
      const d = getW2(n);
      if (!d || d.cost === 0) continue;
      w2Cost += d.cost;
      w2Users += d.users;
      if ("roi1" in d && d.roi1) w2Roi1W += d.roi1 * d.cost;
      if ("ltv1" in d && d.ltv1) w2Ltv1W += d.ltv1 * d.users;
      lines.push(`| | ${n} | ${fmt(d.cost, 0)} | ${fmt(d.users, 0)} | ${writeExtra(n, extraW2)} |`);
    }
    lines.push(`| | **合计** | **${fmt(w2Cost, 0)}** | **${fmt(w2Users, 0)}** | ${writeExtraSum(w2Cost, w2Users, w2Roi1W, w2Ltv1W)} |`);

    return lines;
  }

  // --- Combined project+channel table (only top projects with valid channels) ---
  const projSet = new Set(allProjNames);
  const LTV_KEYS = ["ltv_1", "ltv_2", "ltv_3", "ltv_4", "ltv_5", "ltv_6", "ltv_7"];
  const LTV_COLS = ["LTV1", "LTV2", "LTV3", "LTV4", "LTV5", "LTV6", "LTV7"];

  interface PcDay { wl: string; cost: number; users: number; cpa: number; roi1: number; ltvVals: number[] }
  const pcDays = new Map<string, PcDay[]>();

  for (const r of rLtvTrend.rows) {
    const proj = String(r.papp_name ?? "");
    const ch = String(r.cch_name ?? "");
    if (!proj || !ch || !projSet.has(proj)) continue;
    const key = `${proj}::${ch}`;
    const ts = Number(r.report_date_calc);
    if (!ts || Number.isNaN(ts)) continue;
    const wl = weekLabel(ts, w1Start, w2Start);
    if (!wl) continue;
    const ltvVals = LTV_KEYS.map((k) => Number(r[k]) || 0);
    if (ltvVals.every((v) => v === 0)) continue;
    if (!pcDays.has(key)) pcDays.set(key, []);
    pcDays.get(key)!.push({
      wl, cost: Number(r["SUM(ad_real_cost)"]) || 0,
      users: Number(r["SUM(n_unum)"]) || 0,
      cpa: Number(r.cpa) || 0,
      roi1: Number(r.roi_1) || 0,
      ltvVals,
    });
  }

  interface PcAvg { w1Cost: number; w1Users: number; w1Cpa: number; w1Roi1: number; w1: number[];
    w2Cost: number; w2Users: number; w2Cpa: number; w2Roi1: number; w2: number[]; totalCost: number }
  const pcAvg = new Map<string, PcAvg>();
  for (const [key, days] of pcDays) {
    const w1D = days.filter((d) => d.wl === "W1");
    const w2D = days.filter((d) => d.wl === "W2");
    const avg = (arr: number[][]) =>
      arr.length > 0 ? arr[0].map((_, i) => arr.reduce((s, v) => s + v[i], 0) / arr.length) : [];
    pcAvg.set(key, {
      w1Cost: w1D.reduce((s, d) => s + d.cost, 0),
      w1Users: w1D.reduce((s, d) => s + d.users, 0),
      w1Cpa: w1D.length > 0 ? w1D.reduce((s, d) => s + d.cpa, 0) / w1D.length : 0,
      w1Roi1: w1D.length > 0 ? w1D.reduce((s, d) => s + d.roi1, 0) / w1D.length : 0,
      w1: avg(w1D.map((d) => d.ltvVals)),
      w2Cost: w2D.reduce((s, d) => s + d.cost, 0),
      w2Users: w2D.reduce((s, d) => s + d.users, 0),
      w2Cpa: w2D.length > 0 ? w2D.reduce((s, d) => s + d.cpa, 0) / w2D.length : 0,
      w2Roi1: w2D.length > 0 ? w2D.reduce((s, d) => s + d.roi1, 0) / w2D.length : 0,
      w2: avg(w2D.map((d) => d.ltvVals)),
      totalCost: [...w1D, ...w2D].reduce((s, d) => s + d.cost, 0),
    });
  }

  const projRank = new Map(allProjNames.map((n, i) => [n, i]));
  const pcSortedAll = [...pcAvg.entries()].sort((a, b) => {
    const pA = a[0].includes("::") ? a[0].slice(0, a[0].indexOf("::")) : a[0];
    const pB = b[0].includes("::") ? b[0].slice(0, b[0].indexOf("::")) : b[0];
    const rA = projRank.get(pA) ?? 999;
    const rB = projRank.get(pB) ?? 999;
    if (rA !== rB) return rA - rB;
    return b[1].totalCost - a[1].totalCost;
  });

  const totalW2 = pcSortedAll.reduce((s, [, v]) => s + v.w2Cost, 0);
  const costThreshold = totalW2 * 0.01;
  const pcSorted = pcSortedAll.filter(([, v]) => v.w2Cost >= costThreshold);

  if (pcSorted.length > 0) {
    sections.push("## 分项目数据", "");
    const allCols = ["星期", "项目", "渠道商", "消耗", "新增用户", "CPA", "ROI1", ...LTV_COLS, "增长系数"];
    sections.push(`| ${allCols.join(" | ")} |`);
    sections.push(`|${allCols.map(() => "------").join("|")}|`);

    for (const [key, d] of pcSorted) {
      const sepIdx = key.indexOf("::");
      const projName = sepIdx >= 0 ? key.slice(0, sepIdx) : key;
      const chName = sepIdx >= 0 ? key.slice(sepIdx + 2) : "-";
      const fmtW1 = (v: number[]) => v.length === 7 ? v.map((x) => fmt(x)).join(" | ") : LTV_COLS.map(() => "-").join(" | ");
      const fmtW2 = (v: number[]) => v.length === 7 ? v.map((x) => fmt(x)).join(" | ") : LTV_COLS.map(() => "-").join(" | ");
      const coef1 = d.w1[6] && d.w1[0] ? (d.w1[6] / d.w1[0]).toFixed(2) : "-";
      const coef2 = d.w2[6] && d.w2[0] ? (d.w2[6] / d.w2[0]).toFixed(2) : "-";
      sections.push(
        `| **${week1Label}** | ${projName} | ${chName} ` +
        `| ${fmt(d.w1Cost, 0)} | ${fmt(d.w1Users, 0)} | ${fmt(d.w1Cpa)} | ${(d.w1Roi1).toFixed(1)}% ` +
        `| ${fmtW1(d.w1)} | ${coef1} |`
      );
      sections.push(
        `| **${week2Label}** | ${projName} | ${chName} ` +
        `| ${fmt(d.w2Cost, 0)} | ${fmt(d.w2Users, 0)} | ${fmt(d.w2Cpa)} | ${(d.w2Roi1).toFixed(1)}% ` +
        `| ${fmtW2(d.w2)} | ${coef2} |`
      );
    }
    sections.push("");
  }

  // Section: 分渠道商数据
  sections.push("## 分渠道商数据", "");
  sections.push(
    ...dimensionTable(
      "渠道商名称",
      allChannelNames,
      (n) => channelW1.get(n),
      (n) => channelW2.get(n),
      ["CPA", "ROI1", "LTV1"],
      (n) => { const d = channelW1.get(n); return [fmt(d?.cpa), d?.roi1 ? `${d.roi1.toFixed(1)}%` : "-", fmt(d?.ltv1)]; },
      (n) => { const d = channelW2.get(n); return [fmt(d?.cpa), d?.roi1 ? `${d.roi1.toFixed(1)}%` : "-", fmt(d?.ltv1)]; },
    ),
  );
  sections.push("");

  // Section: 核心指标概览（平台维度）
  sections.push("## 核心指标概览", "");
  sections.push(
    ...dimensionTable(
      "平台",
      allPlatformNames,
      (n) => platformW1.get(n),
      (n) => platformW2.get(n),
      ["CPA", "ROI1", "LTV1"],
      (n) => { const d = platformW1.get(n); return [fmt(d?.cpa), d?.roi1 ? `${d.roi1.toFixed(1)}%` : "-", fmt(d?.ltv1)]; },
      (n) => { const d = platformW2.get(n); return [fmt(d?.cpa), d?.roi1 ? `${d.roi1.toFixed(1)}%` : "-", fmt(d?.ltv1)]; },
    ),
  );
  sections.push("");

  // Section: 分媒体数据
  sections.push("## 分媒体数据", "");

  sections.push(
    ...dimensionTable(
      "媒体名称",
      allMediaNames,
      (n) => mediaW1.get(n),
      (n) => mediaW2.get(n),
      ["CPA", "ROI1", "LTV1"],
      (n) => { const d = mediaW1.get(n); return [fmt(d?.cpa), d?.roi1 ? `${d.roi1.toFixed(1)}%` : "-", fmt(d?.ltv1)]; },
      (n) => { const d = mediaW2.get(n); return [fmt(d?.cpa), d?.roi1 ? `${d.roi1.toFixed(1)}%` : "-", fmt(d?.ltv1)]; },
    ),
  );
  sections.push("");

  return { summaryContext: sections.join("\n"), week1Label, week2Label };
}
