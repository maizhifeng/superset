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

import { createHash } from "node:crypto";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { getTokenFingerprint } from "../ws-auth.js";
import { LRUCache } from "lru-cache";

const config = loadConfig();

export interface SupersetDataContext {
  userId: string;
  token: string;
  datasetId?: number;
}

interface SimpleAggregate {
  expressionType: "SIMPLE";
  column: { column_name: string };
  aggregate: string;
  label: string;
}

type MetricEntry = string | SimpleAggregate;

interface SchemaColumn {
  column_name: string;
  groupby?: boolean;
  type_generic?: number;
}

interface ParsedSchema {
  text: string;
  validColNames: ReadonlySet<string>;
  validMetricNames: ReadonlySet<string>;
}

export type SchemaSnapshot = ParsedSchema;

interface CachedSchema extends ParsedSchema {
  expiresAt: number;
}

interface SchemaCacheScope {
  userId: string;
  datasetId: number;
  token: string;
}

const SCHEMA_CACHE_TTL = 5 * 60 * 1000;
const schemaCache = new LRUCache<string, CachedSchema>({
  max: 200,
  ttl: SCHEMA_CACHE_TTL,
  ttlAutopurge: true,
});

export function buildMetricEntry(
  metric: string,
  validMetricNames?: ReadonlySet<string>,
): MetricEntry {
  const sumMatch = metric.match(/^SUM\((.+)\)$/);
  if (sumMatch) {
    return {
      expressionType: "SIMPLE",
      column: { column_name: sumMatch[1] },
      aggregate: "SUM",
      label: metric,
    };
  }
  if (validMetricNames?.has(metric)) {
    return metric;
  }
  return {
    expressionType: "SIMPLE",
    column: { column_name: metric },
    aggregate: "SUM",
    label: `SUM(${metric})`,
  };
}

