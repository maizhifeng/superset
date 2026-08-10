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

export const MAX_PIVOT_ROWS = 5000;
export const MAX_PIVOT_COLS = 80;

export interface WideMetricComponent {
  agg: "sum" | "min" | "max" | "count" | "ratio";
  num?: string;
  den?: string;
}

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

export interface WideData {
  rows: ChartDataRow[];
  components: Record<string, WideMetricComponent>;
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

export function aggregateValues(values: number[], fn: string): number {
  const base = fn.replace(/ as Fraction of (Total|Rows|Columns)$/, "");
  const agg = AGG_FNS[base] ?? AGG_FNS.Sum;
  return agg(values);
}

/** Strip the aggregation prefix for display, matching the table viz (e.g. "SUM(user_count)" → "user_count"). */
export function displayMetricName(name: string): string {
  const m = name.match(/^(SUM|AVG|COUNT|MIN|MAX)\((.+)\)$/);
  return m ? m[2] : name;
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

// Keep the hierarchical appearance order (dim 0 first, then dim 1, ...) so
// consecutive rows share the same ancestor values and grouping stays intact.
function sortTuples(tuples: string[][], dims: string[]): string[][] {
  const appearance = dims.map((_d, di) => {
    const idx = new Map<string, number>();
    for (const t of tuples) {
      if (!idx.has(t[di])) idx.set(t[di], idx.size);
    }
    return idx;
  });
  return [...tuples].sort((a, b) => {
    for (let i = 0; i < dims.length; i += 1) {
      const ai = appearance[i].get(a[i]) ?? 0;
      const bi = appearance[i].get(b[i]) ?? 0;
      if (ai !== bi) return ai - bi;
    }
    return 0;
  });
}

function wideAggregate(
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
      if (!meta) continue;
      let a = byMetric.get(m);
      if (!a) {
        a = { num: 0, den: 0, values: [] };
        byMetric.set(m, a);
      }
      if (meta.agg === "ratio") {
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

function wideCellValue(
  meta: WideMetricComponent | undefined,
  acc: WideAcc | undefined,
  aggFn: string,
): number | null {
  if (!meta || !acc) return null;
  if (meta.agg === "ratio") return acc.den !== 0 ? acc.num / acc.den : null;
  if (acc.values.length === 0) return null;
  return aggregateValues(acc.values, aggFn);
}

/**
 * Total value of a row combo for the 95% metric across all column combos.
 * Ratio metrics re-aggregate as ``SUM(num) / SUM(den)`` over the column
 * combos instead of summing per-cell ratios.
 */
function wideRowComboValue(
  acc: WideAccMap,
  combo: string[],
  metric: string,
  meta: WideMetricComponent | undefined,
  aggFn: string,
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
      const v = wideCellValue(meta, a, aggFn);
      if (v !== null) total += v;
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
  rowCombos: string[][],
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
  const rowTotalsArr = grid.map((row) =>
    row.reduce<number>((acc, v) => acc + (v ?? 0), 0),
  );
  const colTotalsArr = colCombosRaw.map((_, cIdx) =>
    grid.reduce<number>((acc, row) => acc + (row[cIdx] ?? 0), 0),
  );
  const grandTotal = rowTotalsArr.reduce<number>((acc, v) => acc + v, 0);

  const fractionOf = / as Fraction of (Total|Rows|Columns)$/.exec(
    aggregateFunction,
  )?.[1];
  let finalGrid = grid;
  if (fractionOf) {
    finalGrid = grid.map((row, rIdx) =>
      row.map((v, cIdx) => {
        if (v === null) return null;
        const denominator =
          fractionOf === "Total"
            ? grandTotal
            : fractionOf === "Rows"
              ? rowTotalsArr[rIdx]
              : colTotalsArr[cIdx];
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
  };
}

function buildWidePivotGrid(props: PivotTableProps): PivotGrid {
  const {
    wideData,
    groupbyRows = [],
    groupbyColumns = [],
    metrics = [],
    transposePivot = false,
    metricsLayout = "COLUMNS",
    aggregateFunction = "Sum",
    pct95,
  } = props;
  const rows = wideData?.rows ?? [];
  const components = wideData?.components ?? {};

  let rowDims = [...groupbyRows];
  let colDims = [...groupbyColumns];
  if (transposePivot) {
    rowDims = [...groupbyColumns];
    colDims = [...groupbyRows];
  }
  const metricOnRows = metricsLayout === "ROWS";

  const aggFn = aggregateFunction.replace(
    / as Fraction of (Total|Rows|Columns)$/,
    "",
  );
  const acc = wideAggregate(rows, rowDims, colDims, metrics, components);

  let rowCombos = sortTuples(distinctTuples(rows, rowDims), rowDims);
  if (pct95?.enabled && pct95.metric) {
    const kept = pct95KeptKeys(
      rowCombos,
      (combo) =>
        wideRowComboValue(
          acc,
          combo,
          pct95.metric,
          components[pct95.metric],
          aggFn,
        ),
      pct95.threshold,
    );
    rowCombos = rowCombos.filter((c) => kept.has(c.join("\u0000")));
  }
  const colCombos = sortTuples(distinctTuples(rows, colDims), colDims);

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
  const rowCombosCapped = effectiveRowCombos.slice(0, MAX_PIVOT_ROWS);

  const grid: (number | null)[][] = rowCombosCapped.map((rc) =>
    colCombosCapped.map((cc) => {
      const metric = cc.metric || rc.metric;
      if (!metric) return null;
      const a = acc
        .get(rc.combo.join("\u0000"))
        ?.get(cc.combo.join("\u0000"))
        ?.get(metric);
      return wideCellValue(components[metric], a, aggFn);
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

  // Totals row: grouped by the column dimensions only.
  const totalAcc = wideAggregate(rows, [], colDims, metrics, components);
  const totalRows: ChartDataRow[] = colCombos.map((combo) => {
    const row: ChartDataRow = {};
    colDims.forEach((d, i) => {
      row[d] = combo[i];
    });
    const byMetric = totalAcc.get("")?.get(combo.join("\u0000"));
    for (const m of metrics) {
      const v = wideCellValue(components[m], byMetric?.get(m), aggFn);
      if (v !== null) row[m] = v;
    }
    return row;
  });

  // Subtotal rows: one level per collapsed group (rowDims[0..L] + colDims).
  const subtotalRows: ChartDataRow[][] = [];
  for (let level = 0; level < rowDims.length - 1; level += 1) {
    const dims = rowDims.slice(0, level + 1);
    const levelAcc = wideAggregate(rows, dims, colDims, metrics, components);
    const combos = sortTuples(distinctTuples(rows, dims), dims);
    const colTuples = sortTuples(distinctTuples(rows, colDims), colDims);
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
          const v = wideCellValue(components[m], byMetric?.get(m), aggFn);
          if (v !== null) out[m] = v;
        }
        rowsOut.push(out);
      }
    }
    subtotalRows.push(rowsOut);
  }

  const base = buildGridOutput(
    colDims,
    colCombos,
    colHeaders,
    rowDims,
    rowCombos,
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
  return { ...base, totalRows, subtotalRows };
}

export function buildPivotGrid(props: PivotTableProps): PivotGrid {
  if (props.wideData) return buildWidePivotGrid(props);

  const {
    data = [],
    groupbyRows = [],
    groupbyColumns = [],
    metrics = [],
    transposePivot = false,
    metricsLayout = "COLUMNS",
    pct95,
  } = props;

  let rowDims = [...groupbyRows];
  let colDims = [...groupbyColumns];
  if (transposePivot) {
    rowDims = [...groupbyColumns];
    colDims = [...groupbyRows];
  }

  const metricOnRows = metricsLayout === "ROWS";

  const numericRows = data.map((row) => {
    const numeric: Record<string, number> = {};
    for (const m of metrics) {
      const v = Number(row[m]);
      numeric[m] = Number.isFinite(v) ? v : NaN;
    }
    return { row, numeric };
  });

  const distinctValuesLegacy = (dim: string): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of numericRows) {
      const key = String(entry.row[dim] ?? "");
      if (!seen.has(key)) {
        seen.add(key);
        result.push(key);
      }
    }
    return result;
  };

  // Only include dimension combinations that actually exist in the data.
  // A full Cartesian product would fabricate rows/columns for combinations
  // that never occur (e.g. a game that only runs on specific platforms).
  const distinctTuplesLegacy = (dims: string[]): string[][] => {
    const seen = new Set<string>();
    const result: string[][] = [];
    for (const entry of numericRows) {
      const tuple = dims.map((d) => String(entry.row[d] ?? ""));
      const key = tuple.join("\u0000");
      if (!seen.has(key)) {
        seen.add(key);
        result.push(tuple);
      }
    }
    return result;
  };

  // Keep the hierarchical appearance order (dim 0 first, then dim 1, ...) so
  // consecutive rows share the same ancestor values and grouping stays intact.
  const sortTuplesLegacy = (tuples: string[][], dims: string[]): string[][] => {
    const appearance = dims.map((d) => {
      const idx = new Map<string, number>();
      distinctValuesLegacy(d).forEach((v, i) => idx.set(v, i));
      return idx;
    });
    return [...tuples].sort((a, b) => {
      for (let i = 0; i < dims.length; i += 1) {
        const ai = appearance[i].get(a[i]) ?? 0;
        const bi = appearance[i].get(b[i]) ?? 0;
        if (ai !== bi) return ai - bi;
      }
      return 0;
    });
  };

  let rowCombos = sortTuplesLegacy(distinctTuplesLegacy(rowDims), rowDims);
  const colCombos = sortTuplesLegacy(distinctTuplesLegacy(colDims), colDims);

  // Index numeric rows by (row-combo, col-combo) once instead of filtering
  // the full dataset for every grid cell; cell lookups are then O(1).
  const numericByCombo = new Map<
    string,
    { row: ChartDataRow; numeric: Record<string, number> }[]
  >();
  for (const entry of numericRows) {
    const rowKey = rowDims
      .map((d) => String(entry.row[d] ?? ""))
      .join("\u0000");
    const colKey = colDims
      .map((d) => String(entry.row[d] ?? ""))
      .join("\u0000");
    const key = `${rowKey}\u0000${colKey}`;
    const bucket = numericByCombo.get(key);
    if (bucket) bucket.push(entry);
    else numericByCombo.set(key, [entry]);
  }

  if (pct95?.enabled && pct95.metric) {
    const kept = pct95KeptKeys(
      rowCombos,
      (combo) => {
        const rowKey = combo.join("\u0000");
        let total = 0;
        for (const [key, bucket] of numericByCombo) {
          if (!key.startsWith(`${rowKey}\u0000`)) continue;
          for (const e of bucket) {
            const v = e.numeric[pct95.metric];
            if (Number.isFinite(v)) total += v;
          }
        }
        return total;
      },
      pct95.threshold,
    );
    rowCombos = rowCombos.filter((c) => kept.has(c.join("\u0000")));
  }

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
  const rowCombosCapped = effectiveRowCombos.slice(0, MAX_PIVOT_ROWS);

  const aggregateByFn = (fn: string): (number | null)[][] =>
    rowCombosCapped.map((r) =>
      colCombosCapped.map((c) => {
        const metric = c.metric || r.metric;
        if (!metric) return null;
        const key = `${r.combo.join("\u0000")}\u0000${c.combo.join("\u0000")}`;
        const values = (numericByCombo.get(key) ?? [])
          .map((e) => e.numeric[metric])
          .filter((v) => Number.isFinite(v));
        return values.length > 0 ? aggregateValues(values, fn) : null;
      }),
    );

  const grid = aggregateByFn(props.aggregateFunction ?? "Sum");

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

  return buildGridOutput(
    colDims,
    colCombos,
    colHeaders,
    rowDims,
    rowCombos,
    rowHeaders,
    rowLabels,
    colLabels,
    grid,
    colCombosCapped.map((c) => c.combo),
    metricOnRows,
    metrics,
    props.aggregateFunction ?? "Sum",
    truncated,
  );
}
