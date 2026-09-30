/**
 * Briefing Feishu push settings dialog.
 *
 * Opens the dialog from the briefing list against the running stack and checks
 * the deployment status it reports.  It deliberately never presses 测试推送 or
 * 立即推送: those send real messages to the configured Feishu targets, which a
 * test suite must not do.
 */
import { test, expect } from "@playwright/test";
import { loginViaUi } from "../../helpers/credentials";

test("opens the Feishu push settings from the briefing list", async ({
  page,
}) => {
  await loginViaUi(page);
  await page.goto("/briefing");

  // The list renders one 飞书推送 action per briefing (icon button with a
  // tooltip, hence the accessible name).
  const feishuButtons = page.getByRole("button", { name: "飞书推送" });
  await expect(feishuButtons.first()).toBeVisible();
  await feishuButtons.first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/飞书推送：/)).toBeVisible();
  // Wait for the settings request to settle: the action buttons are disabled
  // while loading, and the status alerts below only reflect server state once
  // it has arrived.
  await expect(dialog.getByRole("button", { name: "保存" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "测试推送" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "保存" })).toBeVisible();

  // Deployment status: either the app credentials are wired up (the dialog
  // offers the bot's groups) or it explains how to configure them.
  const configured = await dialog
    .getByText(/^应用 /)
    .isVisible()
    .catch(() => false);
  if (configured) {
    await expect(dialog.getByText(/未配置飞书应用凭证/)).toHaveCount(0);
  } else {
    await expect(dialog.getByText(/未配置飞书应用凭证/)).toBeVisible();
  }

  await page.screenshot({
    path: "test-results/briefing-feishu/dialog.png",
    fullPage: false,
  });

  // The chapter card is configurable: charts always travel, the detail tables
  // are opt-in.  Only the switch is exercised here — the buttons that post to
  // Feishu are never pressed by the test suite.
  const tablesSwitch = dialog.getByRole("switch", {
    name: /推送子表格/,
  });
  await expect(tablesSwitch).toBeVisible();
  await tablesSwitch.click();
  await expect(tablesSwitch).toBeChecked();
  await tablesSwitch.click();
  await expect(tablesSwitch).not.toBeChecked();

  // Adding a target row must work without saving anything.  With credentials
  // in place the chat target renders the bot's group picker (no group name is
  // asserted: it depends on the tenant the stack points at).
  await dialog.getByRole("button", { name: /添加目标/ }).click();
  if (configured) {
    const picker = dialog.getByLabel("选择群（机器人所在的群）");
    await expect(picker).toBeVisible();
    await picker.click();
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    await expect(
      page.getByRole("option", { name: "手动填写 chat_id" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await expect(dialog.getByLabel("目标 ID")).toBeVisible();
  }
  await page.screenshot({
    path: "test-results/briefing-feishu/dialog-with-target.png",
    fullPage: false,
  });

  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toBeHidden();
});
