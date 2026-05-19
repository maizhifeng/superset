import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("displays login form with branding", async ({ page }) => {
    await expect(page.getByText("starfly")).toBeVisible();
    await expect(page.getByText("Sign in to continue")).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.getByLabel("Username").fill("invalid");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Login failed")).toBeVisible({
      timeout: 10000,
    });
  });

  test("redirects to home on successful login", async ({ page }) => {
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL("/", { timeout: 10000 });
  });

  test("redirects to original page after login", async ({ page }) => {
    await page.goto("/chart/list");
    await page.waitForURL("/login");

    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL("/chart/list", { timeout: 10000 });
  });

  test("disables form during submission", async ({ page }) => {
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("admin");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByRole("button")).toBeDisabled();
  });
});
