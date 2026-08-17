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
import type { ChartDataRow } from "@/types/api";
import type { WideData, WideMetricComponent } from "@/types/pivot";

export type { WideData, WideMetricComponent } from "@/types/pivot";

export const MAX_PIVOT_ROWS = 5000;
export const MAX_PIVOT_COLS = 80;

/**
 * 95% mode options for pivot tables: keep the aggregated row groups that
 * account for ``threshold`` of the chosen metric's total (defaults to the
 * first metric), dropping the trailing zero/low rows.
 */
export interface PivotPct95 {
  enabled: boolean;
  metric: string;
  threshold: number;
}

export interface PivotTableProps {
  data?: ChartDataRow[];
  groupbyRows?: string[];
  groupbyColumns?: string[];
  metrics?: string[];
  aggregateFunction?: string;
  transposePivot?: boolean;
  combineMetric?: boolean;
  rowTotals?: boolean;
  colTotals?: boolean;
  metricsLayout?: "ROWS" | "COLUMNS";
  formatCell?: (key: string, value: unknown) => string;
  /**
   * Names of temporal columns in the source rows.  Their values are
   * formatted (e.g. Unix timestamps / YYYYMMDD / ISO 8601 → "YYYY-MM-DD")
   * in row/column dimension labels, so date dimensions do not show raw
   * values in the pivot headers.
   */
  dateColumns?: string[];
  /**
   * Day-granularity wide rows (dimension columns + per-day metric columns,
   * ratio metrics as ``label__num`` / ``label__den`` component columns)
   * fetched from ``/bi/pivot/wide-data``.  When present the grid is
   * re-aggregated client-side, so row/column layout changes are instant and
   * need no backend round-trip.
   */
  wideData?: WideData;
  /**
   * Rows of an aggregate query grouped by the column dimensions only.
   * Used for the totals row so dataset-defined metrics (e.g. ratios) are
   * recomputed per their definition instead of summing displayed cells.
   */
  totalRows?: ChartDataRow[];
  /**
   * Rows of aggregate queries grouped by the first row dimension plus the
   * column dimensions, one entry per collapsed-group level (index L = grouped
   * by ``rowDims[0..L] + colDims``). Used for collapsed group subtotals so
   * dataset-defined metrics are recomputed per their definition.
   */
  subtotalRows?: ChartDataRow[][];
  /**
   * 95% mode: after client-side re-aggregation, keep only the row groups
   * whose cumulative metric value covers ``threshold`` of the total.  Applied
   * on the aggregated row combos so day-granularity wide rows stay intact.
   */
  pct95?: PivotPct95;
}

export interface PivotGrid {
  colHeaders: string[][];
  rowHeaders: string[][];
  values: (number | null)[][];
  rowLabels: string[];
  colLabels: string[];
  rowDimLabels: string[];
  /** Column-dimension names (post-transpose), for the top-left corner label. */
  colDimNames: string[];
  /** Per-column column-dimension value tuple (post-transpose), for totals lookup. */
  colCombos: string[][];
  /** Column indices where each column-dimension group starts (0-based). */
  colGroupStarts: number[];
  truncated: boolean;
  /**
   * Pre-fraction aggregate grid and its row/column sums.  The rendered grid
   * applies "Fraction of X" transforms on top of these; totals/subtotals
   * re-derive their fractions from the same sums so they stay consistent
   * with the displayed cells.
   */
  rawValues: (number | null)[][];
  rawRowTotals: number[];
  rawColTotals: number[];
  rawGrandTotal: number;
  /** Totals/subtotals computed from the wide table (client-side aggregation). */
  totalRows?: ChartDataRow[];
  subtotalRows?: ChartDataRow[][];
}

