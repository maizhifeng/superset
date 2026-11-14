import dayjs from "dayjs";
import { expect, test } from "vitest";
import {
  buildStartMaps,
  startKey,
  type AnchorKey,
  type ProfitSharingStartRow,
} from "@/pages/Dashboard/compareStartDate";
import { defaultFilters, type AnalysisFilters } from "@/pages/Analysis/filters";
import {
  aggregateProjectCompareTotals,
  bestProjectCompareValues,
  bucketIndexForDate,
  bucketLabel,
  buildProjectCompareChartModel,
  buildProjectCompareQuery,
  buildProjectCompareQueries,
  buildProjectOptions,
  formatWindowDate,
  groupSectionRowsByBucket,
  hasProjectCompareChartData,
  hasProjectCompareTableData,
  isAbortError,
  normalizeProjectRegion,
  parseProjectCompareResults,
  planProjectCompareSections,
  projectCompareBucketRows,
  projectCompareMetricDefs,
  projectCompareQueryMetrics,
  projectCompareRowsForAnchor,
  projectCompareWeightKey,
  projectKey,
  projectOptionLabel,
  windowBucketCount,
  type ProjectCompareSection,
  type ProjectOption,
} from "@/pages/Analysis/projectCompare";
import {
  getAnalysisTopic,
  PROJECT_COMPARE_METRIC_KEYS,
  topicMetric,
} from "@/pages/Analysis/topics";
import type { AnalysisMetric, AnalysisTopic } from "@/pages/Analysis/types";

const topic = getAnalysisTopic("project-compare")!;

const EMPTY_SHARING: ProfitSharingStartRow = {
  papp_id: 1,
  region: "domestic",
  channel_name: "",
  上线时间: "",
  首测起始时间: "",
  二测起始时间: "",
  三测起始时间: "",
};

function sharingRow(
  overrides: Partial<ProfitSharingStartRow> = {},
): ProfitSharingStartRow {
  return { ...EMPTY_SHARING, ...overrides };
}

/**
 * - domestic project 1: 首测 2024/01/01 → 二测 2024/01/15 → 三测 → 上线
 * - oversea project 1: a different game reusing the same papp_id
 * - oversea project 2: only 上线
 * - domestic project 3: no start date at all
 */
const SHARING_ROWS: ProfitSharingStartRow[] = [
  sharingRow({
    papp_id: 1,
    region: "domestic",
    首测起始时间: "2024/01/01",
    二测起始时间: "2024/01/15",
    三测起始时间: "2024/02/01",
    上线时间: "2024/03/01",
  }),
  sharingRow({
    papp_id: 1,
    region: "oversea",
    上线时间: "2024/06/01",
  }),
  sharingRow({
    papp_id: 2,
    region: "oversea",
    上线时间: "2024/05/01",
  }),
  sharingRow({ papp_id: 3, region: "domestic" }),
];

const GAME_ROWS = [
  { papp_id: 1, region: "domestic", papp_name: "项目A" },
  { papp_id: 1, region: "oversea", papp_name: "项目A海外" },
  { papp_id: 2, region: "oversea", papp_name: "项目B" },
  { papp_id: 3, region: "domestic", papp_name: "项目C" },
];

const START_MAPS = buildStartMaps(SHARING_ROWS);
const PROJECTS = buildProjectOptions(GAME_ROWS, START_MAPS);
const PROJECT_A = PROJECTS.find((project) => project.papp_name === "项目A")!;
const PROJECT_B = PROJECTS.find((project) => project.papp_name === "项目B")!;

function filtersWith(
  overrides: Partial<AnalysisFilters> = {},
): AnalysisFilters {
  return { ...defaultFilters(topic), ...overrides };
}

function customSection(
  project: ProjectOption,
  anchor: AnchorKey,
  start: string,
  end: string,
): ProjectCompareSection {
  return {
    key: `${projectKey(project)}:${anchor}:${start}`,
    project,
    anchor,
    start,
    end,
    // The UI shows the last included day (queries keep the exclusive end).
    windowLabel: `${start} ~ ${dayjs(end).subtract(1, "day").format("YYYY-MM-DD")}`,
  };
}

