/**
 * Dashboard chart-loading performance probe.
 *
 * Logs in through the UI once, then loads a real dashboard N times while
 * capturing every network request via the Chrome DevTools Protocol:
 *   - per-request start offset, duration, transfer size, cache state
 *   - backend-reported query time (is_cached / cached_dttm / rowcount)
 *     parsed from chart-data / wide-data response bodies
 *   - render milestones: DOMContentLoaded, last meta fetch, first data
 *     request, last data response, skeletons gone + table painted
 *
 * Usage: node playwright/perf/dashboard-load-perf.mjs [dashboardId] [runs]
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { loginDeterministic } from "./login-helper.mjs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:9000";
const DASHBOARD_ID = process.argv[2] ?? "14";
const RUNS = Number(process.argv[3] ?? 3);
const OUT_FILE = new URL("../../perf-report.json", import.meta.url).pathname;

const DATA_URL_RE = /\/api\/v1\/chart\/data|\/api\/v1\/bi\/chart\/data|\/api\/v1\/bi\/pivot\/wide-data/;
const META_URL_RE = /\/api\/v1\/chart\/\d+(\?|$)/;

function summarize(runs) {
  const pick = (xs) => xs[Math.floor(xs.length / 2)];
  const med = (key) =>
    pick(
      runs.map((r) => r[key]).sort((a, b) => a - b),
    );
  return {
    runs: runs.length,
    medianTotalMs: Math.round(med("totalMs")),
    medianDataPhaseMs: Math.round(med("dataPhaseMs")),
    medianModuleWaterfallMs: Math.round(med("moduleWaterfallMs")),
    medianRequestCount: med("requestCount"),
    medianTransferKB: Math.round(med("transferKB")),
    dataRequestsMedianMs: med("dataRequests")
      .map((d) => ({ url: d.short, ms: d.durationMs, kb: d.kb, cached: d.backendCached }))
      .sort((a, b) => b.ms - a.ms),
  };
}

async function instrumentPage(page, cdp, run) {
  const t0 = Date.now();
  const requests = new Map();
  const timeline = [];
  const req = (ev) => {
    const entry = {
      url: ev.request.url,
      method: ev.request.method,
      type: ev.type,
      startMs: Date.now() - t0,
      wallTime: ev.wallTime,
      requestId: ev.requestId,
      status: null,
      durationMs: null,
      encodedLength: null,
      fromCache: false,
      timing: null,
    };
    requests.set(ev.requestId, entry);
    timeline.push(entry);
  };
  const resp = async (ev) => {
    const entry = requests.get(ev.requestId);
    if (!entry) return;
    entry.status = ev.response.status;
    entry.fromCache = ev.response.fromDiskCache;
    entry.timing = ev.response.timing ?? null;
    if (
      DATA_URL_RE.test(entry.url) &&
      !entry.fromCache &&
      entry.status === 200
    ) {
      try {
        const body = await cdp.send("Network.getResponseBody", {
          requestId: ev.requestId,
        });
        const json = JSON.parse(body.body);
        const result = json?.result?.[0];
        entry.backend = {
          is_cached: result?.is_cached ?? null,
          cached_dttm: result?.cached_dttm ?? null,
          rowcount: result?.rowcount ?? null,
          queried_dttm: result?.queried_dttm ?? null,
        };
        // Backend-reported end-to-end query time when available.
        if (result?.cached_dttm && result?.queried_dttm) {
          const q = new Date(result.queried_dttm).getTime();
          const c = new Date(result.cached_dttm).getTime();
          if (Number.isFinite(q) && Number.isFinite(c))
            entry.backend.queryMs = Math.max(0, c - q);
        }
      } catch {
        /* body may be gone by now; not fatal */
      }
    }
  };
  const done = (ev) => {
    const entry = requests.get(ev.requestId);
    if (!entry) return;
    entry.durationMs = Math.round(Date.now() - t0 - entry.startMs);
    entry.encodedLength = ev.encodedDataLength ?? 0;
  };

  cdp.on("Network.requestWillBeSent", req);
  cdp.on("Network.responseReceived", resp);
  cdp.on("Network.loadingFinished", done);

  return {
    timeline,
    detach: () => {
      cdp.off("Network.requestWillBeSent", req);
      cdp.off("Network.responseReceived", resp);
      cdp.off("Network.loadingFinished", done);
    },
  };
}

