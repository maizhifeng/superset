import { test, expect } from "@playwright/test";
import { loginViaUi } from "../../helpers/credentials";

/**
 * 媒体表现分析 drill-down: the media spend chart opens a media's 主游戏
 * breakdown, and the table below expands the same cut per media row.
 *
 * The section needs a generated briefing, so a stack without one skips rather
 * than failing — the interaction is only meaningful with a stored result.
 */
test.describe("Briefing media drill-down", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/briefing/1");
  });

  test("drills a media bar into its 主游戏 breakdown and back", async ({
    page,
  }) => {
    const section = page.locator("#sec-media");
    await expect(section).toBeVisible({ timeout: 20000 });
    const chart = section.getByRole("img").first();
    if ((await chart.count()) === 0) {
      test.skip(true, "no generated briefing result to drill into");
    }

    const title = section.getByText(/^媒体消耗分布/);
    await expect(title).toBeVisible();
    const back = section.getByRole("button", { name: "返回全部媒体" });

    // The canvas mounts only after ECharts loads, and its bars grow from zero
    // width over the shared 300ms chart animation.  Clicking before the canvas
    // exists (or mid-growth) lands on empty plot and never reaches a bar, so
    // wait for the canvas and let the entrance animation settle first.
    await expect(chart.locator("canvas").first()).toBeVisible();
    await page.waitForTimeout(600);

    // The bars are ECharts canvas, so the click has to be aimed: the plot area
    // starts at the axis gutter (wider when the 客户端 headings are in play),
    // and each row is one bar — a platform heading first, then the media that
    // bought on it.  The chart's own aria label lists every row, so the
    // geometry comes from it, and the first rows are tried until one carries
    // a bar (the leading row is a heading).
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    const aria = (await chart.getAttribute("aria-label")) ?? "";
    const plotted =
      (aria.split("；")[0]?.split("：").slice(1).join("：") ?? "")
        .split("，")
        .filter(Boolean).length || 1;
    const plotLeft = aria.includes("【") ? 150 : 96;
    const band = ((box?.height ?? 200) - 32) / plotted;
    let drilled = false;
    for (let index = 0; index < Math.min(3, plotted) && !drilled; index += 1) {
      await chart.click({
        position: { x: plotLeft + 8, y: 8 + band * (index + 0.5) },
      });
      drilled = await back
        .waitFor({ state: "visible", timeout: 1500 })
        .then(() => true)
        .catch(() => false);
    }
    expect(drilled).toBe(true);

    await expect(section.getByText(/× 主游戏 消耗分布$/).first()).toBeVisible();
    await page.screenshot({
      path: "test-results/briefing-drill/drilled.png",
      fullPage: false,
    });

    await back.click();
    await expect(title).toBeVisible();
  });

  test("expands a media row into its 主游戏 rows", async ({ page }) => {
    const section = page.locator("#sec-media");
    await expect(section).toBeVisible({ timeout: 20000 });
    const table = section.getByRole("table");
    if ((await table.count()) === 0) {
      test.skip(true, "no generated briefing result to inspect");
    }

    // The button is located through its row: expanding renames it (展开 → 收起),
    // so a name-based locator would jump to the next collapsed media.
    const firstRow = table.locator("tbody tr").first();
    const expand = firstRow.getByRole("button");
    if ((await expand.count()) === 0) {
      test.skip(true, "the stored result predates the 媒体 × 主游戏 rows");
    }

    const rowsBefore = await table.locator("tbody tr").count();
    await expand.click();
    await expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(await table.locator("tbody tr").count()).toBeGreaterThan(rowsBefore);
    await page.screenshot({
      path: "test-results/briefing-drill/expanded.png",
      fullPage: false,
    });

    // 分主游戏 opens every media at once, so the toggle reflects all of them.
    const toggle = section.getByRole("button", { name: /主游戏$/ });
    await toggle.click();
    const collapsed = section.getByRole("button", {
      name: /^展开 .* 的主游戏明细$/,
    });
    await expect(collapsed).toHaveCount(0);
  });

  test("swaps the media table's outer and inner dimensions", async ({
    page,
  }) => {
    const section = page.locator("#sec-media");
    await expect(section).toBeVisible({ timeout: 20000 });
    const table = section.getByRole("table");
    if ((await table.count()) === 0) {
      test.skip(true, "no generated briefing result to inspect");
    }

    const swap = section.getByRole("button", { name: "调换维度" });
    if ((await swap.count()) === 0) {
      test.skip(true, "the stored result predates the 媒体 × 主游戏 rows");
    }

    await expect(
      section.getByRole("heading", { name: "媒体 × 主游戏 明细（含环比）" }),
    ).toBeVisible();

    await swap.click();
    await expect(
      section.getByRole("heading", { name: "主游戏 × 媒体 明细（含环比）" }),
    ).toBeVisible();
    // The outer column and the expand-all control follow the swap.
    await expect(table.locator("thead th").first()).toHaveText("主游戏");
    await expect(section.getByRole("button", { name: "分媒体" })).toBeVisible();

    // Expanding an outer row now discloses the media the game ran through.
    const rowsBefore = await table.locator("tbody tr").count();
    await table.locator("tbody tr").first().getByRole("button").click();
    await expect
      .poll(async () => table.locator("tbody tr").count())
      .toBeGreaterThan(rowsBefore);
    await page.screenshot({
      path: "test-results/briefing-drill/swapped.png",
      fullPage: false,
    });

    await swap.click();
    await expect(
      section.getByRole("heading", { name: "媒体 × 主游戏 明细（含环比）" }),
    ).toBeVisible();
    await expect(table.locator("thead th").first()).toHaveText("媒体");
  });
});