test("normalizes project regions and scopes identities by region", () => {
  expect(normalizeProjectRegion("domestic")).toBe("domestic");
  expect(normalizeProjectRegion("oversea")).toBe("oversea");
  expect(normalizeProjectRegion("")).toBe("domestic");
  expect(normalizeProjectRegion(undefined)).toBe("domestic");
  expect(normalizeProjectRegion("海外")).toBe("domestic");

  expect(projectKey({ region: "domestic", papp_id: "1" })).toBe(
    startKey("domestic", "1"),
  );
  expect(projectKey({ region: "oversea", papp_id: "1" })).toBe(
    startKey("oversea", "1"),
  );
  expect(projectOptionLabel(PROJECT_A)).toBe("项目A（国内）");
  expect(projectOptionLabel(PROJECT_B)).toBe("项目B（海外）");
});

test("buildProjectOptions keeps started projects in /project/papp order", () => {
  // 项目C has no configured start date, so it cannot be queried by an anchor.
  expect(PROJECTS.map((project) => project.papp_name)).toEqual([
    "项目A",
    "项目A海外",
    "项目B",
  ]);
  expect(PROJECTS[0].region).toBe("domestic");
  expect(PROJECTS[1].region).toBe("oversea");

  // Legacy rows without a region fall back to the domestic bucket.
  const unlabelled = buildProjectOptions(
    [{ papp_id: 1, papp_name: "项目A" }],
    START_MAPS,
  );
  expect(unlabelled).toHaveLength(1);
  expect(unlabelled[0].region).toBe("domestic");
});

test("plans one window per project × anchor, capped by the next milestone", () => {
  const { sections, skipped } = planProjectCompareSections(
    [PROJECT_A, PROJECT_B],
    ["首测起始时间", "上线时间"],
    START_MAPS,
    30,
  );

  // 首测 window: 01-01 + 30 days is past 二测 01-15, so it ends at 二测.
  expect(sections[0]).toMatchObject({
    key: "domestic:1:首测起始时间",
    start: "2024-01-01",
    end: "2024-01-15",
    windowLabel: "2024-01-01 ~ 2024-01-14",
  });
  // 上线 has no following milestone: the full 30-day window survives.
  expect(sections[1]).toMatchObject({
    key: "domestic:1:上线时间",
    start: "2024-03-01",
    end: "2024-03-31",
  });
  // 项目B has no 首测 dates, so only its 上线 section is planned.
  expect(sections[2]).toMatchObject({
    key: "oversea:2:上线时间",
    start: "2024-05-01",
    end: "2024-05-31",
  });
  expect(sections).toHaveLength(3);

  expect(skipped).toHaveLength(1);
  expect(skipped[0].project.papp_name).toBe("项目B");
  expect(skipped[0].anchor).toBe("首测起始时间");
  expect(skipped[0].label).toContain("已跳过：项目B");
  expect(skipped[0].label).toContain("无首测起始日期");
});

test("the window length controls the uncapped end date", () => {
  const { sections } = planProjectCompareSections(
    [PROJECT_A],
    ["上线时间"],
    START_MAPS,
    7,
  );
  expect(sections[0]).toMatchObject({
    start: "2024-03-01",
    end: "2024-03-08",
  });

  const { sections: longSections } = planProjectCompareSections(
    [PROJECT_A],
    ["上线时间"],
    START_MAPS,
    360,
  );
  expect(longSections[0]).toMatchObject({
    start: "2024-03-01",
    end: "2025-02-24",
  });
});

test("formatWindowDate converts anchor dates to ISO days", () => {
  expect(formatWindowDate("2024/01/01")).toBe("2024-01-01");
  expect(formatWindowDate("2024-9-2")).toBe("2024-09-02");
});

