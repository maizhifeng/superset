#!/usr/bin/env node
/**
 * Warm the 专题分析 Redis cache from cron.
 *
 * Opens the analysis hub in headless Chromium: the hub schedules a background
 * warmup of the default 30-day plans (KPI + trend + breakdown for all topics).
 * The script waits until the warmup's chart-data requests go quiet, then exits.
 *
 * Usage:
 *   PREWARM_USERNAME=analyst PREWARM_PASSWORD=*** npm run prewarm:analysis
 * Optional: PREWARM_BASE_URL (default http://localhost:9000)
 */
import { chromium } from "playwright";

const BASE_URL = process.env.PREWARM_BASE_URL ?? "http://localhost:9000";
const USERNAME = process.env.PREWARM_USERNAME;
const PASSWORD = process.env.PREWARM_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error(
    "PREWARM_USERNAME and PREWARM_PASSWORD are required (dedicated service account recommended).",
  );
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("用户名", { exact: true }).fill(USERNAME);
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 60_000,
  });
  await page.evaluate(() =>
    localStorage.setItem("superset_dismiss_tour_v2", "1"),
  );

  let inFlight = 0;
  let completed = 0;
  page.on("request", (request) => {
    if (
      request.url().includes("/api/v1/bi/chart/data") &&
      request.method() === "POST"
    ) {
      inFlight += 1;
    }
  });
  page.on("requestfinished", (request) => {
    if (request.url().includes("/api/v1/bi/chart/data")) {
      inFlight = Math.max(0, inFlight - 1);
      completed += 1;
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/v1/bi/chart/data")) {
      inFlight = Math.max(0, inFlight - 1);
    }
  });

  await page.goto(`${BASE_URL}/analysis`, { waitUntil: "domcontentloaded" });

  const deadline = Date.now() + 10 * 60_000;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_000);
    if (completed === 0 && Date.now() - quietSince > 20_000) {
      // Warmup may not have started yet (idle callback delay).
      continue;
    }
    if (inFlight === 0 && completed > 0) {
      if (Date.now() - quietSince > 8_000) break;
    } else {
      quietSince = Date.now();
    }
  }
  console.log(`prewarm finished: ${completed} chart-data request(s)`);
} finally {
  await browser.close();
}
