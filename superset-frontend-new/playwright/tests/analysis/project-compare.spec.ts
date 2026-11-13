import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loginViaUi } from "../../helpers/credentials";

/**
 * E2E coverage for the "项目对比分析" (project-compare) analysis topic.
 *
 * The topic owns its whole page: there is no KPI strip, trend card or
 * breakdown table, and the project comparison view issues its own ranking and
 * per-window queries.  The spec only reads through the UI (plus the same
 * chart-data endpoint the view calls) and never seeds or mutates backend data.
 */

const SHOTS =
  process.env.PROJECT_COMPARE_SHOTS ??
  resolve("test-results", "project-compare-round2");
mkdirSync(SHOTS, { recursive: true });

/** Chart-data payload captured from the page's own requests. */
interface CapturedPayload {
  topic?: string;
  queries?: {
    groupby?: string[];
    metrics?: unknown[];
    time_range?: string;
    row_limit?: number;
    filters?: { col?: string; op?: string; val?: unknown }[];
  }[];
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(`[console.error] ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`[pageerror] ${error.message}`));
  return errors;
}

function saveErrors(name: string, errors: string[]): void {
  writeFileSync(
    `${SHOTS}/console-errors-${name}.json`,
    JSON.stringify(errors, null, 2),
    "utf8",
  );
  // eslint-disable-next-line no-console
  console.log(
    `[console-audit] ${name}: ${errors.length === 0 ? "clean" : errors.join(" | ")}`,
  );
  expect(errors, `${name} console/page errors`).toEqual([]);
}

/** Capture the topic's chart-data payloads and expose them to assertions. */
function captureAnalysisPayloads(page: Page): CapturedPayload[] {
  const payloads: CapturedPayload[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "POST" ||
      !request.url().includes("/api/v1/bi/analysis/chart-data")
    ) {
      return;
    }
    try {
      const body = request.postDataJSON() as CapturedPayload;
      if (body?.topic === "project-compare") payloads.push(body);
    } catch {
      /* non-JSON body: ignore */
    }
  });
  return payloads;
}

/** Pick one option from a filter-bar autocomplete by its visible label. */
async function pickFilterOption(
  page: Page,
  label: string,
  option: string,
): Promise<void> {
  const toolbar = page.getByTestId("pageframe-toolbar");
  await toolbar.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await page.keyboard.press("Escape");
}

async function openProjectCompare(page: Page): Promise<void> {
  await loginViaUi(page);
  await page.goto("/analysis/project-compare");
  await expect(page).toHaveURL(/\/analysis\/project-compare/, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("pageframe-toolbar")).toBeVisible({
    timeout: 60_000,
  });
}

/** Wait until the comparison tables for the chosen scope have real data. */
async function waitForComparisonTables(
  page: Page,
  anchorLabel = "上线",
): Promise<void> {
  await expect(page.getByText("项目对比趋势", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.locator('[data-best="true"]').first()).toBeVisible({
    timeout: 120_000,
  });
  await expect(
    page.getByText(new RegExp(`${anchorLabel} · 锚点后 30 天`)),
  ).toBeVisible({ timeout: 120_000 });
  const rows = page.locator(
    `table[aria-label="${anchorLabel}基准项目对比表"] tbody tr`,
  );
  await expect
    .poll(async () => rows.count(), { timeout: 120_000 })
    .toBeGreaterThan(0);
}

/**
 * Two projects that have a 上线 start date, read from the same metadata the
 * picker uses (the view never selects projects on its own).
 */
async function launchedProjectNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const token = window.localStorage.getItem("superset_token");
    const response = await fetch("/api/v1/project/profit-sharing", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await response.json();
    const seen = new Set<string>();
    const names: string[] = [];
    for (const row of body?.result ?? []) {
      const name = String(row.papp_name ?? "").trim();
      if (!name || !row["上线时间"] || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
      if (names.length === 2) break;
    }
    return names;
  });
}

/** Select projects in the filter bar by name prefix (option has a region tag). */
async function projectRegionLabel(
  page: Page,
  projectName: string,
): Promise<string> {
  return page.evaluate(async (name) => {
    const token = window.localStorage.getItem("superset_token");
    const response = await fetch("/api/v1/project/profit-sharing", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await response.json();
    for (const row of body?.result ?? []) {
      if (String(row.papp_name ?? "").trim() === name) {
        return String(row.region ?? "") === "oversea" ? "海外" : "国内";
      }
    }
    return "国内";
  }, projectName);
}

async function pickProjects(page: Page, names: string[]): Promise<void> {
  const toolbar = page.getByTestId("pageframe-toolbar");
  for (const name of names) {
    await toolbar.getByLabel("项目", { exact: true }).click();
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await page
      .getByRole("option", { name: new RegExp(`^${escaped}`) })
      .first()
      .click();
    await page.keyboard.press("Escape");
  }
}

/**
 * The comparison starts empty by design: choose 上线 and two launched projects
 * before the tables exist.  Returns the selected project names.
 */
async function setupComparison(
  page: Page,
  projectCount = 2,
): Promise<string[]> {
  const names = (await launchedProjectNames(page)).slice(0, projectCount);
  await pickFilterOption(page, "基准", "上线");
  await pickProjects(page, names);
  await waitForComparisonTables(page);
  return names;
}

const simple = (column: string) => ({
  expressionType: "SIMPLE",
  column: { column_name: column },
  aggregate: "SUM",
  label: column,
});

/** Run project-compare chart-data queries from the page's own session. */
async function runAnalysisQueries(
  page: Page,
  queries: Record<string, unknown>[],
): Promise<{ status: number; body: any }> {
  return page.evaluate(
    async (payload) => {
      const token = window.localStorage.getItem("superset_token");
      const csrfResponse = await fetch("/api/v1/security/csrf_token/", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      const csrf = (await csrfResponse.json()).result;
      const response = await fetch("/api/v1/bi/analysis/chart-data", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "X-CSRFToken": csrf,
        },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json() };
    },
    {
      topic: "project-compare",
      queries,
      result_type: "full",
      result_format: "json",
    },
  );
}

test.describe("项目对比分析专题", () => {
  test("a) 大厅卡片存在且可进入，无未完工标记", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await loginViaUi(page);
    await page.goto("/analysis");

    const card = page.getByRole("button", { name: "进入项目对比分析" });
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText("未完工", { exact: true })).toHaveCount(0);
    await card.click();
    await expect(page).toHaveURL(/\/analysis\/project-compare/, {
      timeout: 30_000,
    });
    await page.screenshot({ path: `${SHOTS}/01-hall-entry.png` });
    saveErrors("a-hall-entry", errors);
  });

  test("b) 整页只有项目对比；基准/窗口/项目/指标都在顶部筛选条，日期范围与地区/平台已移除", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await openProjectCompare(page);
    const toolbar = page.getByTestId("pageframe-toolbar");

    // Every comparison control is an autocomplete in the filter bar.
    for (const label of ["基准", "窗口", "项目", "指标", "媒体", "渠道商"]) {
      await expect(toolbar.getByLabel(label, { exact: true })).toBeVisible();
    }
    // The page date range is replaced by 基准 + 窗口; region/platform are gone.
    for (const label of ["日期范围", "主游戏", "地区", "平台"]) {
      await expect(toolbar.getByLabel(label, { exact: true })).toHaveCount(0);
    }
    // Column order: 渠道商 before 媒体, and the metric picker follows 媒体.
    const fieldOrder = await toolbar
      .locator(".MuiFormLabel-root")
      .allInnerTexts();
    const labels = fieldOrder.map((label) => label.trim());
    expect(labels).toEqual(["基准", "窗口", "项目", "渠道商", "媒体", "指标"]);
    // Nothing is pre-selected: the view asks for a 基准 first, then for 项目.
    await expect(page.getByText("请选择基准")).toBeVisible({
      timeout: 120_000,
    });

    // Standard sections are gone, together with their drill/compare switches.
    for (const text of ["核心指标", "维度拆解", "统计窗口", "对比上期"]) {
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    }
    // The comparison view keeps a refresh action but no filters of its own.
    await expect(page.getByRole("button", { name: "刷新" })).toHaveCount(0);
    await expect(page.getByText(/^快照 /)).toHaveCount(0);
    // With nothing selected there is no chart, hence no refresh action either.
    await expect(
      page.getByRole("button", { name: "重新查询对比数据" }),
    ).toHaveCount(0);

    await setupComparison(page);
    // Once the chart is rendered, 重新查询 sits in its header.
    await expect(
      page.getByRole("button", { name: "重新查询对比数据" }),
    ).toBeVisible();

    // The project multi-select must stay on the toolbar's single row even with
    // several long project names: it keeps one chip plus a "+N" counter.
    await expect(toolbar.getByText("+1", { exact: true })).toBeVisible();
    const autocompleteHeights = await toolbar
      .locator(".MuiAutocomplete-root")
      .evaluateAll((elements) =>
        elements.map((element) =>
          Math.round(element.getBoundingClientRect().height),
        ),
      );
    expect(autocompleteHeights.every((height) => height <= 40)).toBe(true);
    const compareSection = page
      .getByText("项目对比趋势", { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'MuiPaper-root')][1]");
    await expect(
      compareSection.getByLabel("项目", { exact: true }),
    ).toHaveCount(0);
    await expect(
      compareSection.getByLabel("指标", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/02-page-compare-only.png` });
    saveErrors("b-compare-only", errors);
  });

  test("c) 请求形态：只有日期分组的对比查询，不发排名/KPI/明细", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    const payloads = captureAnalysisPayloads(page);
    await openProjectCompare(page);
    // An empty scope must not issue any comparison query.
    await page.waitForTimeout(1500);
    expect(payloads, "no query before 基准/项目 selected").toEqual([]);

    await setupComparison(page);
    // Let any follow-up render settle so the captured list is complete.
    await page.waitForTimeout(1500);

    expect(payloads.length, "payload count").toBeGreaterThan(0);
    // There is no automatic ranking query any more: every request is a daily
    // section query (one per project × anchor).
    const ranking = payloads.flatMap((payload) =>
      (payload.queries ?? []).filter(
        (query) => (query.metrics ?? []).length < 14,
      ),
    );
    expect(ranking, "no ranking/lightweight queries").toEqual([]);

    const sectionQueries = payloads.flatMap((payload) => payload.queries ?? []);
    const kpiQueries = sectionQueries.filter(
      (query) => (query.groupby ?? []).length === 0,
    );
    expect(kpiQueries, "no KPI (empty groupby) queries").toEqual([]);
    const sectionOnly = sectionQueries.filter(
      (query) =>
        JSON.stringify(query.groupby) === JSON.stringify(["日期"]) &&
        (query.metrics ?? []).length >= 14,
    );
    expect(sectionOnly.length, "daily section queries").toBeGreaterThan(0);
    for (const query of sectionOnly) {
      expect(query.row_limit).toBe(800);
      // Every section query is scoped to one project and one federated side.
      const cols = (query.filters ?? []).map((filter) => filter.col);
      expect(cols).toContain("主游戏");
      expect(cols.some((col) => col === "地区" || col === "平台")).toBe(true);
    }

    writeFileSync(
      `${SHOTS}/request-shapes.json`,
      JSON.stringify(
        payloads.map((payload) =>
          (payload.queries ?? []).map((query) => ({
            groupby: query.groupby,
            metrics: (query.metrics ?? []).length,
            rowLimit: query.row_limit,
            timeRange: query.time_range,
          })),
        ),
        null,
        2,
      ),
      "utf8",
    );
    saveErrors("c-request-shapes", errors);
  });

  test("d) 对比表窗口合计与最优高亮；图表在卡片内带 日/周/月", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await openProjectCompare(page);
    await setupComparison(page);

    const table = page.locator('table[aria-label="上线基准项目对比表"]');
    const rows = table.locator("tbody tr");
    expect(await rows.count(), "selected project rows").toBe(2);
    // Window totals must be real numbers, not the "–" placeholder.
    const bodyText = await table.innerText();
    expect(bodyText).toMatch(/\d/);
    expect(bodyText).not.toContain("所选窗口未找到数据");

    // Best-value highlight is exposed as data-best; at least one per table.
    expect(await page.locator('[data-best="true"]').count()).toBeGreaterThan(0);

    // The wide table keeps a horizontal scrollbar pinned to the viewport
    // (the table's own scrollbar can sit below the fold) and stays in sync.
    const stickyScrollbar = page.getByTestId(
      "project-compare-sticky-scrollbar",
    );
    await expect(stickyScrollbar.first()).toBeVisible();
    const tableContainer = page.locator(".MuiTableContainer-root").first();
    await stickyScrollbar.first().evaluate((element) => {
      element.scrollLeft = 360;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect
      .poll(async () =>
        tableContainer.evaluate((element) => element.scrollLeft),
      )
      .toBe(360);

    // The detail table expands each project into the window's time buckets
    // (same day/week/month grain as the chart above).
    await expect(page.getByText("第1天", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "展开明细" }).click();
    await expect(
      page.getByText("第1天", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "收起明细" })).toBeVisible();
    await page.getByRole("button", { name: "收起明细" }).click();
    await expect(page.getByText("第1天", { exact: true })).toHaveCount(0);

    // Chart card: title + grain switch inside the card, next to the chart.
    const chartCard = page
      .getByText("项目对比趋势", { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'MuiPaper-root')][1]");
    await expect(chartCard).toBeVisible();
    for (const grain of ["日", "周", "月"]) {
      await expect(
        chartCard.getByRole("button", { name: grain, exact: true }),
      ).toBeVisible();
    }
    // The daily alignment is spelled out in the card header.
    await expect(page.getByText(/锚点后按日对齐/)).toBeVisible();
    // The ECharts wrapper renders exactly one canvas for this option.
    await expect(chartCard.locator(".echarts-for-react canvas")).toHaveCount(1);

    // 重新查询 is a chart-header action placed before the grain chips, not a
    // separate toolbar row.
    const refreshButton = chartCard.getByRole("button", {
      name: "重新查询对比数据",
    });
    await expect(refreshButton).toBeVisible();
    const [refreshBox, dayChipBox] = await Promise.all([
      refreshButton.boundingBox(),
      chartCard.getByRole("button", { name: "日", exact: true }).boundingBox(),
    ]);
    expect(refreshBox && dayChipBox).toBeTruthy();
    expect(refreshBox!.x).toBeLessThan(dayChipBox!.x);

    await page.screenshot({
      path: `${SHOTS}/03-default-table-chart.png`,
      fullPage: false,
    });
    saveErrors("d-default-view", errors);
  });

  test("e) 日/周/月 在图表内切换：本地重算、不发新请求", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    const payloads = captureAnalysisPayloads(page);
    await openProjectCompare(page);
    await setupComparison(page);
    await page.waitForTimeout(1200);
    const before = payloads.length;

    await page.getByRole("button", { name: "周", exact: true }).click();
    await expect(page.getByText(/锚点后按周对齐/)).toBeVisible();
    await page.waitForTimeout(800);
    expect(payloads.length, "week switch must not re-query").toBe(before);
    await page.screenshot({ path: `${SHOTS}/04-week-grain.png` });

    await page.getByRole("button", { name: "月", exact: true }).click();
    await expect(page.getByText(/锚点后按月对齐/)).toBeVisible();
    await page.waitForTimeout(800);
    expect(payloads.length, "month switch must not re-query").toBe(before);
    await page.screenshot({ path: `${SHOTS}/05-month-grain.png` });

    await page.getByRole("button", { name: "日", exact: true }).click();
    await expect(page.getByText(/锚点后按日对齐/)).toBeVisible();
    saveErrors("e-grain-switch", errors);
  });

  test("f) 基准多选：首测触发新一轮请求，出现分表或跳过提示", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    const payloads = captureAnalysisPayloads(page);
    await openProjectCompare(page);
    await setupComparison(page);
    await page.waitForTimeout(1200);
    const before = payloads.length;

    await pickFilterOption(page, "基准", "首测");
    await expect
      .poll(() => payloads.length, { timeout: 60_000 })
      .toBeGreaterThan(before);
    await expect
      .poll(() => decodeURIComponent(page.url()), { timeout: 30_000 })
      .toContain("anchor=首测起始时间");
    const skipped = page.getByText(/已跳过：/);
    const firstTestTable = page.locator(
      'table[aria-label="首测基准项目对比表"]',
    );
    await expect
      .poll(
        async () =>
          (await skipped.count()) > 0 || (await firstTestTable.count()) > 0,
        { timeout: 120_000 },
      )
      .toBe(true);

    const latest = payloads[payloads.length - 1].queries ?? [];
    expect(
      latest.length,
      "batch covers every project × anchor",
    ).toBeGreaterThan(0);
    // Whether 首测 sections exist or are all skipped, the batch is a multiple
    // of the selected project count (2).
    expect(latest.length % 2).toBe(0);

    await page.screenshot({ path: `${SHOTS}/06-first-test-anchor.png` });
    saveErrors("f-anchor", errors);
  });

  test("g) 窗口天数切换：表头与查询时间窗同步变化", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    const payloads = captureAnalysisPayloads(page);
    await openProjectCompare(page);
    await setupComparison(page);
    await page.waitForTimeout(1200);
    const before = payloads.length;

    await pickFilterOption(page, "窗口", "14天");
    await expect(page.getByText(/上线 · 锚点后 14 天/)).toBeVisible({
      timeout: 120_000,
    });
    // The filter-bar control is persisted in the URL, so the view is linkable.
    await expect
      .poll(() => page.url(), { timeout: 30_000 })
      .toContain("period=14");
    await expect
      .poll(() => payloads.length, { timeout: 60_000 })
      .toBeGreaterThan(before);

    const queries = payloads[payloads.length - 1].queries ?? [];
    expect(queries.length).toBeGreaterThan(0);
    const range = queries[0].time_range ?? "";
    const [start, end] = range.split(" : ");
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(end) - Date.parse(start)) / (24 * 60 * 60 * 1000);
    // The window can be capped by the next milestone, so it spans at most 14
    // days and exactly 14 when no later anchor truncates it.
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(14);

    await page.screenshot({ path: `${SHOTS}/07-window-14.png` });
    saveErrors("g-window", errors);
  });

  test("h) 查看 SQL：与页面实际执行的对比查询一一对应", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    const payloads = captureAnalysisPayloads(page);
    await openProjectCompare(page);
    const selectedProjects = await setupComparison(page);
    // The dialog compiles the queries for the current selection; let the
    // comparison batch settle first so its payload is comparable.
    await page.waitForTimeout(1500);
    const comparisonQueries = (payloads.at(-1)?.queries ?? []).map((query) => ({
      groupby: query.groupby,
      timeRange: query.time_range,
      rowLimit: query.row_limit,
      filters: query.filters,
    }));

    await page.getByRole("button", { name: /查看 SQL/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("默认视图 SQL · 项目对比分析")).toBeVisible();
    await expect(
      dialog.getByText(/与页面实际执行的请求一一对应/),
    ).toBeVisible();

    // One block per selected project × anchor, titled with its window.
    for (const project of selectedProjects) {
      await expect(
        dialog.getByText(new RegExp(`^${project}.*· 上线 ·`)),
      ).toBeVisible({ timeout: 60_000 });
    }
    // More than the old single illustrative query: exactly one per section.
    await expect(dialog.locator("pre")).toHaveCount(comparisonQueries.length);

    const mainlandSql = await dialog.locator("pre").first().innerText();
    expect(mainlandSql).toContain('GROUP BY "日期"');
    expect(mainlandSql).toContain("累计充值");
    // The SQL carries the same project + side filters the view sends.
    expect(mainlandSql).toContain('"主游戏" IN (');
    expect(
      mainlandSql.includes('"地区" IN (') ||
        mainlandSql.includes('"平台" IN ('),
    ).toBe(true);
    const firstWindow = comparisonQueries[0]?.timeRange ?? "";
    const [windowStart, windowEnd] = firstWindow.split(" : ");
    expect(mainlandSql).toContain(`DATE '${windowStart}'`);
    expect(mainlandSql).toContain(`DATE '${windowEnd}'`);
    await page.screenshot({ path: `${SHOTS}/08-sql-mainland.png` });

    await dialog.getByRole("tab", { name: "海外侧" }).click();
    await expect
      .poll(async () => dialog.locator("pre").first().innerText(), {
        timeout: 30_000,
      })
      .toContain("paid_money_total");
    await page.screenshot({ path: `${SHOTS}/09-sql-oversea.png` });

    await dialog.getByRole("tab", { name: "基础 SQL（含窗口标记）" }).click();
    await expect
      .poll(async () => dialog.locator("pre").first().innerText(), {
        timeout: 30_000,
      })
      .toContain("BI_WINDOW");

    await dialog.getByRole("button", { name: "关闭" }).click();
    await expect(dialog).toBeHidden();
    saveErrors("h-sql-dialog", errors);
  });

  test("i) 真实 API：双侧数据非空 + 窗口合计与日行加权一致", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await openProjectCompare(page);
    await expect(page.getByText("请选择基准")).toBeVisible({
      timeout: 120_000,
    });

    const cases = [
      {
        side: "domestic",
        project: "仙境传说：破晓",
        timeRange: "2025-04-01 : 2025-05-01",
        filters: [
          { col: "主游戏", op: "IN", val: ["仙境传说：破晓"] },
          { col: "地区", op: "IN", val: ["mainland"] },
        ],
      },
      {
        side: "oversea",
        project: "策定九州东南亚",
        timeRange: "2026-09-17 : 2026-10-17",
        filters: [
          { col: "主游戏", op: "IN", val: ["策定九州东南亚"] },
          { col: "平台", op: "IN", val: ["oversea"] },
        ],
      },
    ];
    const metrics = [
      simple("消耗"),
      simple("返点后消耗"),
      simple("新增进入"),
      "cpa",
      "roi_1",
    ];
    const base = (item: (typeof cases)[number], groupby: string[]) => ({
      result_type: "full",
      metrics,
      groupby,
      columns: [],
      filters: item.filters,
      granularity: "日期",
      time_range: item.timeRange,
      orderby: groupby.length > 0 ? [["日期", true]] : [],
      row_limit: groupby.length > 0 ? 800 : 1,
    });

    const evidence: Record<string, unknown>[] = [];
    for (const item of cases) {
      const totalResponse = await runAnalysisQueries(page, [
        base(item, []),
        base(item, ["日期"]),
      ]);
      expect(totalResponse.status, `${item.side} HTTP`).toBe(200);
      const [totalResult, dailyResult] = totalResponse.body?.result ?? [];
      expect(totalResult?.status, `${item.side} total status`).toBe("success");
      expect(dailyResult?.status, `${item.side} daily status`).toBe("success");

      const total = totalResult.data?.[0] ?? {};
      expect(Number(total["消耗"]), `${item.side} 消耗`).toBeGreaterThan(0);
      expect(
        Number(total["新增进入"]),
        `${item.side} 新增进入`,
      ).toBeGreaterThan(0);

      // Re-aggregate the daily rows exactly like the view does: additive
      // metrics are summed, rates are weighted by their denominator volume.
      const daily: Record<string, unknown>[] = dailyResult.data ?? [];
      expect(daily.length, `${item.side} daily rows`).toBeGreaterThan(0);
      const sum = (key: string) =>
        daily.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
      const weighted = (ratioKey: string, weightKey: string) => {
        let num = 0;
        let den = 0;
        for (const row of daily) {
          const ratio = Number(row[ratioKey]);
          const weight = Number(row[weightKey]);
          if (
            !Number.isFinite(ratio) ||
            !Number.isFinite(weight) ||
            weight === 0
          ) {
            continue;
          }
          num += ratio * weight;
          den += weight;
        }
        return den === 0 ? null : num / den;
      };

      expect(sum("消耗"), `${item.side} daily 消耗 sum`).toBeCloseTo(
        Number(total["消耗"]),
        4,
      );
      expect(sum("新增进入"), `${item.side} daily 新增 sum`).toBeCloseTo(
        Number(total["新增进入"]),
        4,
      );
      const weightedCpa = weighted("cpa", "新增进入");
      expect(weightedCpa, `${item.side} weighted CPA`).not.toBeNull();
      expect(
        weightedCpa!,
        `${item.side} weighted CPA ≈ window CPA`,
      ).toBeCloseTo(Number(total["cpa"]), 6);
      const weightedRoi = weighted("roi_1", "返点后消耗");
      expect(weightedRoi, `${item.side} weighted ROI1`).not.toBeNull();
      expect(
        weightedRoi!,
        `${item.side} weighted ROI1 ≈ window ROI1`,
      ).toBeCloseTo(Number(total["roi_1"]), 6);

      evidence.push({
        side: item.side,
        project: item.project,
        window: item.timeRange,
        dailyRows: daily.length,
        windowTotals: {
          spend: Number(total["消耗"]),
          newUsers: Number(total["新增进入"]),
          cpa: Number(total["cpa"]),
          roi1: Number(total["roi_1"]),
        },
        reAggregated: {
          spend: sum("消耗"),
          newUsers: sum("新增进入"),
          cpa: weightedCpa,
          roi1: weightedRoi,
        },
      });
    }
    writeFileSync(
      `${SHOTS}/api-window-consistency.json`,
      JSON.stringify(evidence, null, 2),
      "utf8",
    );
    // eslint-disable-next-line no-console
    console.log(`[api-consistency] ${JSON.stringify(evidence)}`);
    saveErrors("i-api", errors);
  });

  test("k) 项目与指标筛选：选择后驱动对比视图并写入链接", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await openProjectCompare(page);
    await setupComparison(page);
    const toolbar = page.getByTestId("pageframe-toolbar");

    // Read one project that is known to have a 上线 window from the table,
    // then narrow the comparison to exactly that project.
    const firstRow = page
      .locator('table[aria-label="上线基准项目对比表"] tbody tr')
      .first();
    const cells = firstRow.locator("td");
    const projectName = (await cells.nth(0).innerText()).trim();
    // The comparison table no longer has a 地区 column; resolve it from the
    // project metadata to build the filter option label.
    const regionLabel = await projectRegionLabel(page, projectName);
    await toolbar.getByRole("button", { name: "重置" }).click();
    await expect(page.getByText("请选择基准")).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => decodeURIComponent(page.url()), { timeout: 30_000 })
      .not.toContain("project=");

    await pickFilterOption(page, "基准", "上线");
    await pickProjects(page, [`${projectName}（${regionLabel}）`]);
    await waitForComparisonTables(page);

    await expect
      .poll(() => decodeURIComponent(page.url()), { timeout: 30_000 })
      .toContain("project=");
    await expect
      .poll(
        async () =>
          page
            .locator('table[aria-label="上线基准项目对比表"] tbody tr')
            .count(),
        { timeout: 120_000 },
      )
      .toBe(1);
    await expect(
      page.locator('table[aria-label="上线基准项目对比表"] tbody tr'),
    ).toContainText(projectName);

    // The chart metric is a single-select autocomplete as well.
    await toolbar.getByLabel("指标", { exact: true }).click();
    await page.getByRole("option", { name: "CPA", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("CPA项目对比趋势图")).toBeVisible({
      timeout: 60_000,
    });
    await expect
      .poll(() => decodeURIComponent(page.url()), { timeout: 30_000 })
      .toContain("metric=cpa");

    await page.screenshot({ path: `${SHOTS}/11-project-metric-filter.png` });
    saveErrors("k-project-metric", errors);
  });

  test("j) 成本分析回归：KPI/趋势/明细/刷新/查看 SQL 仍正常", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await loginViaUi(page);
    await page.goto("/analysis/cost");
    await expect(page.getByTestId("pageframe-toolbar")).toBeVisible({
      timeout: 60_000,
    });
    // Cost keeps its standard sections and the header refresh action.
    await expect(page.getByText("核心指标", { exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByText("维度拆解")).toBeVisible();
    await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
    // KPI numbers finish loading from real federated data.
    await expect
      .poll(
        async () => (await page.getByText(/^\d[\d,.]*[KMB万亿]?$/).count()) > 0,
        { timeout: 120_000 },
      )
      .toBe(true);

    await page.getByRole("button", { name: /查看 SQL/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("默认视图 SQL · 成本分析")).toBeVisible();
    await expect(dialog.getByText("KPI 当前期", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "关闭" }).click();

    await page.screenshot({ path: `${SHOTS}/10-cost-regression.png` });
    saveErrors("j-cost-regression", errors);
  });
});
