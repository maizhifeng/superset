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

const MAX_PIVOT_ROWS = 1000;
const MAX_PIVOT_COLS = 80;

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

export function buildPivotGrid(props: PivotTableProps): PivotGrid {
  const {
    data = [],
    groupbyRows = [],
    groupbyColumns = [],
    metrics = [],
    transposePivot = false,
    metricsLayout = "COLUMNS",
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

  const distinctValues = (dim: string): string[] => {
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
  const distinctTuples = (dims: string[]): string[][] => {
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
  const sortTuples = (tuples: string[][], dims: string[]): string[][] => {
    const appearance = dims.map((d) => {
      const idx = new Map<string, number>();
      distinctValues(d).forEach((v, i) => idx.set(v, i));
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

  const rowCombos = sortTuples(distinctTuples(rowDims), rowDims);
  const colCombos = sortTuples(distinctTuples(colDims), colDims);

  interface ComboEntry {
    combo: string[];
    metric: string;
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

  const matchCombo = (
    entry: { row: ChartDataRow },
    dims: string[],
    combo: string[],
  ): boolean =>
    dims.every((dim, i) => String(entry.row[dim] ?? "") === combo[i]);

  const aggregateByFn = (fn: string): (number | null)[][] =>
    rowCombosCapped.map((r) =>
      colCombosCapped.map((c) => {
        const metric = c.metric || r.metric;
        if (!metric) return null;
        const values = numericRows
          .filter((e) => matchCombo(e, rowDims, r.combo))
          .filter((e) => matchCombo(e, colDims, c.combo))
          .map((e) => e.numeric[metric])
          .filter((v) => Number.isFinite(v));
        return values.length > 0 ? aggregateValues(values, fn) : null;
      }),
    );

  let grid = aggregateByFn(props.aggregateFunction ?? "Sum");

  const rowTotalsArr = grid.map((row) =>
    row.reduce<number>((acc, v) => acc + (v ?? 0), 0),
  );
  const colTotalsArr = colCombosCapped.map((_, cIdx) =>
    grid.reduce<number>((acc, row) => acc + (row[cIdx] ?? 0), 0),
  );
  const grandTotal = rowTotalsArr.reduce<number>((acc, v) => acc + v, 0);

  const fractionOf = / as Fraction of (Total|Rows|Columns)$/.exec(
    props.aggregateFunction ?? "",
  )?.[1];
  if (fractionOf) {
    grid = grid.map((row, rIdx) =>
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

  const metricCountPerCombo = metricOnRows ? 1 : Math.max(metrics.length, 1);
  const colGroupStarts: number[] = [];
  for (let i = 0; i < colCombosCapped.length; i += metricCountPerCombo) {
    colGroupStarts.push(i);
  }

  return {
    colHeaders,
    rowHeaders,
    values: grid,
    rowLabels: rowCombosCapped.map((r) => {
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
    }),
    colLabels: colCombosCapped.map(
      (c) => c.metric || (colDims.length > 0 ? c.combo.join(" · ") : "合计"),
    ),
    colCombos: colCombosCapped.map((c) => c.combo),
    rowDimLabels: [
      ...rowDims,
      ...(metricOnRows && metrics.length > 0 ? ["指标"] : []),
    ],
    colDimNames: colDims,
    colGroupStarts,
    truncated,
  };
}
