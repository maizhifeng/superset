import { useEffect } from "react";
import type { FilterConfig, FilterState } from "./types";

const valuesCache = new Map<string, { label: string; value: string }[]>();
const pendingFetches = new Map<string, Promise<void>>();

const refreshSubs = new Set<() => void>();

const LS_PREFIX = "superset_fv_";
const LS_TTL = 5 * 60 * 1000;

function lsKey(datasetId: number, column: string): string {
  return `${LS_PREFIX}${datasetId}:${column}`;
}

function lsLoad(
  datasetId: number,
  column: string,
): { label: string; value: string }[] | null {
  try {
    const raw = localStorage.getItem(lsKey(datasetId, column));
    if (!raw) return null;
    const entry = JSON.parse(raw) as {
      ts: number;
      data: { label: string; value: string }[];
    };
    if (Date.now() - entry.ts > LS_TTL) {
      localStorage.removeItem(lsKey(datasetId, column));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function lsSave(
  datasetId: number,
  column: string,
  data: { label: string; value: string }[],
): void {
  try {
    localStorage.setItem(
      lsKey(datasetId, column),
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {
    /* storage full */
  }
}

export function clearFilterValuesCache(clearStorage = true): void {
  valuesCache.clear();
  if (!clearStorage) return;
  const prefix = LS_PREFIX;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) localStorage.removeItem(key);
  }
}

export function refreshFilterValues(): void {
  clearFilterValuesCache();
  for (const fn of refreshSubs) fn();
}

export function useRefreshNotify(onRefresh: () => void): void {
  useEffect(() => {
    refreshSubs.add(onRefresh);
    return () => {
      refreshSubs.delete(onRefresh);
    };
  }, [onRefresh]);
}

export function buildSiblingFilters(
  filter: FilterConfig,
  allFilters: FilterConfig[],
  filterState: FilterState,
): { col: string; op: string; val: unknown }[] {
  const result: { col: string; op: string; val: unknown }[] = [];
  for (const f of allFilters) {
    if (f.datasetId !== filter.datasetId) continue;
    if (f.column === filter.column) continue;
    if (f.filterType !== "value" && f.filterType !== "filter_select") continue;
    const raw = filterState[f.id]?.value;
    if (raw === undefined || raw === null || raw === "") continue;
    const vals = Array.isArray(raw) ? (raw as unknown[]) : [raw];
    if (vals.length === 0) continue;
    result.push({ col: f.column, op: "in", val: vals });
  }
  return result;
}

export function buildTimeRangeFilters(
  filter: FilterConfig,
  allFilters: FilterConfig[],
  filterState: FilterState,
): { col: string; op: string; val: unknown }[] {
  const result: { col: string; op: string; val: unknown }[] = [];
  for (const f of allFilters) {
    if (f.datasetId !== filter.datasetId) continue;
    if (f.filterType !== "time_range") continue;
    const raw = filterState[f.id]?.value;
    if (!Array.isArray(raw)) continue;
    const [start, end] = raw as [
      string | null | undefined,
      string | null | undefined,
    ];
    if (start) result.push({ col: f.column, op: ">=", val: start });
    if (end) result.push({ col: f.column, op: "<=", val: end });
  }
  return result;
}

export { valuesCache, pendingFetches, lsLoad, lsSave };