export function buildFilters(filters: unknown): unknown[] {
  if (
    !filters ||
    typeof filters !== "object" ||
    Object.keys(filters).length === 0
  )
    return [];
  return Object.entries(filters as Record<string, unknown>).flatMap(
    ([col, val]): {
      expressionType: string;
      subject: string;
      operator: string;
      comparator: string | string[];
    }[] => {
      if (Array.isArray(val)) {
        return [
          {
            expressionType: "SIMPLE",
            subject: col,
            operator: "IN",
            comparator: val.map(String),
          },
        ];
      }
      return [
        {
          expressionType: "SIMPLE",
          subject: col,
          operator: "==",
          comparator: String(val),
        },
      ];
    },
  );
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
    const total = rows.length + truncatedCount;
    const pct = Math.round((truncatedCount / total) * 100);
    return `${table}\n\n> 共 ${total} 行，仅展示按首个指标累计占比前 95% 的主要项（${rows.length} 行），另有 ${truncatedCount} 行（${pct}%）未显示。如需完整明细请设置 show_all=true 重新查询。`;
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
    const va = typeof a[metricCol] === "number" ? a[metricCol] : 0;
    const vb = typeof b[metricCol] === "number" ? b[metricCol] : 0;
    return descending ? vb - va : va - vb;
  });

  let cumulative = 0;
  const cutoffIdx = sorted.findIndex((row) => {
    const val = typeof row[metricCol] === "number" ? row[metricCol] : 0;
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

export function parseOrderby(value: unknown): [string, boolean][] {
  if (Array.isArray(value)) {
    return (value as [string, boolean][]).map(
      ([col, asc]) => [normalizeColName(col), asc] as [string, boolean],
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const match = trimmed.match(/^(.+?)\s*(↓|↑|desc|asc|降序|升序)$/i);
    if (match) {
      const col = normalizeColName(match[1].trim());
      const isDesc = /↓|desc|降序/i.test(match[2]);
      return [[col, !isDesc] as [string, boolean]];
    }
    return [[normalizeColName(trimmed), false] as [string, boolean]];
  }
  return [];
}

export function parseRowLimit(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(Math.max(1, Math.round(value)), 1000);
  }
  return 1000;
}

export async function fetchWithRetry(
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
        await new Promise((r) =>
          setTimeout(r, baseDelayMs * 2 ** i + Math.random() * 200),
        );
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e as Error;
      if (i < retries) {
        await new Promise((r) =>
          setTimeout(r, baseDelayMs * 2 ** i + Math.random() * 200),
        );
      }
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

function emptySchema(): SchemaSnapshot {
  return {
    text: "",
    validColNames: new Set<string>(),
    validMetricNames: new Set<string>(),
  };
}

function parseSchema(json: {
  result: Record<string, unknown>;
}): SchemaSnapshot {
  const r = json.result;
  if (!r) return emptySchema();

  const cols = r.columns as SchemaColumn[] | undefined;
  const metrics = r.metrics as Array<{ metric_name: string }> | undefined;
  const isNumeric = (column: SchemaColumn) => column.type_generic === 0;

  const lines: string[] = [];
  if (cols) {
    const dimCols = cols.filter(
      (column) =>
        !isNumeric(column) &&
        column.groupby !== false &&
        !(column.column_name || "").endsWith("[ID]"),
    );
    const numericCols = cols
      .filter(
        (column) =>
          isNumeric(column) && !(column.column_name || "").endsWith("[ID]"),
      )
      .map((column) => column.column_name);

    lines.push(
      `可用维度列: ${dimCols.map((column) => column.column_name).join(", ")}`,
    );
    lines.push("");
    if (numericCols.length > 0) {
      lines.push(
        `可用数值列（可直接 SUM() 作为指标）: ${numericCols.join(", ")}`,
      );
      lines.push("");
    }
  }
  if (metrics) {
    lines.push(
      `可用指标: ${metrics.map((metric) => metric.metric_name).join(", ")}`,
    );
    lines.push("");
  }

  return {
    text: lines.join("\n"),
    validColNames: new Set((cols ?? []).map((column) => column.column_name)),
    validMetricNames: new Set([
      ...(metrics ?? []).map((metric) => metric.metric_name),
      ...(cols ?? [])
        .filter(
          (column) =>
            isNumeric(column) && !(column.column_name || "").endsWith("[ID]"),
        )
        .map((column) => `SUM(${column.column_name})`),
    ]),
  };
}

function schemaCacheKey(scope: SchemaCacheScope): string {
  return JSON.stringify([
    scope.userId,
    scope.datasetId,
    getTokenFingerprint(scope.token),
  ]);
}

export function parseAndCacheSchema(
  json: { result: Record<string, unknown> },
  scope?: SchemaCacheScope,
): string {
  const parsed = parseSchema(json);
  if (scope) {
    schemaCache.set(schemaCacheKey(scope), {
      ...parsed,
      expiresAt: Date.now() + SCHEMA_CACHE_TTL,
    });
    logger.info(
      "schema",
      `fetched schema for user=${scope.userId} dataset=${scope.datasetId}`,
    );
  }
  return parsed.text;
}

export function requireUserToken(context: SupersetDataContext): string {
  if (!context.userId.trim() || !context.token.trim()) {
    throw new Error("未认证：缺少已验证用户或访问令牌");
  }
  return context.token;
}

export async function getSchema(
  context: SupersetDataContext,
): Promise<SchemaSnapshot> {
  const token = requireUserToken(context);
  const datasetId = context.datasetId ?? config.datasetId;
  const cacheKey = schemaCacheKey({ userId: context.userId, datasetId, token });
  const cached = schemaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  try {
    const res = await fetchWithRetry(
      `${config.flaskInternalUrl}/api/v1/dataset/${datasetId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const json = (await res.json()) as { result: Record<string, unknown> };
      parseAndCacheSchema(json, {
        userId: context.userId,
        datasetId,
        token,
      });
      return schemaCache.get(cacheKey) ?? emptySchema();
    }
    logger.warn("schema", `failed to fetch schema: HTTP ${res.status}`);
  } catch (error) {
    logger.warn(
      "schema",
      `failed to fetch schema: ${(error as Error).message}`,
    );
  }
  return emptySchema();
}

const queryCache = new LRUCache<string, string>({
  max: 500,
  ttl: 30_000,
  ttlAutopurge: true,
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function buildQueryCacheKey(
  context: SupersetDataContext,
  args: Record<string, unknown>,
): string {
  const datasetId = context.datasetId ?? config.datasetId;
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        userId: context.userId,
        datasetId,
        tokenFingerprint: getTokenFingerprint(context.token),
        args: canonicalize(args),
      }),
      "utf8",
    )
    .digest("hex");
}

export async function executeQuerySuperset(
  args: Record<string, unknown>,
  context: SupersetDataContext,
  signal?: AbortSignal,
): Promise<string> {
  const token = requireUserToken(context);
  const datasetId = context.datasetId ?? config.datasetId;
  const cacheKey = buildQueryCacheKey(context, args);
  const cached = queryCache.get(cacheKey);
  if (cached) {
    logger.info("query", "cache hit");
    return cached;
  }

  const { flaskInternalUrl } = config;
  const rowLimit = parseRowLimit(args.row_limit);
  const timeRange = (args.time_range as string) ?? "Last 14 days";
  const columns = args.columns as string[];
  const metricsArr = args.metrics as string[];
  const hasDateCol = columns.includes("日期");
  const temporalCol = "日期";
  const filters = buildFilters(args.filters);
  const showAll = args.show_all === true;

  const schema = await getSchema(context);
  let metrics: MetricEntry[] = metricsArr.map((metric) =>
    buildMetricEntry(metric, schema.validMetricNames),
  );
  logger.info(
    "query",
    `user=${context.userId} dataset=${datasetId} metrics=[${metricsArr.join(",")}]`,
  );

  const isValidStringMetric = (metric: string) =>
    schema.validMetricNames.has(metric);
  const isValidObjMetric = (metric: SimpleAggregate) =>
    schema.validColNames.has(metric.column.column_name);

  const filteredMetrics = metrics.filter((metric) => {
    if (typeof metric === "string") return isValidStringMetric(metric);
    return isValidObjMetric(metric);
  });
  if (filteredMetrics.length !== metrics.length) {
    logger.info(
      "query",
      `removed ${metrics.length - filteredMetrics.length} invalid metric(s), remaining=${filteredMetrics.length}`,
    );
  }
  if (filteredMetrics.length === 0 && metrics.length > 0) {
    return schema.text
      ? `${schema.text}---\n查询失败: 指标名 "${metricsArr.join(", ")}" 不存在或名称不准确。指标名必须逐字使用 Schema 中的确切名称（区分大小写），禁止改写（如「消耗金额」「新增用户」）；数值列用 SUM(列名) 形式。`
      : `查询失败: 指标名 "${metricsArr.join(", ")}" 不存在或名称不准确，请使用 Schema 中的确切指标名`;
  }
  metrics = filteredMetrics;

  const firstMetricLabel = (() => {
    const first = metrics[0];
    if (!first) return "";
    if (typeof first === "object") return first.label;
    return first;
  })();
  const modelOrderby = parseOrderby(args.orderby);
  const effectiveOrderby: [string, boolean][] =
    modelOrderby.length > 0
      ? modelOrderby
      : firstMetricLabel
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

  logger.info(
    "query",
    `metrics=${JSON.stringify(metrics)} orderby=${JSON.stringify(effectiveOrderby)} schema=${!!schema.text}`,
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  let res = await fetch(`${flaskInternalUrl}/api/v1/chart/agent-data`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok && res.status === 400) {
    const errText = await res.text().catch(() => "");
    logger.warn("query", `400 error: ${errText.slice(0, 200)}`);
    payload.queries[0].orderby = undefined as unknown as [string, boolean][];
    res = await fetch(`${flaskInternalUrl}/api/v1/chart/agent-data`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error("query", `final error: ${text.slice(0, 300)}`);
    return schema.text
      ? `${schema.text}---\n查询失败: ${text.slice(0, 200)}`
      : `查询失败: ${text.slice(0, 200)}`;
  }

  const json = (await res.json()) as {
    result?: Array<{
      data?: Record<string, unknown>[];
      colnames?: string[];
      rowcount?: number;
    }>;
  };
  const result = json.result?.[0];
  let rows: Record<string, unknown>[] = result?.data ?? [];
  const cols: string[] = result?.colnames ?? [];

  if (cols.length === 0) {
    return schema.text
      ? `${schema.text}（查询未返回数据）`
      : "（查询未返回数据）";
  }

  let truncatedCount = 0;
  if (!showAll && effectiveOrderby.length > 0 && effectiveOrderby[0][0]) {
    if (!cols.includes("日期")) {
      const sortCol = effectiveOrderby[0][0];
      const isDesc = effectiveOrderby[0][1] !== false;
      const metricCol = cols.find((column) => column === sortCol);
      if (metricCol) {
        const filtered = filterTopRowsByMetric(rows, metricCol, isDesc, 0.95);
        rows = filtered.rows;
        truncatedCount = filtered.truncatedCount;
      }
    }
  }

  const table = toMarkdownTable(cols, rows, rowLimit, truncatedCount);
  const rowcount = result?.rowcount ?? rows.length;
  if (rowcount >= rowLimit) {
    const resultText = `${table}\n\n> 结果已达行数上限（${rowLimit} 行），可能不完整。如需完整数据请设置更大的 row_limit 重新查询。`;
    queryCache.set(cacheKey, resultText);
    return resultText;
  }
  queryCache.set(cacheKey, table);
  return table;
}