test("builds a daily query per section with side and project filters", () => {
  const { sections } = planProjectCompareSections(
    [PROJECT_A, PROJECT_B],
    ["首测起始时间", "上线时间"],
    START_MAPS,
    30,
  );
  const filters = filtersWith({
    regions: ["mainland"],
    media: ["广点通"],
    platforms: ["mobile"],
    // The page filter bar hides 主游戏 for this topic; a stale URL value must
    // not leak into the comparison queries.
    games: ["URL遗留项目"],
  });

  const query = buildProjectCompareQuery(topic, filters, sections[0]);
  expect(query.result_type).toBe("full");
  expect(query.groupby).toEqual(["日期"]);
  expect(query.columns).toEqual([]);
  expect(query.granularity).toBe("日期");
  expect(query.time_range).toBe("2024-01-01 : 2024-01-15");
  expect(query.orderby).toEqual([["日期", true]]);
  expect(query.row_limit).toBe(800);
  expect(query.metrics).toEqual(
    projectCompareQueryMetrics(topic).map((metric) => metric.metric),
  );
  expect(query.filters).toEqual([
    { col: "地区", op: "IN", val: ["mainland"] },
    { col: "媒体", op: "IN", val: ["广点通"] },
    { col: "平台", op: "IN", val: ["mobile"] },
    { col: "主游戏", op: "IN", val: ["项目A"] },
    // Mainland SQL hard-codes 地区='mainland'.
    { col: "地区", op: "IN", val: ["mainland"] },
  ]);
  expect(query.filters).not.toContainEqual({
    col: "平台",
    op: "IN",
    val: ["oversea"],
  });

  // Oversea projects are isolated by 平台 = oversea (their 地区 is a region code).
  const overseaQuery = buildProjectCompareQuery(topic, filters, sections[2]);
  expect(overseaQuery.time_range).toBe("2024-05-01 : 2024-05-31");
  expect(overseaQuery.filters).toContainEqual({
    col: "主游戏",
    op: "IN",
    val: ["项目B"],
  });
  expect(overseaQuery.filters).toContainEqual({
    col: "平台",
    op: "IN",
    val: ["oversea"],
  });
  expect(overseaQuery.filters).not.toContainEqual({
    col: "地区",
    op: "IN",
    val: ["oversea"],
  });
});

test("query metrics dedupe denominators by response field", () => {
  const metrics = projectCompareQueryMetrics(topic);
  const keys = metrics.map((metric) => metric.key);
  expect(keys).toEqual(
    PROJECT_COMPARE_METRIC_KEYS.map((key) => topicMetric(topic, key).key),
  );
  expect(new Set(keys).size).toBe(keys.length);

  // A weight column outside the compared set is appended exactly once.
  const extraWeight: AnalysisMetric = {
    key: "活跃付费",
    label: "活跃付费",
    metric: "活跃付费",
    format: "number",
  };
  const cloned: AnalysisTopic = {
    ...topic,
    metrics: {
      ...topic.metrics,
      activePayers: extraWeight,
      cpa: { ...topicMetric(topic, "cpa"), bucketWeight: "activePayers" },
    },
  };
  const clonedKeys = projectCompareQueryMetrics(cloned).map(
    (metric) => metric.key,
  );
  // 17 compared metrics + one extra denominator that is not part of them.
  expect(clonedKeys).toHaveLength(PROJECT_COMPARE_METRIC_KEYS.length + 1);
  expect(clonedKeys[clonedKeys.length - 1]).toBe("活跃付费");
  expect(new Set(clonedKeys).size).toBe(clonedKeys.length);
});

test("parses daily rows per section and degrades missing data to empty arrays", () => {
  const response = {
    data: {
      result: [
        {
          data: [
            { 日期: "2024-01-01", 消耗: 10 },
            { 日期: "2024-01-02", 消耗: 20 },
          ],
        },
        { data: [] },
        { error: "boom" },
      ],
    },
  };
  const parsed = parseProjectCompareResults(response, 3);
  expect(parsed[0]).toHaveLength(2);
  expect(parsed[1]).toEqual([]);
  expect(parsed[2]).toEqual([]);

  const padded = parseProjectCompareResults(response, 5);
  expect(padded).toHaveLength(5);
  expect(padded[3]).toEqual([]);
  expect(padded[4]).toEqual([]);
  expect(parseProjectCompareResults(undefined, 2)).toEqual([[], []]);
  expect(parseProjectCompareResults({ data: { result: "nope" } }, 1)).toEqual([
    [],
  ]);
});

