import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import LRU from "lru-cache";

const config = loadConfig();

interface SimpleAggregate {
  expressionType: "SIMPLE";
  column: { column_name: string };
  aggregate: string;
  label: string;
}

type MetricEntry = string | SimpleAggregate;

const SAVED_METRICS = new Set([
  "cpa", "cpp", "count",
  "roi_1", "roi_2", "roi_3", "roi_4", "roi_5", "roi_6", "roi_7",
  "roi_14", "roi_21", "roi_30", "roi_60", "roi_90", "累计roi",
  "ltv_1", "ltv_2", "ltv_3", "ltv_4", "ltv_5", "ltv_6", "ltv_7",
  "ltv_14", "ltv_21", "ltv_30", "ltv_60", "ltv_90",
  "1日付费率", "2日留存率", "自然付费%", "自然新增%",
]);

// Dynamically populated from schema fetch — used alongside SAVED_METRICS
let validMetricNames: Set<string> | null = null;

export function buildMetricEntry(m: string): MetricEntry {
  const sumMatch = m.match(/^SUM\((.+)\)$/);
  if (sumMatch) {
    return {
      expressionType: "SIMPLE",
      column: { column_name: sumMatch[1] },
      aggregate: "SUM",
      label: m,
    };
  }
  if (SAVED_METRICS.has(m)) {
    return m;
  }
  if (validMetricNames?.has(m)) {
    return m;
  }
  return {
    expressionType: "SIMPLE",
    column: { column_name: m },
    aggregate: "SUM",
    label: `SUM(${m})`,
  };
}

export function buildFilters(filters: unknown): unknown[] {
  if (!filters || typeof filters !== "object" || Object.keys(filters).length === 0) return [];
  return Object.entries(filters as Record<string, unknown>).map(([col, val]) => ({
    expressionType: "SIMPLE",
    subject: col,
    operator: "==",
    comparator: String(val),
  }));
}

export function toMarkdownTable(
  cols: string[],
  rows: Record<string, unknown>[],
  maxRows: number,
  truncatedCount = 0,
): string {
  const header = cols.join(" | ");
  const sep = cols.map(() => "---").join(" | ");
  const display = rows.slice(0, maxRows);
  const body = display.map((r) =>
    cols
      .map((c) => {
        const v = r[c];
        if (c === "日期" && typeof v === "number") {
          const d = new Date(v);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        }
        if (v == null) return "-";
        if (typeof v === "number") {
          if (Number.isInteger(v)) return String(v);
          return v.toFixed(2);
        }
        return String(v);
      })
      .join(" | "),
  );
  const table = [header, sep, ...body].join("\n");
  if (truncatedCount > 0) {
    return `${table}\n\n> 仅展示占比前95%的主要项，另有 ${truncatedCount} 项未显示。如需完整明细请重新查询并设置 show_all=true。`;
  }
  return table;
}

function filterTopRowsByMetric(
  rows: Record<string, unknown>[],
  metricCol: string,
  descending: boolean,
  threshold: number,
): { rows: Record<string, unknown>[]; truncatedCount: number } {
  if (rows.length <= 1) return { rows, truncatedCount: 0 };

  const total = rows.reduce((sum, row) => {
    const val = row[metricCol];
    return sum + (typeof val === "number" ? Math.abs(val) : 0);
  }, 0);

  if (total === 0) return { rows, truncatedCount: 0 };

  const sorted = [...rows].sort((a, b) => {
    const va = typeof a[metricCol] === "number" ? (a[metricCol] as number) : 0;
    const vb = typeof b[metricCol] === "number" ? (b[metricCol] as number) : 0;
    return descending ? vb - va : va - vb;
  });

  let cumulative = 0;
  const cutoffIdx = sorted.findIndex((row) => {
    const val = typeof row[metricCol] === "number" ? (row[metricCol] as number) : 0;
    cumulative += val / total;
    return cumulative >= threshold;
  });

  const keepCount = cutoffIdx >= 0 ? cutoffIdx + 1 : sorted.length;
  const truncatedCount = sorted.length - keepCount;

  return { rows: sorted.slice(0, keepCount), truncatedCount };
}

function normalizeColName(name: string): string {
  const sumMatch = name.match(/^SUM\((.+)\)$/);
  return sumMatch ? sumMatch[1] : name;
}

function parseOrderby(value: unknown): [string, boolean][] {
  if (Array.isArray(value)) {
    return (value as [string, boolean][]).map(
      ([col, asc]) => [normalizeColName(col), asc] as [string, boolean],
    );
  }
  return [];
}

function parseRowLimit(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(Math.max(1, Math.round(value)), 1000);
  }
  return 100;
}

