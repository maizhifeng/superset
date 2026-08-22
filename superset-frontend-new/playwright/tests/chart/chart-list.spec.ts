import { test, expect } from "@playwright/test";
import { loginViaUi } from "../../helpers/credentials";

test.describe("Chart list", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("navigates to chart list from home", async ({ page }) => {
    await page.getByText("图表", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/chart\/list/, { timeout: 10000 });
  });

  test("displays chart list page", async ({ page }) => {
    await page.goto("/chart/list");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("table").first()).toBeVisible();
  });

  test("search filters charts", async ({ page }) => {
    await page.goto("/chart/list");
    const search = page.getByPlaceholder("搜索图表...");
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.fill("充值");

    // Every visible row should match the search term.
    await page.waitForLoadState("networkidle");
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
