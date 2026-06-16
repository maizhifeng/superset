/**
 * 广告投放周报数据 API
 *
 * 业务场景：运营/投放团队每周需要查看过去两周的广告投放效果数据。
 * 该模块从 Superset 的 /chart/data 接口拉取数据，按媒体、渠道商、平台、
 * 项目等维度聚合，生成 Markdown 格式的周报摘要，可直接用于飞书/钉钉等文档。
 *
 * 数据源：Superset 数据集 id=26（广告投放数据表）
 * 周次划分：以自然周为单位，W1 = 上上周（第 1 周），W2 = 上周（第 2 周）
 *
 * 比率指标计算规则：
 * - CPA（单用户获客成本）= 总消耗 / 总新增用户
 * - ROI1（首日回报率）= Σ(roi₁ × 消耗) / Σ(消耗) × 100%，按消耗加权
 * - LTV1（首日生命周期价值）= Σ(ltv₁ × 用户) / Σ(用户)，按用户加权
 */

import api from "@/api";

/** Superset 数据集 ID：广告投放数据表 */
const DATASOURCE = { id: 26, type: "table" as const };

/** 通用行数据类型 */
interface Row {
  [key: string]: unknown;
}

/**
 * 消耗指标定义（SUM）
 * 数据库字段：返点后消耗（扣除返点后的实际投放消耗金额）
 */
const COST_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "返点后消耗" },
  aggregate: "SUM" as const,
  label: "SUM(ad_real_cost)",
};

/**
 * 新增用户指标定义（SUM）
 * 数据库字段：新增进入（广告带来的新用户数）
 */
const USER_METRIC = {
  expressionType: "SIMPLE" as const,
  column: { column_name: "新增进入" },
  aggregate: "SUM" as const,
  label: "SUM(n_unum)",
};

/**
 * 数值格式化：将原始数值转为可读字符串，空值显示为 "-"
 * @param v - 原始值（number / null / undefined）
 * @param decimals - 小数位数，默认 2 位
 */
function fmt(v: unknown, decimals = 2): string {
  if (v == null) return "-";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(decimals);
  }
  return String(v);
}

/**
 * 解析 Superset /chart/data 接口返回结果
 * @param resp - 接口原始响应
 * @returns提取后的行数据列表和列名列表
 */
function parseResult(resp: unknown) {
  const r = (resp as { data?: { result?: unknown[] } })?.data?.result?.[0] as
    | { data?: Row[]; colnames?: string[] }
    | undefined;
  return { rows: r?.data ?? [], cols: r?.colnames ?? [] };
}

/**
 * 将 Date 对象格式化为 ISO 日期字符串（不含时间部分）
 * 如：2026-06-16T00:00:00
 */
