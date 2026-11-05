import { test, expect } from "@playwright/test";
import { loginViaUi } from "../../helpers/credentials";

// 可视化组装器回归：阶段多到超出组装区高度时，左列必须可滚动且阶段卡片
// 不能被纵向 flex 压缩（否则较早阶段的步骤会被裁切且没有滚动条）。
const SQL_DATABASE = process.env.E2E_SQL_DATABASE ?? "2";
const SQL_SCHEMA = process.env.E2E_VISUAL_SCHEMA ?? "sj_report_data";
const SQL_TABLE = process.env.E2E_VISUAL_TABLE ?? "ad_data_sum_report";

test.describe("SQL Lab 可视化组装器滚动", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("多阶段超出组装区高度时可滚动，阶段卡片不被压扁", async ({
    page,
  }) => {
    // xs 布局（手机）由外层容器整体滚动，左列不单独滚动，本用例只覆盖 md+。
    const viewport = page.viewportSize();
    test.skip((viewport?.width ?? 0) < 900, "仅覆盖桌面端 md+ 布局");
    await page.evaluate(
      ([databaseId, schema]) => {
        window.localStorage.setItem(
          "superset-sql-lab-last-database",
          databaseId,
        );
        window.localStorage.setItem("superset-sql-lab-last-schema", schema);
        window.localStorage.setItem("superset-sqllab-mode", "visual");
      },
      [SQL_DATABASE, SQL_SCHEMA] as const,
    );
    await page.goto("/sqllab");

    // 第一个阶段默认展开「数据源」，表清单加载完成后才能选择数据表。
    const tableInput = page.getByPlaceholder("搜索并选择数据表");
    await expect(tableInput).toBeEnabled({ timeout: 20000 });
    await tableInput.click();
    await tableInput.fill(SQL_TABLE);
    await page
      .getByRole("option", { name: SQL_TABLE, exact: true })
      .first()
      .click();

    // 展开字段步骤，让首个阶段内容更高，更容易触发溢出。
    await page.getByText("字段", { exact: true }).first().click();

    const addStageButton = page.getByRole("button", {
      name: "添加阶段（CTE）",
    });
    const addStage = async () => {
      await addStageButton.click();
      await page
        .getByRole("combobox", { name: "数据来源类型" })
        .last()
        .click();
      await page
        .getByRole("option", { name: "上游阶段（CTE）", exact: true })
        .last()
        .click();
      await page.getByRole("button", { name: "确认切换" }).last().click();
      await expect(addStageButton).toBeEnabled({ timeout: 5000 });
    };
    await addStage();
    await addStage();

    await expect(page.getByTestId("viz-stage-card")).toHaveCount(3);

    // 阶段卡片保持自然高度（不被压扁到折叠高度以下）。
    const cardHeights = await page
      .getByTestId("viz-stage-card")
      .evaluateAll((cards) =>
        cards.map((card) => card.getBoundingClientRect().height),
      );
    for (const height of cardHeights) expect(height).toBeGreaterThan(240);

    // 左列是滚动容器：内容高度大于可视高度。
    const column = page.getByTestId("viz-stage-column");
    const sizes = await column.evaluate((el) => ({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }));
    expect(sizes.scrollHeight).toBeGreaterThan(sizes.clientHeight + 120);

    // 滚轮可在组装区内部滚动（页面本身不承担滚动）。
    const box = await column.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 80, box!.y + 80);
    await page.mouse.wheel(0, 800);
    await expect
      .poll(() => column.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // 滚回顶部后，第一阶段展开的「字段」内容重新可见。
    await column.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(page.getByPlaceholder("搜索列...")).toBeInViewport();
  });
});