const AGG_FNS: Record<string, (values: number[]) => number> = {
  Sum: (v) => v.reduce((acc, x) => acc + x, 0),
  Average: (v) => (v.length ? v.reduce((acc, x) => acc + x, 0) / v.length : 0),
  Median: (v) => {
    if (v.length === 0) return 0;
    const sorted = [...v].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  },
  Min: (v) => (v.length ? Math.min(...v) : 0),
  Max: (v) => (v.length ? Math.max(...v) : 0),
  Count: (v) => v.length,
  "Sample Variance": (v) => {
    if (v.length < 2) return 0;
    const mean = v.reduce((acc, x) => acc + x, 0) / v.length;
    return v.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (v.length - 1);
  },
  "Sample Standard Deviation": (v) => {
    if (v.length < 2) return 0;
    const mean = v.reduce((acc, x) => acc + x, 0) / v.length;
    return Math.sqrt(
      v.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (v.length - 1),
    );
  },
};

const FRACTION_SUFFIX = / as Fraction of (Total|Rows|Columns)$/;

export function aggregateValues(values: number[], fn: string): number {
  const base = fn.replace(FRACTION_SUFFIX, "");
  const agg = AGG_FNS[base] ?? AGG_FNS.Sum;
  return agg(values);
}

/** Strip the aggregation prefix for display, matching the table viz (e.g. "SUM(user_count)" → "user_count"). */
export function displayMetricName(name: string): string {
  const m = name.match(/^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/);
  return m ? m[2] : name;
}

/** Fraction-of mode ("Total" | "Rows" | "Columns") of an aggregate function, if any. */
export function fractionMode(aggregateFunction: string): string | null {
  return FRACTION_SUFFIX.exec(aggregateFunction)?.[1] ?? null;
}

interface ComboEntry {
  combo: string[];
  metric: string;
}

interface WideAcc {
  num: number;
  den: number;
  values: number[];
}

type WideAccMap = Map<string, Map<string, Map<string, WideAcc>>>;

function distinctTuples(rows: ChartDataRow[], dims: string[]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const row of rows) {
    const tuple = dims.map((d) => String(row[d] ?? ""));
    const key = tuple.join("\u0000");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tuple);
    }
  }
  return result;
}

// Numeric sort key for a date-dimension value: YYYYMMDD integers, Unix
// timestamps (seconds/milliseconds, numeric or string) and ISO 8601 strings
// all order chronologically. Non-date values return null.
function dateSortValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{8}$/.test(s)) return Number(s);
    const t = Date.parse(s);
    if (Number.isFinite(t)) return t;
    if (/^\d+$/.test(s)) return Number(s);
    return null;
  }
  return null;
}

/**
 * Order the row/column combos: date dimensions (listed in ``dateColumns``)
 * sort ascending chronologically, all other dimensions keep their
 * appearance order.  The hierarchy (dim 0 first, then dim 1, ...) is
 * preserved so consecutive rows share the same ancestor values.
 */
function sortTuples(
  tuples: string[][],
  dims: string[],
  dateColumns: string[] = [],
): string[][] {
  const appearance = dims.map((_d, di) => {
    const idx = new Map<string, number>();
    for (const t of tuples) {
      if (!idx.has(t[di])) idx.set(t[di], idx.size);
    }
    return idx;
  });
  const dateKeys = dims.map((d, di) => {
    if (!dateColumns.includes(d)) return null;
    const keyMap = new Map<string, number | null>();
    for (const t of tuples) keyMap.set(t[di], dateSortValue(t[di]));
    return keyMap;
  });
  return [...tuples].sort((a, b) => {
    for (let i = 0; i < dims.length; i += 1) {
      const dk = dateKeys[i];
      if (dk) {
        const av = dk.get(a[i]) ?? null;
        const bv = dk.get(b[i]) ?? null;
        if (av !== null && bv !== null) {
          if (av !== bv) return av - bv;
        } else if (av !== null) return -1;
        else if (bv !== null) return 1;
      }
      const ai = appearance[i].get(a[i]) ?? 0;
      const bi = appearance[i].get(b[i]) ?? 0;
      if (ai !== bi) return ai - bi;
    }
    return 0;
  });
}

