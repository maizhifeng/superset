import { test, expect, type Page } from "@playwright/test";
import { loginViaUi } from "../../helpers/credentials";

// 生成 SQL 精简回归：所选模式的表不再带模式前缀、安全标识符不加引号、
// 数值筛选字面量不加引号，并且执行时携带 schema（PostgreSQL 系引擎据此
// 设置 search_path），所以精简后的 SQL 仍可直接运行。
const SQL_DATABASE = process.env.E2E_SQL_DATABASE ?? "2";
const SQL_SCHEMA = process.env.E2E_VISUAL_SCHEMA ?? "inland_sdk_log";
const SQL_TABLE = process.env.E2E_VISUAL_TABLE ?? "sy_user_login_log";

/** Open a ColumnRefSelect and pick an option by its leading column name. */
async function selectColumn(page: Page, comboIndex: number, column: string) {
  const combo = page
    .locator('[role="combobox"]')
    .filter({ hasText: "选择字段" })
    .nth(comboIndex);
  await combo.click();
  await expect
    .poll(
      async () => {
        const options = await page.getByRole("option").allInnerTexts();
        return options.findIndex((option) =>
          option.startsWith(`${column}\n`),
        );
      },
      { timeout: 10000 },
    )
    .toBeGreaterThan(-1);
  const options = await page.getByRole("option").allInnerTexts();
  const index = options.findIndex((option) => option.startsWith(`${column}\n`));
  await page.getByRole("option").nth(index).click();
}

async function openVisualBuilder(page: Page) {
  await page.evaluate(
    ([databaseId, schema]) => {
      window.localStorage.setItem("superset-sql-lab-last-database", databaseId);
      window.localStorage.setItem("superset-sql-lab-last-schema", schema);
      window.localStorage.setItem("superset-sqllab-mode", "visual");
    },
    [SQL_DATABASE, SQL_SCHEMA] as const,
  );
  await page.goto("/sqllab");
  const tableInput = page.getByPlaceholder("搜索并选择数据表");
  await expect(tableInput).toBeEnabled({ timeout: 20000 });
  await tableInput.click();
  await tableInput.fill(SQL_TABLE);
  await page
    .getByRole("option", { name: SQL_TABLE, exact: true })
    .first()
    .click();
}

async function addFilter(
  page: Page,
  column: string,
  operator: string,
  values: string[],
) {
  await page.getByRole("button", { name: "添加筛选" }).first().click();
  const combos = page
    .locator('[role="combobox"]')
    .filter({ hasText: "选择字段" });
  await selectColumn(page, (await combos.count()) - 1, column);
  await page
    .locator('[role="combobox"]')
    .filter({ hasText: "等于" })
    .last()
    .click();
  await page.getByRole("option", { name: operator, exact: true }).last().click();
  const numberInputs = page.getByRole("spinbutton");
  const total = await numberInputs.count();
  const start = total - values.length;
  for (let i = 0; i < values.length; i += 1) {
    await numberInputs.nth(start + i).fill(values[i]);
  }
}

test.describe("SQL Lab 可视化组装器 SQL 精简", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("省略模式前缀与多余引号，且精简后的 SQL 可以直接运行", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    test.skip((viewport?.width ?? 0) < 900, "仅覆盖桌面端布局");

    await openVisualBuilder(page);

    // 汇总：分组 device_id + 自定义指标（别名手动填「显示名」）。
    await page.getByText("汇总", { exact: true }).first().click();
    await page.getByRole("button", { name: "添加分组维度" }).first().click();
    await selectColumn(page, 0, "device_id");
    await page.getByRole("button", { name: "添加指标" }).first().click();
    await page
      .locator('[role="combobox"]')
      .filter({ hasText: "计数 COUNT(*)" })
      .first()
      .click();
    await page.getByRole("option", { name: "自定义 SQL", exact: true }).click();
    const metricInput = page.getByPlaceholder(/自定义聚合 SQL/);
    await metricInput.click();
    await metricInput.fill(
      "min(to_date(device_enter_date::text, 'YYYYMMDD'))",
    );
    await page.getByLabel("显示名").fill("enter_dt");

    // 筛选：papp_id = 380、device_enter_date BETWEEN 20261027 AND 20261103。
    await page.getByText("筛选", { exact: true }).first().click();
    await addFilter(page, "papp_id", "等于", ["380"]);
    await addFilter(page, "device_enter_date", "介于", [
      "20261027",
      "20261103",
    ]);

    const preview = page.getByTestId("viz-sql-preview");
    await expect(preview).toContainText(
      "min(to_date(device_enter_date::text, 'YYYYMMDD')) AS enter_dt",
    );
    // 模式前缀、标识符双引号、分组列的同名别名、数值字面量引号都被精简。
    await expect(preview).not.toContainText('"');
    await expect(preview).not.toContainText(`${SQL_SCHEMA}.`);
    await expect(preview).not.toContainText("AS device_id");
    // 单表查询列引用不带表前缀。
    await expect(preview).toContainText("SELECT\n  device_id,");
    await expect(preview).not.toContainText("sy_user_login_log.");
    await expect(preview).toContainText("WHERE\n  papp_id = 380");
    await expect(preview).toContainText(
      "AND device_enter_date BETWEEN 20261027 AND 20261103",
    );
    await expect(preview).toContainText("GROUP BY\n  device_id");

    // 精简后的 SQL 可直接运行（执行请求携带 schema）。
    await page.getByRole("button", { name: "运行", exact: true }).first().click();
    await expect(
      page.getByText(/query #\d+ · server query #\d+ · success/),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("columnheader", { name: /enter_dt/ })).toBeVisible(
      { timeout: 30000 },
    );
  });
});