// ── Auth token cache ────────────────────────────────────────────
let schemaToken: string | null = null;
let schemaTokenTime = 0;
const TOKEN_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Schema cache (TTL-based) ────────────────────────────────────
let schemaCache: string | null = null;
let schemaCacheTime = 0;
let validColNames: Set<string> | null = null;
const SCHEMA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isCacheValid(cacheTime: number, ttl: number): boolean {
  return cacheTime > 0 && Date.now() - cacheTime < ttl;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
  baseDelayMs = 500,
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (i < retries && res.status >= 500) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i + Math.random() * 200));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e as Error;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i + Math.random() * 200));
      }
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

function parseAndCacheSchema(json: { result: Record<string, unknown> }): string {
  const r = json.result;
  if (!r) return "";

  const cols = r.columns as Array<{ column_name: string; groupby?: boolean }> | undefined;
  const metrics = r.metrics as Array<{ metric_name: string }> | undefined;

  const lines: string[] = [];
  if (cols) {
    const displayCols = cols
      .filter((c) => c.groupby !== false && !(c.column_name || "").endsWith("[ID]"))
      .map((c) => c.column_name);
    lines.push(`可用维度列: ${displayCols.join(", ")}`);
    lines.push("");
  }
  if (metrics) {
    const displayMetrics = metrics.map((m) => m.metric_name);
    lines.push(`可用指标: ${displayMetrics.join(", ")}`);
    lines.push("");
  }
  validColNames = new Set((cols ?? []).map((c) => c.column_name));
  validMetricNames = new Set((metrics ?? []).map((m) => m.metric_name));
  schemaCache = lines.join("\n");
  schemaCacheTime = Date.now();
  logger.info("schema", `fetched ${cols?.length ?? 0} cols, ${metrics?.length ?? 0} metrics`);
  return schemaCache;
}

async function resolveToken(authToken?: string): Promise<string | null> {
  // Frontend-provided token takes priority
  if (authToken) return authToken;
  // Cached env-derived JWT
  if (schemaToken && isCacheValid(schemaTokenTime, TOKEN_CACHE_TTL)) {
    return schemaToken;
  }
  // Try env-based JWT login
  if (!config.supersetUsername || !config.supersetPassword) return null;
  const { flaskInternalUrl, supersetUsername, supersetPassword } = config;
  try {
    const res = await fetchWithRetry(`${flaskInternalUrl}/api/v1/security/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: supersetUsername,
        password: supersetPassword,
        provider: "db",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { access_token: string };
      schemaToken = data.access_token;
      schemaTokenTime = Date.now();
      return schemaToken;
    }
  } catch {
    // token unavailable
  }
  return null;
}

export async function getSchema(
  userId: string,
  authToken?: string,
  datasetId?: number,
): Promise<string> {
  if (schemaCache && isCacheValid(schemaCacheTime, SCHEMA_CACHE_TTL)) {
    return schemaCache;
  }

  schemaCache = null;
  schemaCacheTime = 0;

  const dsId = datasetId ?? config.datasetId;
  const token = await resolveToken(authToken);
  let schemaError: string | null = null;

  if (token) {
    try {
      const res = await fetchWithRetry(
        `${config.flaskInternalUrl}/api/v1/dataset/${dsId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = (await res.json()) as { result: Record<string, unknown> };
        return parseAndCacheSchema(json);
      }
    } catch (e) {
      schemaError = `Bearer auth failed: ${(e as Error).message}`;
    }
  }
  try {
    const res = await fetchWithRetry(
      `${config.flaskInternalUrl}/api/v1/dataset/${dsId}`,
      { headers: { "X-Internal-Agent": "true" } },
    );
    if (res.ok) {
      const json = (await res.json()) as { result: Record<string, unknown> };
      return parseAndCacheSchema(json);
    }
    schemaError = `Internal agent auth failed: HTTP ${res.status}`;
  } catch (e) {
    schemaError = `Internal agent auth failed: ${(e as Error).message}`;
  }
  logger.warn("schema", `failed to fetch schema: ${schemaError}`);
  return "";
}

// ── Query result cache (LRU, 30s TTL, max 500 entries) ──────────
const queryCache = new LRU<string, string>({
  max: 500,
  ttl: 30_000,
  ttlAutopurge: true,
});

function buildCacheKey(args: Record<string, unknown>): string {
  const columns = ((args.columns as string[]) ?? []).slice().sort();
  const metrics = ((args.metrics as string[]) ?? []).slice().sort();
  return JSON.stringify({
    columns,
    metrics,
    time_range: args.time_range,
    filters: args.filters,
    row_limit: args.row_limit,
  });
}

