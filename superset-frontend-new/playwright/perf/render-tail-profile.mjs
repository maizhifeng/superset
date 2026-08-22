/**
 * Render-tail CPU profiler for dashboard chart loading.
 *
 * Loads the dashboard once (warm-up) then profiles a measured run with the
 * V8 sampling profiler, attributing self-time hits to functions/files so the
 * post-data "render tail" (client-side pivot aggregation, React commit,
 * ECharts init) can be decomposed precisely.
 *
 * Usage: PLAYWRIGHT_BASE_URL=... node playwright/perf/render-tail-profile.mjs [dashboardId]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { loginDeterministic } from "./login-helper.mjs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://192.168.23.34:9000";
const DASHBOARD_ID = process.argv[2] ?? "14";

async function measure(context, { profile }) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  let wideRows = null;
  let wideParseMs = null;
  page.on("response", async (r) => {
    if (/bi\/pivot\/wide-data/.test(r.url()) && r.status() === 200) {
      const t0 = Date.now();
      try {
        const json = await r.json();
        const res = json?.result?.[0];
        wideRows = Array.isArray(res?.data) ? res.data.length : null;
        // Simulate what the app pays: JSON string -> objects.
        const raw = await r.text();
        const t1 = Date.now();
        JSON.parse(raw);
        wideParseMs = Date.now() - t1;
        void t0;
      } catch {
        /* ignore */
      }
    }
  });

  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
  }

  const t0 = Date.now();
  await page.goto(`${BASE_URL}/dashboard/${DASHBOARD_ID}`, {
    waitUntil: "domcontentloaded",
  });
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
    { timeout: 120_000, polling: 100 },
  );
  const totalMs = Date.now() - t0;

  // Data-phase end from resource timing.
  const marks = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource")
      .filter((e) => /wide-data|chart\/data/.test(e.name))
      .map((e) => ({
        name: e.name.replace(/^https?:\/\/[^/]+/, "").slice(0, 60),
        start: Math.round(e.startTime),
        end: Math.round(e.responseEnd),
        size: e.transferSize,
      }));
    return { navStart: nav ? 0 : 0, res };
  });
  const dataEnd = marks.res.length
    ? Math.max(...marks.res.map((r) => r.end))
    : null;

  let topNodes = [];
  let categories = {};
  if (profile) {
    const { profile: prof } = await cdp.send("Profiler.stop");
    const selfHits = new Map();
    const byUrl = new Map();
    for (const node of prof.nodes) {
      const cf = node.callFrame;
      const key = `${cf.functionName || "(anon)"} @ ${(cf.url || "").replace(
        /^https?:\/\/[^/]+/,
        "",
      )}:${cf.lineNumber}`;
      selfHits.set(key, (selfHits.get(key) ?? 0) + (node.hitCount ?? 0));
      const file = cf.url
        ? cf.url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]
        : "(native)";
      byUrl.set(file, (byUrl.get(file) ?? 0) + (node.hitCount ?? 0));
    }
    const totalHits = [...selfHits.values()].reduce((a, b) => a + b, 0);
    const cat = (file) => {
      if (file.includes("/src/utils/pivot")) return "pivot-agg(src/utils/pivot)";
      if (file.includes("PivotTable")) return "pivot-table-component";
      if (file.includes("echarts") || file.includes("zrender"))
        return "echarts/zrender";
      if (file.includes("react-dom") || file.includes("react_client"))
        return "react-dom";
      if (file.includes("/node_modules/.vite/deps/chunk"))
        return "vite-dep-chunks(mui/dayjs/etc)";
      if (file.includes("/node_modules")) return "other-node_modules";
      if (file.includes("/src/")) return "app-src(other)";
      return "other";
    };
    const catHits = {};
    for (const [file, hits] of byUrl) {
      const k = cat(file);
      catHits[k] = (catHits[k] ?? 0) + hits;
    }
    categories = Object.fromEntries(
      Object.entries(catHits)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, `${((v / totalHits) * 100).toFixed(1)}%`]),
    );
    topNodes = [...selfHits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([k, v]) => ({
        fn: k.slice(0, 120),
        ms: Math.round((v / totalHits) * totalMs),
        pct: ((v / totalHits) * 100).toFixed(1),
      }));
  }

  await page.close();
  return { totalMs, dataEnd, tailMs: dataEnd ? totalMs - dataEnd : null, wideRows, wideParseMs, topNodes, categories, resources: marks.res };
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  await loginDeterministic(context, BASE_URL);
  // Warm-up run (module cache, backend cache).
  await measure(context, { profile: false });

  const results = [];
  for (let i = 0; i < 2; i += 1) {
    const r = await measure(context, { profile: true });
    results.push(r);
    console.log(`\n=== profiled run ${i + 1}: total=${r.totalMs}ms | tail(after last data response)=${r.tailMs}ms | wideRows=${r.wideRows} | JSON.parse=${r.wideParseMs}ms ===`);
    console.log("-- self time by category --");
    for (const [k, v] of Object.entries(r.categories)) console.log(`   ${v.padStart(6)}  ${k}`);
    console.log("-- top functions --");
    for (const n of r.topNodes)
      console.log(`   ${String(n.ms).padStart(5)}ms ${String(n.pct).padStart(5)}%  ${n.fn}`);
  }

  writeFileSync(
    new URL("../../perf-report-tail.json", import.meta.url).pathname,
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
