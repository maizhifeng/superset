/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

export function getE2EUser(): string {
  const user = process.env.E2E_USER?.trim();
  if (!user) {
    throw new Error(
      "E2E_USER is required to run authenticated Playwright tests",
    );
  }
  return user;
}

export function getE2EPassword(): string {
  const password = process.env.E2E_PASSWORD;
  if (!password) {
    throw new Error(
      "E2E_PASSWORD is required to run authenticated Playwright tests",
    );
  }
  return password;
}

export async function loginViaUi(
  page: import("@playwright/test").Page,
  user = getE2EUser(),
  password = getE2EPassword(),
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
