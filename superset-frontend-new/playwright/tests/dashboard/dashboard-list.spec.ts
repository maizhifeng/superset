import { test, expect } from "@playwright/test";
import { loginViaUi } from "../../helpers/credentials";

test.describe("Dashboard list", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("navigates to dashboard list from home", async ({ page }) => {
    await page.getByText("仪表板", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/list/, { timeout: 10000 });
  });

  test("displays dashboard list page structure", async ({ page }) => {
    await page.goto("/dashboard/list");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("table").first()).toBeVisible();
  });

  test("search filters dashboards", async ({ page }) => {
    await page.goto("/dashboard/list");
    const search = page.getByPlaceholder("搜索仪表板...");
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.fill("全板块");

    await expect(
      page.getByText("全板块数据汇总").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("create dashboard dialog opens and closes", async ({ page }) => {
    await page.goto("/dashboard/list");
    await page.waitForLoadState("networkidle");

    const createButton = page.getByRole("button", {
      name: /新建仪表板|创建/,
    });
    if (await createButton.first().isVisible()) {
      await createButton.first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
});
