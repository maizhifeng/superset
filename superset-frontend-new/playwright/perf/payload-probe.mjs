/**
 * Captures the ACTUAL wide-data payload the dashboard receives:
 * uncompressed byte size, row count, column count, and precise
 * resource timings (buffer enlarged beyond the 250-entry default).
 *
 * Uses the proven pattern from dashboard-load-perf.mjs: log in once,
 * then open a FRESH page per measured load (navigating the just-logged-in
 * SPA page races the auth guard and bounces to /login).
 */
import { chromium } from "@playwright/test";
import { loginDeterministic } from "./login-helper.mjs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://192.168.23.34:9000";
const DASHBOARD_ID = process.argv[2] ?? "14";

const browser = await chromium.launch();
const context = await browser.newContext();

// Login once (deterministic, retries until the POST fires).
const loginPage = await loginDeterministic(context, BASE_URL);
await loginPage.close();

function attachCapture(page) {
  page.on("response", async (r) => {
    if (/bi\/pivot\/wide-data/.test(r.url())) {
      try {
        const headers = r.headers();
        const text = await r.text();
        const json = JSON.parse(text);
        const res = json?.result?.[0];
        const rows = Array.isArray(res?.data) ? res.data : [];
        console.log(
          `[capture] wire-enc=${headers["content-encoding"] ?? "(none)"} ` +
            `uncompressed=${Math.round(text.length / 1024)}KB ` +
            `rows=${rows.length} rowcount=${res?.rowcount} ` +
            `cols=${rows[0] ? Object.keys(rows[0]).length : 0} ` +
            `metrics=${Object.keys(res?.metric_components ?? {}).length}`,
        );
      } catch (e) {
        console.log("[capture-error]", String(e).slice(0, 120));
      }
    }
  });
}

async function measure(runIndex) {
  const page = await context.newPage();
  attachCapture(page);
  const t0 = Date.now();
  await page.goto(`${BASE_URL}/dashboard/${DASHBOARD_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => performance.setResourceTimingBufferSize(8192));
  await page.waitForFunction(
    () => {
      const loading = [...document.querySelectorAll("p,span,div")].some(
        (el) => el.childElementCount === 0 && el.textContent === "加载中...",
      );
      const rendered =
        document.querySelector(".MuiTable-root") !== null ||
        document.querySelector("canvas") !== null;
      return rendered && !loading;
    },
    null,
    { timeout: 180_000, polling: 100 },
  );
  const totalMs = Date.now() - t0;

  const marks = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((e) => /wide-data|chart\/data|api\/v1\/(chart|dataset|me)/.test(e.name))
      .map((e) => ({
        name: e.name.replace(/^https?:\/\/[^/]+/, "").slice(0, 70),
        start: Math.round(e.startTime),
        end: Math.round(e.responseEnd),
        transferKB: Math.round(e.transferSize / 1024),
        decodedKB: Math.round(e.decodedBodySize / 1024),
      })),
  );
  console.log(`run ${runIndex}: total=${totalMs}ms`);
  for (const m of marks.sort((a, b) => a.start - b.start))
    console.log(
      `  t=${String(m.start).padStart(5)} end=${String(m.end).padStart(5)} ` +
        `wire=${String(m.transferKB).padStart(6)}KB decoded=${String(m.decodedKB).padStart(7)}KB ${m.name}`,
    );
  await page.close();
}

for (let i = 1; i <= 2; i += 1) {
  await measure(i);
}
await browser.close();