export async function executeQuerySuperset(
  args: Record<string, unknown>,
  userId: string,
  signal?: AbortSignal,
  authToken?: string,
): Promise<string> {
  const cacheKey = buildCacheKey(args);
  const cached = queryCache.get(cacheKey);
  if (cached) {
    logger.info("query", "cache hit");
    return cached;
  }

  const { flaskInternalUrl, datasetId } = config;
  const rowLimit = parseRowLimit(args.row_limit);
  const timeRange = (args.time_range as string) ?? "Last 14 days";
  const columns = args.columns as string[];
  const metricsArr = args.metrics as string[];
  const hasDateCol = columns.includes("日期");
  const temporalCol = "日期";
  let metrics: MetricEntry[] = metricsArr.map(buildMetricEntry);
  const filters = buildFilters(args.filters);
  const showAll = args.show_all === true;

  const token = await resolveToken(authToken);
  const schema = await getSchema(userId, authToken);
  logger.info("query", `token=${!!token} schema=${!!schema} validColNames=${!!validColNames} metrics=[${metricsArr.join(",")}]`);

  // Filter out invalid metric names against known schema
  const isValidStringMetric = (m: string) =>
    SAVED_METRICS.has(m) || (validMetricNames?.has(m) ?? false);
  const isValidObjMetric = (m: SimpleAggregate) =>
    validColNames ? validColNames.has(m.column.column_name) : false;

  const filteredMetrics = metrics.filter((m) => {
    if (typeof m === "string") return isValidStringMetric(m);
    return isValidObjMetric(m);
  });
  if (filteredMetrics.length !== metrics.length) {
    logger.info("query", `removed ${metrics.length - filteredMetrics.length} invalid metric(s), remaining=${filteredMetrics.length}`);
  }
  if (filteredMetrics.length === 0 && metrics.length > 0) {
    return schema
      ? `${schema}---\n查询失败: 指标名 "${metricsArr.join(", ")}" 在数据集中不存在，请使用 Schema 中的正确指标名`
      : `查询失败: 指标名 "${metricsArr.join(", ")}" 在数据集中不存在`;
  }
  metrics = filteredMetrics;

  const firstMetricLabel = (() => {
    const first = metrics[0];
    if (!first) return "";
    if (typeof first === "object") return first.label;
    return first;
  })();
  const effectiveOrderby: [string, boolean][] = firstMetricLabel
    ? [[firstMetricLabel, false]]
    : [];

  const payload = {
    datasource: { id: datasetId, type: "table" },
    result_format: "json",
    result_type: "full",
    queries: [
      {
        ...(timeRange || hasDateCol ? { granularity: temporalCol } : {}),
        time_range: timeRange,
        metrics,
        columns,
        adhoc_filters: filters,
        orderby: effectiveOrderby,
        row_limit: rowLimit,
      },
    ],
  };

  logger.info("query", `metrics=${JSON.stringify(metrics)} orderby=${JSON.stringify(effectiveOrderby)} schema=${!!schema}`);

  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Internal-Agent": "true",
    "X-User-Id": userId,
  };
  if (token) {
    baseHeaders.Authorization = `Bearer ${token}`;
  }

  let res = await fetch(`${flaskInternalUrl}/api/v1/chart/agent-data`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok && res.status === 400) {
    const errText = await res.text().catch(() => "");
    logger.warn("query", `400 error: ${errText.slice(0, 200)}`);
    payload.queries[0].orderby = undefined as unknown as [string, boolean][];
    res = await fetch(`${flaskInternalUrl}/api/v1/chart/agent-data`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(payload),
      signal,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error("query", `final error: ${text.slice(0, 300)}`);
    const errMsg = schema
      ? `${schema}---\n查询失败: ${text.slice(0, 200)}`
      : `查询失败: ${text.slice(0, 200)}`;
    return errMsg;
  }

  const json = await res.json();
  const result = json?.result?.[0];
  let rows: Record<string, unknown>[] = result?.data ?? [];
  const cols: string[] = result?.colnames ?? [];

  if (cols.length === 0) {
    return schema ? `${schema}（查询未返回数据）` : "（查询未返回数据）";
  }

  let truncatedCount = 0;
  if (!showAll && effectiveOrderby.length > 0 && effectiveOrderby[0][0]) {
    const sortCol = effectiveOrderby[0][0];
    const isDesc = effectiveOrderby[0][1] !== false;
    const metricCol = cols.find((c) => c === sortCol);
    if (metricCol) {
      const filtered = filterTopRowsByMetric(rows, metricCol, isDesc, 0.95);
      rows = filtered.rows;
      truncatedCount = filtered.truncatedCount;
    }
  }

  const table = toMarkdownTable(cols, rows, rowLimit, truncatedCount);
  queryCache.set(cacheKey, table);
  return table;
}
