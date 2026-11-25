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

import { test, expect } from "@playwright/test";
import { getE2EUser, getE2EPassword } from "../../helpers/credentials";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("displays login form with branding", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "starfly", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("登录以继续")).toBeVisible();
    await expect(page.getByLabel("用户名", { exact: true })).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.getByLabel("用户名", { exact: true }).fill(getE2EUser());
    await page
      .getByLabel("密码", { exact: true })
      .fill("definitely-wrong-password");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
  });

  test("redirects to home on successful login", async ({ page }) => {
    await page.getByLabel("用户名", { exact: true }).fill(getE2EUser());
    await page.getByLabel("密码", { exact: true }).fill(getE2EPassword());
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL("/", { timeout: 15000 });
  });

  test("redirects to original page after login", async ({ page }) => {
    await page.goto("/chart/list");
    await page.waitForURL(/\/login/);

    await page.getByLabel("用户名", { exact: true }).fill(getE2EUser());
    await page.getByLabel("密码", { exact: true }).fill(getE2EPassword());
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL("/chart/list", { timeout: 15000 });
  });

  test("disables form during submission", async ({ page }) => {
    // Delay the login API so the submitting state is observable.
    await page.route("**/api/v1/security/login", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.getByLabel("用户名", { exact: true }).fill(getE2EUser());
    await page.getByLabel("密码", { exact: true }).fill(getE2EPassword());
    await page.getByRole("button", { name: "登录" }).click();

    const submit = page.getByRole("button", { name: /登录/ });
    await expect(submit).toBeDisabled();
  });
});
