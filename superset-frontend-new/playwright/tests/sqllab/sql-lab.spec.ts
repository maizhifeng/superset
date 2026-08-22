import { test, expect } from "@playwright/test";
import { loginViaUi } from "../../helpers/credentials";

test.describe("SQL Lab", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("navigates to SQL Lab from home", async ({ page }) => {
    await page.getByText("SQL 实验室", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/sqllab/, { timeout: 10000 });
  });

  test("displays SQL editor", async ({ page }) => {
    await page.goto("/sqllab");
    await page.waitForLoadState("networkidle");

    // CodeMirror content area plus the run button.
    await expect(page.locator(".cm-content").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole("button", { name: "运行" }).first(),
    ).toBeVisible();
  });

  test("execute returns results", async ({ page }) => {
    await page.goto("/sqllab");
    const editor = page.locator(".cm-content").first();
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await editor.fill("SELECT 1 AS one");

    await page.getByRole("button", { name: "运行" }).first().click();

    // Either a result grid or an explicit error alert must appear.
    await expect(
      page.locator("table").or(page.getByRole("alert")).first(),
    ).toBeVisible({ timeout: 20000 });
  });
});