async function loadDashboardOnce(context, runIndex) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");

  const { timeline, detach } = await instrumentPage(page, cdp, runIndex);

  const t0 = Date.now();
  await page.goto(`${BASE_URL}/dashboard/${DASHBOARD_ID}`, {
    waitUntil: "domcontentloaded",
  });

  // Wait until every chart card finished loading: no "加载中..." markers left
  // and at least one rendered table/chart surface exists.
  await page.waitForFunction(
    () => {
      const loading = [...document.querySelectorAll("p,span,div")].some(
        (el) => el.childElementCount === 0 && el.textContent === "加载中...",
      );
      const rendered =
        document.querySelector(".MuiTable-root") !== null ||
        document.querySelector("canvas") !== null ||
        document.querySelector("svg.recharts-surface") !== null;
      return rendered && !loading;
    },
    null,
    { timeout: 120_000, polling: 150 },
  );
  const totalMs = Date.now() - t0;

  const dataReqs = timeline.filter((e) => DATA_URL_RE.test(e.url));
  const metaReqs = timeline.filter((e) => META_URL_RE.test(e.url));
  const moduleReqs = timeline.filter(
    (e) => e.type === "Script" || e.url.endsWith(".js") || e.url.includes("/src/"),
  );

  const firstDataStart = dataReqs.length
    ? Math.min(...dataReqs.map((r) => r.startMs))
    : null;
  const lastDataEnd = dataReqs.length
    ? Math.max(...dataReqs.map((r) => r.startMs + (r.durationMs ?? 0)))
    : null;

  const result = {
    run: runIndex,
    totalMs,
    requestCount: timeline.length,
    transferKB: Math.round(
      timeline.reduce((a, e) => a + (e.encodedLength ?? 0), 0) / 1024,
    ),
    metaCount: metaReqs.length,
    metaDoneMs: metaReqs.length
      ? Math.max(...metaReqs.map((r) => r.startMs + (r.durationMs ?? 0)))
      : null,
    firstDataReqMs: firstDataStart,
    dataPhaseMs:
      firstDataStart != null && lastDataEnd != null
        ? Math.round(lastDataEnd - firstDataStart)
        : null,
    moduleWaterfallMs: moduleReqs.length
      ? Math.max(...moduleReqs.map((r) => r.startMs + (r.durationMs ?? 0)))
      : 0,
    dataRequests: dataReqs.map((r) => ({
      short: r.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 90),
      method: r.method,
      status: r.status,
      startMs: r.startMs,
      durationMs: r.durationMs,
      kb: Math.round((r.encodedLength ?? 0) / 1024),
      waitMs: r.timing ? Math.round(r.timing.wait ?? -1) : null,
      receiveMs: r.timing ? Math.round(r.timing.receive ?? -1) : null,
      backendCached: r.backend?.is_cached ?? null,
      backendQueryMs: r.backend?.queryMs ?? null,
      rowcount: r.backend?.rowcount ?? null,
    })),
    timeline: timeline.map((e) => ({
      t: e.startMs,
      d: e.durationMs,
      ms: e.method,
      u: e.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 110),
      ty: e.type,
      st: e.status,
      kb: e.encodedLength ? Math.round(e.encodedLength / 1024) : 0,
    })),
  };

  detach();
  await page.close();
  return result;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Login once (deterministic); storage persists in this context.
  const loginPage = await loginDeterministic(context, BASE_URL);
  await loginPage.close();
  console.log(`logged in; measuring /dashboard/${DASHBOARD_ID} x${RUNS}
`);

  const runs = [];
  for (let i = 1; i <= RUNS; i += 1) {
    const r = await loadDashboardOnce(context, i);
    runs.push(r);
    console.log(
      `run ${i}: total=${r.totalMs}ms | dataPhase=${r.dataPhaseMs}ms | ` +
        `firstData@${r.firstDataReqMs}ms | metaDone@${r.metaDoneMs}ms | ` +
        `reqs=${r.requestCount} | ${r.transferKB}KB`,
    );
    r.dataRequests.forEach((d) =>
      console.log(
        `   [${String(d.startMs).padStart(5)}ms +${String(d.durationMs).padStart(5)}ms] ` +
          `${String(d.kb).padStart(5)}KB cached=${String(d.backendCached)} ` +
          `q=${String(d.backendQueryMs)} rows=${String(d.rowcount)} ${d.short}`,
      ),
    );
  }

  mkdirSync(new URL("../..", import.meta.url).pathname, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify({ dashboardId: DASHBOARD_ID, runs }, null, 2));
  console.log(`\nmedian summary:\n`, JSON.stringify(summarize(runs), null, 2));
  console.log(`full timeline written to ${OUT_FILE}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