test("window totals sum additive metrics and weight rate metrics", () => {
  const rows = [
    { 消耗: 10, 新增进入: 100, cpa: 10, "1日付费数": 5, cpp: 16 },
    { 消耗: 20, 新增进入: 300, cpa: 20, "1日付费数": 15, cpp: 24 },
  ];
  const totals = aggregateProjectCompareTotals(topic, rows);

  expect(totals["消耗"]).toBe(30);
  // Weighted, not the naive mean: (10*100 + 20*300) / 400 = 17.5, not 15.
  expect(totals.cpa).toBe(17.5);
  expect(totals.cpp).toBe((16 * 5 + 24 * 15) / 20);

  // No daily rows: every metric is missing instead of a misleading 0.
  const empty = aggregateProjectCompareTotals(topic, []);
  expect(empty["消耗"]).toBeNull();
  expect(empty.cpa).toBeNull();
  expect(empty["累计roi"]).toBeNull();
});

test("resolves the denominator used to re-aggregate each rate metric", () => {
  expect(projectCompareWeightKey(topic, topicMetric(topic, "cpa"))).toBe(
    "新增进入",
  );
  expect(projectCompareWeightKey(topic, topicMetric(topic, "cpp"))).toBe(
    "1日付费数",
  );
  expect(projectCompareWeightKey(topic, topicMetric(topic, "roi1"))).toBe(
    "返点后消耗",
  );
  expect(
    projectCompareWeightKey(topic, topicMetric(topic, "cumulativeRoi")),
  ).toBe("返点后消耗");
  expect(projectCompareWeightKey(topic, topicMetric(topic, "naturalNew"))).toBe(
    "新增进入",
  );
  expect(
    projectCompareWeightKey(topic, topicMetric(topic, "spend")),
  ).toBeNull();
});

test("bucket indices and labels stay anchor-relative", () => {
  // day: 第1天 is the window start.
  expect(bucketIndexForDate("2024-01-01", "2024-01-01", "day")).toBe(0);
  expect(bucketIndexForDate("2024-01-01", "2024-01-07", "day")).toBe(6);
  // week: days 1-7 are week 1; day 8 starts week 2.
  expect(bucketIndexForDate("2024-01-01", "2024-01-07", "week")).toBe(0);
  expect(bucketIndexForDate("2024-01-01", "2024-01-08", "week")).toBe(1);
  expect(bucketIndexForDate("2024-01-01", "2024-01-14", "week")).toBe(1);
  expect(bucketIndexForDate("2024-01-01", "2024-01-15", "week")).toBe(2);
  // month: calendar-month difference from the start month.
  expect(bucketIndexForDate("2024-01-20", "2024-02-03", "month")).toBe(1);
  expect(bucketIndexForDate("2024-12-20", "2025-01-02", "month")).toBe(1);
  // Dates before the window and unparseable values cannot be bucketed.
  expect(bucketIndexForDate("2024-01-01", "2023-12-31", "day")).toBeNull();
  expect(bucketIndexForDate("2024-01-01", "not-a-date", "day")).toBeNull();

  expect(bucketLabel(0, "day")).toBe("第1天");
  expect(bucketLabel(6, "day")).toBe("第7天");
  expect(bucketLabel(0, "week")).toBe("第1周");
  expect(bucketLabel(2, "month")).toBe("第3月");
});

test("window bucket counts follow the window length", () => {
  const section = customSection(
    PROJECT_A,
    "上线时间",
    "2024-01-01",
    "2024-01-31",
  );
  expect(windowBucketCount(section, "day")).toBe(30);
  expect(windowBucketCount(section, "week")).toBe(5);
  expect(windowBucketCount(section, "month")).toBe(1);

  const quarter = customSection(
    PROJECT_A,
    "上线时间",
    "2024-01-01",
    "2024-04-01",
  );
  expect(windowBucketCount(quarter, "month")).toBe(3);
});