/**
 * Re-aggregate rows into per-(row-combo, col-combo, metric) buckets.
 *
 * Works for both the legacy pre-aggregated rows (one row per combo, no
 * ``components``) and the day-granularity wide table (``components`` defines
 * which metrics are ratio columns split into ``label__num`` / ``label__den``).
 */
function aggregateRows(
  rows: ChartDataRow[],
  rowDims: string[],
  colDims: string[],
  metrics: string[],
  components: Record<string, WideMetricComponent>,
): WideAccMap {
  const acc: WideAccMap = new Map();
  for (const row of rows) {
    const rowKey = rowDims.map((d) => String(row[d] ?? "")).join("\u0000");
    const colKey = colDims.map((d) => String(row[d] ?? "")).join("\u0000");
    let byCol = acc.get(rowKey);
    if (!byCol) {
      byCol = new Map();
      acc.set(rowKey, byCol);
    }
    let byMetric = byCol.get(colKey);
    if (!byMetric) {
      byMetric = new Map();
      byCol.set(colKey, byMetric);
    }
    for (const m of metrics) {
      const meta = components[m];
      let a = byMetric.get(m);
      if (!a) {
        a = { num: 0, den: 0, values: [] };
        byMetric.set(m, a);
      }
      if (meta?.agg === "ratio") {
        const n = Number(row[meta.num ?? ""]);
        const d = Number(row[meta.den ?? ""]);
        if (Number.isFinite(n)) a.num += n;
        if (Number.isFinite(d)) a.den += d;
      } else {
        const v = Number(row[m]);
        if (Number.isFinite(v)) a.values.push(v);
      }
    }
  }
  return acc;
}

function cellValue(
  meta: WideMetricComponent | undefined,
  acc: WideAcc | undefined,
  aggFn: string,
): number | null {
  if (!acc) return null;
  if (meta?.agg === "ratio") return acc.den !== 0 ? acc.num / acc.den : null;
  if (acc.values.length === 0) return null;
  return aggregateValues(acc.values, aggFn);
}

/**
 * Total value of a row combo for the 95% metric across all column combos.
 * Ratio metrics re-aggregate as ``SUM(num) / SUM(den)`` over the column
 * combos; plain metrics sum the raw values, so the retained rows cover the
 * chosen share of the underlying metric volume.
 */
function rowComboValue(
  acc: WideAccMap,
  combo: string[],
  metric: string,
  meta: WideMetricComponent | undefined,
): number {
  const byCol = acc.get(combo.join("\u0000"));
  if (!byCol) return 0;
  let total = 0;
  let num = 0;
  let den = 0;
  let found = false;
  for (const byMetric of byCol.values()) {
    const a = byMetric.get(metric);
    if (!a) continue;
    found = true;
    if (meta?.agg === "ratio") {
      num += a.num;
      den += a.den;
    } else {
      for (const v of a.values) total += v;
    }
  }
  if (!found) return 0;
  if (meta?.agg === "ratio") return den !== 0 ? num / den : 0;
  return total;
}

/**
 * Keys (``\u0000``-joined tuples) of the row combos to keep: the combos
 * sorted by the metric descending until the cumulative value reaches
 * ``threshold`` of the total.  Zero-valued trailing combos are excluded;
 * when every combo is zero (or the metric is missing) everything is kept.
 */
function pct95KeptKeys(
  combos: string[][],
  value: (combo: string[]) => number,
  threshold: number,
): Set<string> {
  const all = new Set(combos.map((c) => c.join("\u0000")));
  if (combos.length <= 1 || threshold <= 0 || threshold >= 1) return all;
  const scored = combos.map((c) => ({ key: c.join("\u0000"), v: value(c) }));
  const total = scored.reduce((s, e) => s + e.v, 0);
  if (total <= 0) return all;
  scored.sort((a, b) => b.v - a.v);
  const limit = total * threshold;
  let cum = 0;
  const kept = new Set<string>();
  for (const e of scored) {
    cum += e.v;
    kept.add(e.key);
    if (cum >= limit) break;
  }
  return kept;
}

