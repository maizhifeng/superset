/**
 * Shared E2E credentials. Override per environment with E2E_USER /
 * E2E_PASSWORD; the defaults match the local docker-compose dev stack.
 */
export const E2E_USER = process.env.E2E_USER ?? "zhifeng.mai@rastar.com";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "admin123";

/** Fill the login form and submit through the UI. */
export async function loginViaUi(
  page: import("@playwright/test").Page,
  user = E2E_USER,
  password = E2E_PASSWORD,
): Promise<void> {
  await page.goto("/login");
  // Pre-dismiss the onboarding tour so it never blocks interactions.
  await page.evaluate(() => {
    window.localStorage.setItem("superset_dismiss_tour_v2", "1");
  });
  await page.getByLabel("用户名", { exact: true }).fill(user);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  // Safety net: close the tour guide if it still shows up.
  const skip = page.getByRole("button", { name: "跳过" });
  try {
    await skip.waitFor({ state: "visible", timeout: 3000 });
    await skip.click();
  } catch {
    /* tour not shown */
  }
}