test("groups daily rows into grain buckets and aggregates each bucket", () => {
  const section = customSection(
    PROJECT_A,
    "上线时间",
    "2024-01-01",
    "2024-01-20",
  );
  const rows = Array.from({ length: 8 }, (_, index) => ({
    日期: `2024-01-0${index + 1}`,
    消耗: 10,
    新增进入: index === 6 ? 300 : 100,
    cpa: index === 6 ? 20 : 10,
  }));

  const weekly = groupSectionRowsByBucket(section, rows, "week");
  expect(weekly.map((bucket) => bucket.label)).toEqual(["第1周", "第2周"]);
  expect(weekly[0].rows).toHaveLength(7);
  expect(weekly[1].rows).toHaveLength(1);

  // The week's rate is the ratio of the week's sums, not a mean of daily rates.
  const totals = aggregateProjectCompareTotals(topic, weekly[0].rows);
  expect(totals.cpa).toBeCloseTo((10 * 100 * 6 + 20 * 300) / 900);

  // Invalid dates are ignored rather than creating a phantom bucket.
  const withBadRow = groupSectionRowsByBucket(
    section,
    [...rows, { 日期: "bad-date", 消耗: 5 }],
    "day",
  );
  expect(
    withBadRow.reduce((count, bucket) => count + bucket.rows.length, 0),
  ).toBe(8);

  // A bucket whose rows carry no valid value stays missing, never zero.
  const [sparseBucket] = groupSectionRowsByBucket(
    section,
    [{ 日期: "2024-01-01" }],
    "day",
  );
  expect(
    aggregateProjectCompareTotals(topic, sparseBucket.rows).cpa,
  ).toBeNull();
});

test("chart model aligns series by bucket and pads shorter windows", () => {
  const longSection = customSection(
    PROJECT_A,
    "上线时间",
    "2024-01-01",
    "2024-01-31",
  );
  const shortSection = customSection(
    PROJECT_B,
    "首测起始时间",
    "2024-01-01",
    "2024-01-11",
  );
  const longRows = Array.from({ length: 30 }, (_, index) => ({
    日期: `2024-01-${String(index + 1).padStart(2, "0")}`,
    消耗: 10,
  }));
  const shortRows = Array.from({ length: 10 }, (_, index) => ({
    日期: `2024-01-${String(index + 1).padStart(2, "0")}`,
    消耗: 20,
  }));

  const model = buildProjectCompareChartModel(
    topic,
    [longSection, shortSection],
    [longRows, shortRows],
    topicMetric(topic, "spend"),
    "day",
  );
  expect(model.categories).toHaveLength(30);
  expect(model.series[0].values).toHaveLength(30);
  expect(model.series[1].values).toHaveLength(30);
  // The shorter window is padded with nulls so projects stay aligned.
  expect(model.series[1].values.slice(10)).toEqual(
    Array.from({ length: 20 }, () => null),
  );
  expect(model.series[1].values[9]).toBe(20);
  // The sections use different anchor rounds, so the names carry the label.
  expect(model.series.map((series) => series.name)).toEqual([
    "项目A（上线）",
    "项目B（首测）",
  ]);
  expect(hasProjectCompareChartData(model)).toBe(true);

  // Multi-anchor names carry the anchor label; same project colours are the
  // view's concern, the model only exposes projectKey/anchor.
  const multi = buildProjectCompareChartModel(
    topic,
    [longSection, { ...longSection, key: "second", anchor: "首测起始时间" }],
    [longRows, longRows],
    topicMetric(topic, "spend"),
    "week",
  );
  expect(multi.series.map((series) => series.name)).toEqual([
    "项目A（上线）",
    "项目A（首测）",
  ]);
  expect(multi.categories).toHaveLength(5);

  const empty = buildProjectCompareChartModel(
    topic,
    [longSection],
    [[]],
    topicMetric(topic, "spend"),
    "day",
  );
  expect(hasProjectCompareChartData(empty)).toBe(false);

  // Rows without the selected metric value keep their bucket placeholder null.
  const sparse = buildProjectCompareChartModel(
    topic,
    [longSection],
    [[{ 日期: "2024-01-01" }]],
    topicMetric(topic, "cpa"),
    "day",
  );
  expect(sparse.categories).toHaveLength(30);
  expect(sparse.series[0].values[0]).toBeNull();
  expect(hasProjectCompareChartData(sparse)).toBe(false);
});