function buildGridOutput(
  colDims: string[],
  colCombos: string[][],
  colHeaders: string[][],
  rowDims: string[],
  rowHeaders: string[][],
  rowLabels: string[],
  colLabels: string[],
  grid: (number | null)[][],
  colCombosRaw: string[][],
  metricOnRows: boolean,
  metrics: string[],
  aggregateFunction: string,
  truncated: boolean,
): Omit<PivotGrid, "totalRows" | "subtotalRows"> {
  const rawRowTotals = grid.map((row) =>
    row.reduce<number>((acc, v) => acc + (v ?? 0), 0),
  );
  const rawColTotals = colCombosRaw.map((_, cIdx) =>
    grid.reduce<number>((acc, row) => acc + (row[cIdx] ?? 0), 0),
  );
  const rawGrandTotal = rawRowTotals.reduce<number>((acc, v) => acc + v, 0);

  const fractionOf = fractionMode(aggregateFunction);
  let finalGrid = grid;
  if (fractionOf) {
    finalGrid = grid.map((row, rIdx) =>
      row.map((v, cIdx) => {
        if (v === null) return null;
        const denominator =
          fractionOf === "Total"
            ? rawGrandTotal
            : fractionOf === "Rows"
              ? rawRowTotals[rIdx]
              : rawColTotals[cIdx];
        return denominator === 0 ? null : v / denominator;
      }),
    );
  }

  const metricCountPerCombo = metricOnRows ? 1 : Math.max(metrics.length, 1);
  const colGroupStarts: number[] = [];
  for (let i = 0; i < colCombosRaw.length; i += metricCountPerCombo) {
    colGroupStarts.push(i);
  }

  return {
    colHeaders,
    rowHeaders,
    values: finalGrid,
    rowLabels,
    colLabels,
    rowDimLabels: [
      ...rowDims,
      ...(metricOnRows && metrics.length > 0 ? ["指标"] : []),
    ],
    colDimNames: colDims,
    colCombos: colCombosRaw,
    colGroupStarts,
    truncated,
    rawValues: grid,
    rawRowTotals,
    rawColTotals,
    rawGrandTotal,
  };
}

interface BuildGridArgs {
  rows: ChartDataRow[];
  rowDims: string[];
  colDims: string[];
  metrics: string[];
  components: Record<string, WideMetricComponent>;
  aggregateFunction: string;
  metricsLayout: "ROWS" | "COLUMNS";
  pct95?: PivotPct95;
  /** Date dimension columns: their combos sort ascending chronologically. */
  dateColumns: string[];
  /** Compute totals/subtotals from the wide rows (vs. backend-provided). */
  computeTotals: boolean;
}

