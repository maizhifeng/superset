import { test, expect } from "@playwright/test";
import { E2E_USER, E2E_PASSWORD } from "../../helpers/credentials";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("displays login form with branding", async ({ page }) => {
    await expect(page.getByText("starfly")).toBeVisible();
    await expect(page.getByText("登录以继续")).toBeVisible();
    await expect(page.getByLabel("用户名", { exact: true })).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.getByLabel("用户名", { exact: true }).fill(E2E_USER);
    await page
      .getByLabel("密码", { exact: true })
      .fill("definitely-wrong-password");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
  });

  test("redirects to home on successful login", async ({ page }) => {
    await page.getByLabel("用户名", { exact: true }).fill(E2E_USER);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL("/", { timeout: 15000 });
  });

  test("redirects to original page after login", async ({ page }) => {
    await page.goto("/chart/list");
    await page.waitForURL(/\/login/);

    await page.getByLabel("用户名", { exact: true }).fill(E2E_USER);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL("/chart/list", { timeout: 15000 });
  });

  test("disables form during submission", async ({ page }) => {
    // Delay the login API so the submitting state is observable.
    await page.route("**/api/v1/security/login", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.getByLabel("用户名", { exact: true }).fill(E2E_USER);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "登录" }).click();

    const submit = page.getByRole("button", { name: /登录/ });
    await expect(submit).toBeDisabled();
  });
});
