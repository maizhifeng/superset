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

    await expect(
      page.locator('[role="grid"], [role="button"][aria-pressed]').first(),
    ).toBeVisible();
  });

  test("search filters charts", async ({ page }) => {
    await page.goto("/chart/list");
    const search = page.getByPlaceholder("搜索图表...");
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.fill("充值");
    await expect(search).toHaveValue("充值");

    // Every visible row should match the search term.
    await page.waitForLoadState("networkidle");
    const rows = page.locator(
      '.MuiDataGrid-row, [role="button"][aria-pressed]',
    );
    const labels = await rows.evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          node.textContent?.trim() || node.getAttribute("aria-label") || "",
      ),
    );
    expect(labels.every((label) => label.includes("充值"))).toBe(true);
  });
});