function buildPivotGridCore(args: BuildGridArgs): PivotGrid {
  const {
    rows,
    rowDims,
    colDims,
    metrics,
    components,
    aggregateFunction,
    metricsLayout = "COLUMNS",
    pct95,
    dateColumns,
    computeTotals,
  } = args;

  const metricOnRows = metricsLayout === "ROWS";
  const aggFn = aggregateFunction.replace(FRACTION_SUFFIX, "");
  const acc = aggregateRows(rows, rowDims, colDims, metrics, components);

  let rowCombos = sortTuples(distinctTuples(rows, rowDims), rowDims, dateColumns);
  if (pct95?.enabled && pct95.metric) {
    const metricValue = (combo: string[]) =>
      rowComboValue(
        acc,
        combo,
        pct95.metric,
        components[pct95.metric],
      );
    const kept = pct95KeptKeys(rowCombos, metricValue, pct95.threshold);
    rowCombos = rowCombos.filter((c) => kept.has(c.join("\u0000")));
    const hasDateRowDim = dateColumns.some((d) => rowDims.includes(d));
    if (hasDateRowDim) {
      // Date dimensions take priority over the metric sort: the 95% filter
      // still keeps the top row groups, but retained detail rows stay in
      // chronological ascending order instead of being re-sorted by metric.
      rowCombos = sortTuples(rowCombos, rowDims, dateColumns);
    } else {
      // The 95% split metric is also the display sort: descending, so the
      // retained rows are ordered from largest to smallest contribution.
      rowCombos.sort(
        (a, b) =>
          metricValue(b) - metricValue(a) ||
          a.join("\u0000").localeCompare(b.join("\u0000")),
      );
    }
  }
  const colCombos = sortTuples(distinctTuples(rows, colDims), colDims, dateColumns);

  const effectiveColCombos: ComboEntry[] = metricOnRows
    ? colCombos.map((combo) => ({ combo, metric: "" }))
    : colCombos.flatMap((combo) =>
        metrics.map((metric) => ({ combo, metric })),
      );
  const effectiveRowCombos: ComboEntry[] = metricOnRows
    ? rowCombos.flatMap((combo) => metrics.map((metric) => ({ combo, metric })))
    : rowCombos.map((combo) => ({ combo, metric: "" }));

  const truncated =
    effectiveColCombos.length > MAX_PIVOT_COLS ||
    effectiveRowCombos.length > MAX_PIVOT_ROWS;
  const colCombosCapped = effectiveColCombos.slice(0, MAX_PIVOT_COLS);
  let rowCombosCapped = effectiveRowCombos.slice(0, MAX_PIVOT_ROWS);
  // When truncation drops rows (no pct95 filter to pre-select them), keep the
  // highest-contribution combos by the first metric instead of an arbitrary
  // appearance slice, so the least important detail rows are the ones cut.
  // Display order is preserved by filtering, not by sorting.
  if (
    truncated &&
    !pct95?.enabled &&
    effectiveRowCombos.length > MAX_PIVOT_ROWS &&
    metrics.length > 0
  ) {
    const metric = metrics[0];
    const value = (rc: ComboEntry) =>
      rowComboValue(acc, rc.combo, metric, components[metric]);
    const top = [...effectiveRowCombos]
      .sort((a, b) => value(b) - value(a))
      .slice(0, MAX_PIVOT_ROWS);
    const keptKeys = new Set(
      top.map((rc) => `${rc.combo.join("\u0000")}\u0000${rc.metric}`),
    );
    rowCombosCapped = effectiveRowCombos.filter((rc) =>
      keptKeys.has(`${rc.combo.join("\u0000")}\u0000${rc.metric}`),
    );
  }

  const grid: (number | null)[][] = rowCombosCapped.map((rc) =>
    colCombosCapped.map((cc) => {
      const metric = cc.metric || rc.metric;
      if (!metric) return null;
      const a = acc
        .get(rc.combo.join("\u0000"))
        ?.get(cc.combo.join("\u0000"))
        ?.get(metric);
      return cellValue(components[metric], a, aggFn);
    }),
  );

  const colHeaders: string[][] = [];
  for (let level = 0; level < colDims.length; level += 1) {
    colHeaders.push(colCombosCapped.map((c) => c.combo[level] ?? ""));
  }
  if (!metricOnRows && metrics.length > 0) {
    colHeaders.push(
      colCombosCapped.map((c) => displayMetricName(c.metric || "")),
    );
  }
  if (colHeaders.length === 0) colHeaders.push([""]);

  const rowHeaders: string[][] = [];
  for (let level = 0; level < rowDims.length; level += 1) {
    rowHeaders.push(rowCombosCapped.map((r) => r.combo[level] ?? ""));
  }
  if (metricOnRows && metrics.length > 0) {
    rowHeaders.push(
      rowCombosCapped.map((r) => displayMetricName(r.metric || "")),
    );
  }
  if (rowHeaders.length === 0) rowHeaders.push([""]);

  const rowLabels: string[] = rowCombosCapped.map((r) => {
    const base =
      rowDims.length > 0
        ? r.combo.join(" · ")
        : metricOnRows && r.metric
          ? ""
          : "合计";
    const metricLabel = r.metric ? displayMetricName(r.metric) : "";
    return base
      ? `${base}${metricLabel ? ` · ${metricLabel}` : ""}`
      : metricLabel || "合计";
  });
  const colLabels: string[] = colCombosCapped.map(
    (c) => c.metric || (colDims.length > 0 ? c.combo.join(" · ") : "合计"),
  );

  const base = buildGridOutput(
    colDims,
    colCombos,
    colHeaders,
    rowDims,
    rowHeaders,
    rowLabels,
    colLabels,
    grid,
    colCombosCapped.map((c) => c.combo),
    metricOnRows,
    metrics,
    aggregateFunction,
    truncated,
  );

  if (!computeTotals) return base;

  // Totals row: grouped by the column dimensions only.
  const totalAcc = aggregateRows(rows, [], colDims, metrics, components);
  const totalRows: ChartDataRow[] = colCombos.map((combo) => {
    const row: ChartDataRow = {};
    colDims.forEach((d, i) => {
      row[d] = combo[i];
    });
    const byMetric = totalAcc.get("")?.get(combo.join("\u0000"));
    for (const m of metrics) {
      const v = cellValue(components[m], byMetric?.get(m), aggFn);
      if (v !== null) row[m] = v;
    }
    return row;
  });

  // Subtotal rows: one level per collapsed group (rowDims[0..L] + colDims).
  const subtotalRows: ChartDataRow[][] = [];
  for (let level = 0; level < rowDims.length - 1; level += 1) {
    const dims = rowDims.slice(0, level + 1);
    const levelAcc = aggregateRows(rows, dims, colDims, metrics, components);
    const combos = sortTuples(distinctTuples(rows, dims), dims, dateColumns);
    const colTuples = sortTuples(
      distinctTuples(rows, colDims),
      colDims,
      dateColumns,
    );
    const rowsOut: ChartDataRow[] = [];
    for (const combo of combos) {
      for (const colCombo of colTuples) {
        const out: ChartDataRow = {};
        dims.forEach((d, i) => {
          out[d] = combo[i];
        });
        colDims.forEach((d, i) => {
          out[d] = colCombo[i];
        });
        const byMetric = levelAcc
          .get(combo.join("\u0000"))
          ?.get(colCombo.join("\u0000"));
        for (const m of metrics) {
          const v = cellValue(components[m], byMetric?.get(m), aggFn);
          if (v !== null) out[m] = v;
        }
        rowsOut.push(out);
      }
    }
    subtotalRows.push(rowsOut);
  }

  return { ...base, totalRows, subtotalRows };
}

export function buildPivotGrid(props: PivotTableProps): PivotGrid {
  let rowDims = [...(props.groupbyRows ?? [])];
  let colDims = [...(props.groupbyColumns ?? [])];
  if (props.transposePivot) {
    rowDims = [...(props.groupbyColumns ?? [])];
    colDims = [...(props.groupbyRows ?? [])];
  }

  return buildPivotGridCore({
    rows: props.wideData?.rows ?? props.data ?? [],
    rowDims,
    colDims,
    metrics: props.metrics ?? [],
    components: props.wideData?.components ?? {},
    aggregateFunction: props.aggregateFunction ?? "Sum",
    metricsLayout: props.metricsLayout ?? "COLUMNS",
    pct95: props.pct95,
    dateColumns: props.dateColumns ?? [],
    computeTotals: Boolean(props.wideData),
  });
}