test("table rows aggregate totals, sort by spend and highlight directional best values", () => {
  const { sections } = planProjectCompareSections(
    [PROJECT_A, PROJECT_B],
    ["上线时间"],
    START_MAPS,
    30,
  );
  const spendKey = topicMetric(topic, "spend").key;
  const rows = projectCompareRowsForAnchor(
    topic,
    sections,
    [[{ 消耗: 100, cpa: 10 }], [{ 消耗: 300, cpa: 8 }]],
    "上线时间",
    spendKey,
  );
  expect(rows.map((item) => item.section.project.papp_name)).toEqual([
    "项目B",
    "项目A",
  ]);
  expect(rows[0].totals["消耗"]).toBe(300);
  expect(hasProjectCompareTableData(rows)).toBe(true);

  // Missing windows sort last; a table whose sections all lack rows is empty.
  const missing = projectCompareRowsForAnchor(
    topic,
    sections,
    [[{ 消耗: 100 }], []],
    "上线时间",
    spendKey,
  );
  expect(missing.map((item) => item.section.project.papp_name)).toEqual([
    "项目A",
    "项目B",
  ]);
  expect(
    hasProjectCompareTableData(
      projectCompareRowsForAnchor(
        topic,
        sections,
        [[], []],
        "上线时间",
        spendKey,
      ),
    ),
  ).toBe(false);

  const best = bestProjectCompareValues(
    [{ 消耗: 100, cpa: 10, ltv_1: 3 }, { 消耗: 300, cpa: 8, ltv_1: 5 }, {}],
    projectCompareMetricDefs(topic),
  );
  expect(best.cpa).toBe(8); // lower is better
  expect(best.ltv_1).toBe(5); // higher is better
  expect(best["消耗"]).toBeNull(); // no direction, never highlighted
});

test("buildProjectCompareQueries keeps the section order", () => {
  const { sections } = planProjectCompareSections(
    [PROJECT_A, PROJECT_B],
    ["首测起始时间", "上线时间"],
    START_MAPS,
    30,
  );
  const queries = buildProjectCompareQueries(topic, filtersWith(), sections);
  expect(queries).toHaveLength(sections.length);
  expect(queries.map((query) => query.time_range)).toEqual(
    sections.map((section) => `${section.start} : ${section.end}`),
  );
  for (const query of queries) {
    expect(query.groupby).toEqual(["日期"]);
  }
});

test("recognizes aborted requests", () => {
  expect(isAbortError({ name: "AbortError" })).toBe(true);
  expect(isAbortError({ code: "ERR_CANCELED" })).toBe(true);
  expect(isAbortError(new Error("network"))).toBe(false);
  expect(isAbortError(null)).toBe(false);
});

test("expands a project window into per-bucket detail rows", () => {
  const section = customSection(
    PROJECT_A,
    "上线时间",
    "2024-01-01",
    "2024-01-11",
  );
  const rows = Array.from({ length: 10 }, (_, index) => ({
    日期: `2024-01-${String(index + 1).padStart(2, "0")}`,
    消耗: 10,
    新增进入: 100,
    cpa: 10,
    "1日充值": 5,
  }));

  // Day grain: one row per day with its calendar date and aggregated metrics.
  const daily = projectCompareBucketRows(topic, section, rows, "day");
  expect(daily).toHaveLength(10);
  expect(daily[0]).toMatchObject({
    label: "第1天",
    windowLabel: "2024-01-01",
  });
  expect(daily[9]).toMatchObject({
    label: "第10天",
    windowLabel: "2024-01-10",
  });
  expect(daily[0].totals["消耗"]).toBe(10);
  expect(daily[0].totals.cpa).toBe(10);

  // Week grain: two buckets, the second only has days 8-10.
  const weekly = projectCompareBucketRows(topic, section, rows, "week");
  expect(weekly.map((row) => row.label)).toEqual(["第1周", "第2周"]);
  expect(weekly[0].windowLabel).toBe("2024-01-01 ~ 2024-01-07");
  expect(weekly[1].windowLabel).toBe("2024-01-08 ~ 2024-01-14");
  expect(weekly[0].totals["消耗"]).toBe(70);
  expect(weekly[1].totals["消耗"]).toBe(30);

  // A bucket without rows stays present but reports missing values.
  const sparse = projectCompareBucketRows(
    topic,
    section,
    [{ 日期: "2024-01-03", 消耗: 7 }],
    "day",
  );
  expect(sparse).toHaveLength(10);
  expect(sparse[0].totals["消耗"]).toBeNull();
  expect(sparse[2].totals["消耗"]).toBe(7);
});