function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00`;
}

/**
 * 根据时间戳判断数据属于第几周
 * @param ts - 数据点的时间戳（毫秒）
 * @param w1Start - 第 1 周起始日期
 * @param w2Start - 第 2 周起始日期
 * @returns "W1" | "W2" | ""（不在两周范围内则返回空字符串）
 */
function weekLabel(ts: number, w1Start: Date, w2Start: Date): string {
  if (ts == null || Number.isNaN(ts)) return "";
  const w1Ms = w1Start.getTime();
  const w2Ms = w2Start.getTime();
  if (ts >= w2Ms) return "W2";
  if (ts >= w1Ms) return "W1";
  return "";
}

/**
 * 将时间戳转为 "M/d" 格式的日期字符串
 * 如：6/9
 */
function extractDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 周报数据导出接口 */
export interface WeeklyReportData {
  /** 完整的 Markdown 格式周报内容 */
  summaryContext: string;
  /** 第 1 周日期标签，如 "6/9-6/15" */
  week1Label: string;
  /** 第 2 周日期标签，如 "6/16-6/22" */
  week2Label: string;
}

/**
 * 计算最近两周的起止时间
 *
 * 周次计算规则（以当天为基准往前推算）：
 *   当天 → 本周日 → 上周六（W2 结束） → 上周日（W2 开始） → 上上周六（W1 结束） → 上上周日（W1 开始）
 * 示例（如果今天是周三）：
 *   W1: 上上周日 ~ 上上周六，W2: 上周日 ~ 上周六
 *
 * @returns包含两个周次的起止 Date 对象以及 Superset 查询用的 time_range 字符串
 */
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

/**
 * 获取周报数据（核心入口）
 *
 * 流程概述：
 * 1. 批量请求 4 个 Superset 查询（按媒体/渠道商/平台/项目+渠道）
 * 2. 解析原始数据，按 W1/W2 分别聚合各维度的可加和指标（消耗、新增用户），
 *    同时累积 roi1Weighted = Σ(roi₁ × 消耗) 和 ltv1Weighted = Σ(ltv₁ × 用户)
 * 3. 对每个维度按 W2 消耗排名，筛选头部项，将小额项合并为"其他"
 * 4. 生成分项目、分渠道商、分平台、分媒体 4 个 Markdown 表格段落
 *    比率指标在展示时实时从加权累积值计算
 *
 * @returns周报 Markdown 内容及周次标签
 */
export async function fetchWeeklyReportData(): Promise<WeeklyReportData> {
  /** 基础查询参数（固定指向数据集 26，返回完整 JSON 结果） */
  const baseQuery = {
    datasource: DATASOURCE,
    result_format: "json" as const,
    result_type: "full" as const,
  };

  const bounds = getLastTwoWeekBounds();
  const { w1Start, w2Start } = bounds;

  /** 两周时间过滤条件 */
  const twoWeekFilter = {
    granularity: "日期" as const,
    time_range: bounds.rangeStr,
  };

  /** 默认排序：按消耗降序 */
  const orderDesc = [["SUM(ad_real_cost)", false]];

  /*
   * 将 4 个查询合并为一次 API 请求（Superset /chart/data 支持批量 queries）：
   * - 查询 0：按「媒体 + 日期」聚合
   * - 查询 1：按「渠道商 + 日期」聚合
   * - 查询 2：按「平台 + 日期」聚合
   * - 查询 3：按「主游戏 + 渠道商 + 日期」聚合，额外包含 LTV1~LTV7
   */
  const [qMedia, qChannel, qPlatform, qLtvTrend] = await Promise.all([
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"] as unknown[],
        columns: ["媒体", "日期"],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 500,
      }],
    }),
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"] as unknown[],
        columns: ["渠道商", "日期"],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 500,
      }],
    }),
    api.post("/chart/data", {
      ...baseQuery,
      queries: [{
        metrics: [COST_METRIC, USER_METRIC, "cpa", "roi_1", "ltv_1"] as unknown[],
        columns: ["平台", "日期"],
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
        columns: ["主游戏", "日期"],
        ...twoWeekFilter,
        orderby: orderDesc,
        row_limit: 1000,
      }],
    }),
  ]);

  const rMedia = parseResult(qMedia);
  const rChannel = parseResult(qChannel);
  const rPlatform = parseResult(qPlatform);
  const rLtvTrend = parseResult(qLtvTrend);

  /** 周次日期标签，如 "6/9-6/15" */
  const week1Label = `${extractDateStr(w1Start.getTime())}-${extractDateStr(new Date(w1Start.getTime() + 6 * 86400000).getTime())}`;
  const week2Label = `${extractDateStr(w2Start.getTime())}-${extractDateStr(new Date(w2Start.getTime() + 6 * 86400000).getTime())}`;

  const sections: string[] = [];

  // ---- 步骤 1：提取头部项目列表（按消耗排名前 12 的项目名） ----
  const projCostMap = new Map<string, number>();
  for (const r of rLtvTrend.rows) {
    const name = String(r.主游戏 ?? "");
    if (!name) continue;
    projCostMap.set(name, (projCostMap.get(name) ?? 0) + (Number(r["SUM(ad_real_cost)"]) || 0));
  }
  const allProjNames = [...projCostMap.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([n]) => n);

  /**
   * 各维度聚合累加的数据结构。
   *
   * 注意：不直接存储 CPA/ROI1/LTV1，而是存储加权分子，在展示时实时计算。
   * - roi1Weighted = Σ(roi₁ × 当前行消耗)，用于计算按消耗加权的 ROI1
   * - ltv1Weighted = Σ(ltv₁ × 当前行新增用户)，用于计算按用户加权的 LTV1
   */
  interface ProjAccum {
    cost: number;
    users: number;
    roi1Weighted: number;
    ltv1Weighted: number;
  }

  /**
   * 对某个维度的 W1/W2 数据进行排名 + 分组 + 小项合并
   *
   * 业务逻辑：按 W2 消耗降序排序，取前 maxItems 个；W2 消耗低于总消耗 1% 的
   * 剩余项合并为"其他"行（但至少保留前 5 项不被合并）。
   *
   * @param w1Map - 第 1 周各实体聚合数据
   * @param w2Map - 第 2 周各实体聚合数据
   * @param maxItems - 最大展示行数
   * @returns排名后的实体名称列表（最后可能包含"其他"）
   */
  function rankAndGroup(
    w1Map: Map<string, ProjAccum>,
    w2Map: Map<string, ProjAccum>,
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
      const w1o: ProjAccum = { cost: 0, users: 0, roi1Weighted: 0, ltv1Weighted: 0 };
      const w2o: ProjAccum = { cost: 0, users: 0, roi1Weighted: 0, ltv1Weighted: 0 };
      for (const n of otherItems) {
        const d1 = w1Map.get(n); if (d1) { w1o.cost += d1.cost; w1o.users += d1.users; w1o.roi1Weighted += d1.roi1Weighted; w1o.ltv1Weighted += d1.ltv1Weighted; }
        const d2 = w2Map.get(n); if (d2) { w2o.cost += d2.cost; w2o.users += d2.users; w2o.roi1Weighted += d2.roi1Weighted; w2o.ltv1Weighted += d2.ltv1Weighted; }
      }
      w1Map.set("其他", w1o);
      w2Map.set("其他", w2o);
      topNames.push("其他");
    }
    return topNames;
  }

  // ---- 步骤 2：按媒体维度聚合（按 W1/W2 分别累加） ----
  const mediaW1 = new Map<string, ProjAccum>();
  const mediaW2 = new Map<string, ProjAccum>();

  for (const r of rMedia.rows) {
    const wl = weekLabel(Number(r.日期), w1Start, w2Start);
    const name = String(r.媒体 ?? "");
    if (!name) continue;
    const map = wl === "W2" ? mediaW2 : mediaW1;
    const prev = map.get(name) ?? { cost: 0, users: 0, roi1Weighted: 0, ltv1Weighted: 0 };
    const cost = Number(r["SUM(ad_real_cost)"]) || 0;
    const users = Number(r["SUM(n_unum)"]) || 0;
    prev.cost += cost;
    prev.users += users;
    prev.roi1Weighted += (Number(r.roi_1) || 0) * cost;
    prev.ltv1Weighted += (Number(r.ltv_1) || 0) * users;
    map.set(name, prev);
  }

  const allMediaNames = rankAndGroup(mediaW1, mediaW2, 12);

  // ---- 步骤 3：按渠道商维度聚合 ----
  const channelW1 = new Map<string, ProjAccum>();
  const channelW2 = new Map<string, ProjAccum>();

  for (const r of rChannel.rows) {
    const wl = weekLabel(Number(r.日期), w1Start, w2Start);
    const name = String(r.渠道商 ?? "");
    if (!name) continue;
    const map = wl === "W2" ? channelW2 : channelW1;
    const prev = map.get(name) ?? { cost: 0, users: 0, roi1Weighted: 0, ltv1Weighted: 0 };
    const cost = Number(r["SUM(ad_real_cost)"]) || 0;
    const users = Number(r["SUM(n_unum)"]) || 0;
    prev.cost += cost;
    prev.users += users;
    prev.roi1Weighted += (Number(r.roi_1) || 0) * cost;
    prev.ltv1Weighted += (Number(r.ltv_1) || 0) * users;
    map.set(name, prev);
  }

  const allChannelNames = rankAndGroup(channelW1, channelW2, 12);

  // ---- 步骤 4：按平台维度聚合 ----
  const platformW1 = new Map<string, ProjAccum>();
  const platformW2 = new Map<string, ProjAccum>();

  for (const r of rPlatform.rows) {
    const wl = weekLabel(Number(r.日期), w1Start, w2Start);
    const name = String(r.平台 ?? "");
    if (!name) continue;
    const map = wl === "W2" ? platformW2 : platformW1;
    const prev = map.get(name) ?? { cost: 0, users: 0, roi1Weighted: 0, ltv1Weighted: 0 };
    const cost = Number(r["SUM(ad_real_cost)"]) || 0;
    const users = Number(r["SUM(n_unum)"]) || 0;
    prev.cost += cost;
    prev.users += users;
    prev.roi1Weighted += (Number(r.roi_1) || 0) * cost;
    prev.ltv1Weighted += (Number(r.ltv_1) || 0) * users;
    map.set(name, prev);
  }

  const allPlatformNames = rankAndGroup(platformW1, platformW2, 12);

  /**
   * 构建 Markdown 维度对比表格
   *
   * 表格结构：
   * | 星期 | {headerCol} | 消耗 | 新增用户 | {extraCols...} |
   * |------|------------|------|---------|---------------|
   * | **W1日期** |           |      |         |               |
   * |       | 实体1      | xxx  | xxx     | xxx           |
   * |       | **合计**    | xxx  | xxx     | xxx           |
   * | **W2日期** |           |      |         |               |
   * |       | 实体2      | xxx  | xxx     | xxx           |
   * |       | **合计**    | xxx  | xxx     | xxx           |
   *
   * CPA/ROI1/LTV1 在「合计」行和个体行都使用相同的加权算法，确保一致性：
   * - CPA = Σ(cost) / Σ(users)
   * - ROI1 = Σ(roi₁ × cost) / Σ(cost) × 100%
   * - LTV1 = Σ(ltv₁ × users) / Σ(users)
   *
   * @param headerCol - 维度列名（如"媒体名称"、"渠道商名称"）
   * @param names - 已排序的实体名列表
   * @param getW1 - 获取实体 W1 数据的回调
   * @param getW2 - 获取实体 W2 数据的回调
   * @param extraCols - 额外指标列名（如 ["CPA", "ROI1", "LTV1"]）
   * @param extraW1 - 获取实体 W1 额外指标值的回调
   * @param extraW2 - 获取实体 W2 额外指标值的回调
   * @returns Markdown 表格行字符串数组
   */
  function dimensionTable(
    headerCol: string,
    names: string[],
    getW1: (n: string) => ProjAccum | undefined,
    getW2: (n: string) => ProjAccum | undefined,
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
      roi1W: number, ltv1W: number,
    ): string {
      return extraCols.map((col) => {
        if (col === "CPA" && users > 0) return fmt(cost / users, 2);
        if (col === "ROI1" && cost > 0) return fmt(roi1W / cost * 100, 1) + "%";
        if (col === "LTV1" && users > 0) return fmt(ltv1W / users, 2);
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
      w1Roi1W += d.roi1Weighted;
      w1Ltv1W += d.ltv1Weighted;
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
      w2Roi1W += d.roi1Weighted;
      w2Ltv1W += d.ltv1Weighted;
      lines.push(`| | ${n} | ${fmt(d.cost, 0)} | ${fmt(d.users, 0)} | ${writeExtra(n, extraW2)} |`);
    }
    lines.push(`| | **合计** | **${fmt(w2Cost, 0)}** | **${fmt(w2Users, 0)}** | ${writeExtraSum(w2Cost, w2Users, w2Roi1W, w2Ltv1W)} |`);

    return lines;
  }

  // ---- 步骤 5：构建「分项目 + 渠道」明细表 ----

  const projSet = new Set(allProjNames);
  /** LTV 相关字段名（7 天 LTV） */
  const LTV_KEYS = ["ltv_1", "ltv_2", "ltv_3", "ltv_4", "ltv_5", "ltv_6", "ltv_7"];
  /** LTV 表格列标题 */
  const LTV_COLS = ["LTV1", "LTV2", "LTV3", "LTV4", "LTV5", "LTV6", "LTV7"];

  /** 项目+渠道每日明细 */
  interface PcDay {
    wl: string;
    cost: number;
    users: number;
    /** roi₁ × 当日消耗，用于加权计算周 ROI1 */
    roi1Weighted: number;
    ltvVals: number[];
  }
  const pcDays = new Map<string, PcDay[]>();

  for (const r of rLtvTrend.rows) {
    const proj = String(r.主游戏 ?? "");
    if (!proj || !projSet.has(proj)) continue;
    const ts = Number(r.日期);
    if (!ts || Number.isNaN(ts)) continue;
    const wl = weekLabel(ts, w1Start, w2Start);
    if (!wl) continue;
    const ltvVals = LTV_KEYS.map((k) => Number(r[k]) || 0);
    if (ltvVals.every((v) => v === 0)) continue;
    const cost = Number(r["SUM(ad_real_cost)"]) || 0;
    const users = Number(r["SUM(n_unum)"]) || 0;
    if (!pcDays.has(proj)) pcDays.set(proj, []);
    pcDays.get(proj)!.push({
      wl, cost, users,
      roi1Weighted: (Number(r.roi_1) || 0) * cost,
      ltvVals,
    });
  }

  /** 项目+渠道的周聚合数据 */
  interface PcAvg {
    w1Cost: number; w1Users: number;
    /** W1 的 Σ(roi₁ × cost)，用于计算 ROI1 */
    w1Roi1W: number;
    /** W1 的 LTV 日平均值 */
    w1: number[];
    w2Cost: number; w2Users: number;
    /** W2 的 Σ(roi₁ × cost)，用于计算 ROI1 */
    w2Roi1W: number;
    /** W2 的 LTV 日平均值 */
    w2: number[];
    totalCost: number;
  }
  const pcAvg = new Map<string, PcAvg>();
  for (const [key, days] of pcDays) {
    const w1D = days.filter((d) => d.wl === "W1");
    const w2D = days.filter((d) => d.wl === "W2");
    const avg = (arr: number[][]) =>
      arr.length > 0 ? arr[0].map((_, i) => arr.reduce((s, v) => s + v[i], 0) / arr.length) : [];
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

  /** 按项目排名 + 消耗排序，过滤掉 W2 消耗低于总消耗 1% 的尾部项 */
  const projRank = new Map(allProjNames.map((n, i) => [n, i]));
  const pcSortedAll = [...pcAvg.entries()].sort((a, b) => {
    const rA = projRank.get(a[0]) ?? 999;
    const rB = projRank.get(b[0]) ?? 999;
    if (rA !== rB) return rA - rB;
    return b[1].totalCost - a[1].totalCost;
  });

  const totalW2 = pcSortedAll.reduce((s, [, v]) => s + v.w2Cost, 0);
  const costThreshold = totalW2 * 0.01;
  const pcSorted = pcSortedAll.filter(([, v]) => v.w2Cost >= costThreshold);

  if (pcSorted.length > 0) {
    sections.push("## 分项目数据", "");
    const allCols = ["星期", "项目", "消耗", "新增用户", "CPA", "ROI1", ...LTV_COLS, "增长系数"];
    sections.push(`| ${allCols.join(" | ")} |`);
    sections.push(`|${allCols.map(() => "------").join("|")}|`);

    for (const [projName, d] of pcSorted) {
      const fmtW1 = (v: number[]) => v.length === 7 ? v.map((x) => fmt(x)).join(" | ") : LTV_COLS.map(() => "-").join(" | ");
      const fmtW2 = (v: number[]) => v.length === 7 ? v.map((x) => fmt(x)).join(" | ") : LTV_COLS.map(() => "-").join(" | ");
      /** 增长系数 = LTV7 / LTV1，反映用户长期价值倍率 */
      const coef1 = d.w1[6] && d.w1[0] ? (d.w1[6] / d.w1[0]).toFixed(2) : "-";
      const coef2 = d.w2[6] && d.w2[0] ? (d.w2[6] / d.w2[0]).toFixed(2) : "-";
      const cpa1 = d.w1Users > 0 ? fmt(d.w1Cost / d.w1Users) : "-";
      const cpa2 = d.w2Users > 0 ? fmt(d.w2Cost / d.w2Users) : "-";
      const roi1_1 = d.w1Cost > 0 ? `${(d.w1Roi1W / d.w1Cost * 100).toFixed(1)}%` : "-";
      const roi1_2 = d.w2Cost > 0 ? `${(d.w2Roi1W / d.w2Cost * 100).toFixed(1)}%` : "-";
      sections.push(
        `| **${week1Label}** | ${projName} ` +
        `| ${fmt(d.w1Cost, 0)} | ${fmt(d.w1Users, 0)} | ${cpa1} | ${roi1_1} ` +
        `| ${fmtW1(d.w1)} | ${coef1} |`
      );
      sections.push(
        `| **${week2Label}** | ${projName} ` +
        `| ${fmt(d.w2Cost, 0)} | ${fmt(d.w2Users, 0)} | ${cpa2} | ${roi1_2} ` +
        `| ${fmtW2(d.w2)} | ${coef2} |`
      );
    }
    sections.push("");
  }

  // ---- 步骤 6：组装四个维度表格段落 ----

  /** 根据聚合数据计算 CPA/ROI1/LTV1 显示值 */
  function fmtMetrics(d: ProjAccum | undefined): [string, string, string] {
    if (!d || d.cost === 0) return ["-", "-", "-"];
    const cpa = d.users > 0 ? fmt(d.cost / d.users) : "-";
    const roi1 = d.cost > 0 ? `${(d.roi1Weighted / d.cost * 100).toFixed(1)}%` : "-";
    const ltv1 = d.users > 0 ? fmt(d.ltv1Weighted / d.users) : "-";
    return [cpa, roi1, ltv1];
  }

  // Section: 分渠道商数据 - 按渠道商维度对比 W1/W2 核心指标
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
    ),
  );
  sections.push("");

  // Section: 核心指标概览（平台维度）- 按平台维度对比 W1/W2 核心指标
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
    ),
  );
  sections.push("");

  // Section: 分媒体数据 - 按媒体维度对比 W1/W2 核心指标
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
    ),
  );
  sections.push("");

  return { summaryContext: sections.join("\n"), week1Label, week2Label };
}
