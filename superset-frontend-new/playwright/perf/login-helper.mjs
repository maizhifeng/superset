/**
 * Deterministic UI login for perf probes.
 *
 * The login form occasionally swallows the first submit (races the auth
 * store hydration), so this waits for the login POST explicitly and retries
 * the click until the request fires and a session token lands in
 * localStorage.
 */
import { E2E_USER_DEFAULT, E2E_PASSWORD_DEFAULT } from "./credentials.mjs";

export async function loginDeterministic(context, baseUrl) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.evaluate(() =>
    localStorage.setItem("superset_dismiss_tour_v2", "1"),
  );

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await page.getByLabel("用户名", { exact: true }).fill(E2E_USER_DEFAULT);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD_DEFAULT);

    const respPromise = page
      .waitForResponse((r) => /security\/login/.test(r.url()), {
        timeout: 6000,
      })
      .catch(() => null);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    const resp = await respPromise;

    if (resp && resp.status() === 200) {
      await page.waitForFunction(
        () => Boolean(window.localStorage.getItem("superset_user")),
        null,
        { timeout: 10000 },
      );
      return page;
    }
    console.log(
      `[login] attempt ${attempt} did not fire (resp=${resp ? resp.status() : "none"}), retrying`,
    );
  }
  throw new Error("login failed after 4 attempts");
}