test("vendor-scoped queries group by 渠道商 and widen the row limit", () => {
  const { sections } = planProjectCompareSections(
    [PROJECT_A],
    ["上线时间"],
    START_MAPS,
    30,
  );
  const filters = filtersWith({ channels: ["渠道甲", "渠道乙"] });

  const query = buildProjectCompareQuery(topic, filters, sections[0]);
  // The table splits rows per vendor, so the vendor becomes part of the
  // grouping instead of being folded into the project total.
  expect(query.groupby).toEqual(["日期", "渠道商"]);
  expect(query.orderby).toEqual([["日期", true]]);
  // One row per day and vendor: the post-merge truncation must not drop days.
  expect(query.row_limit).toBe(1600);
  expect(query.filters).toContainEqual({
    col: "渠道商",
    op: "IN",
    val: ["渠道甲", "渠道乙"],
  });

  // Without a vendor selection the comparison keeps daily-only rows.
  expect(
    buildProjectCompareQuery(topic, filtersWith(), sections[0]).groupby,
  ).toEqual(["日期"]);
});

test("splits every project into 渠道商 rows when the query groups by it", () => {
  const { sections } = planProjectCompareSections(
    [PROJECT_A, PROJECT_B],
    ["上线时间"],
    START_MAPS,
    30,
  );
  const spendKey = topicMetric(topic, "spend").key;
  const rowsA = [
    { 日期: "2024-01-01", 渠道商: "渠道甲", 消耗: 60 },
    { 日期: "2024-01-02", 渠道商: "渠道甲", 消耗: 40 },
    { 日期: "2024-01-01", 渠道商: "渠道乙", 消耗: 30 },
    { 日期: "2024-01-02", 渠道商: "渠道乙", 消耗: 20 },
  ];
  const rowsB = [{ 日期: "2024-05-01", 渠道商: "渠道乙", 消耗: 500 }];

  const rows = projectCompareRowsForAnchor(
    topic,
    sections,
    [rowsA, rowsB],
    "上线时间",
    spendKey,
  );
  // Projects stay ordered by total spend; within a project the vendors follow
  // the table-wide spend order (乙 outspent 甲 across the table).
  expect(
    rows.map((row) => `${row.section.project.papp_name}|${row.channel}`),
  ).toEqual(["项目B|渠道乙", "项目A|渠道乙", "项目A|渠道甲"]);
  expect(rows.map((row) => row.totals["消耗"])).toEqual([500, 50, 100]);
  // Each row keeps only its vendor's daily rows for the bucket expansion.
  expect(rows.find((row) => row.channel === "渠道甲")?.rows).toHaveLength(2);
  // Row identity is unique per project × vendor for the expansion state.
  expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
});

test("rows without a vendor column stay one per project", () => {
  const { sections } = planProjectCompareSections(
    [PROJECT_A],
    ["上线时间"],
    START_MAPS,
    30,
  );
  const rows = projectCompareRowsForAnchor(
    topic,
    sections,
    [[{ 日期: "2024-01-01", 消耗: 100 }]],
    "上线时间",
    topicMetric(topic, "spend").key,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].channel).toBeNull();
  expect(rows[0].key).toBe(sections[0].key);
});
