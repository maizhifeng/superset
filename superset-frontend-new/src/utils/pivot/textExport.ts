import type { PivotGroup } from "@/utils/pivot/tree";

/**
 * Pure builder for the pivot table's TSV text export.
 *
 * The imperative `getLayoutText` handle in the pivot table produces plain
 * tab-separated rows matching the visible layout (headers, visible rows in
 * their current collapse state, totals row).  It is a pure function of its
 * inputs, so it lives here — separate from the renderer — and is unit-testable.
 */

/** A single visible row: either a collapsible group or a leaf row. */
export interface VisiblePivotRow {
  key: string;
  group?: PivotGroup;
  rIdx?: number;
  /** Dimension labels for the row (group keyTuple or leaf dims). */
  dims?: string[];
}

export interface PivotTextExportInput {
  values: unknown[][];
  colLabels: string[];
  colCombos: string[][];
  rowDimLabels: string[];
  /** Whether each row dimension level is shown (columns visible). */
  showLevelLabels: boolean[];
  visibleRows: VisiblePivotRow[];
  showRowTotals: boolean;
  showColTotals: boolean;
  /** Render one metric cell to its display string. */
  renderCell: (key: string, v: number | null | undefined) => string;
  /** Backend subtotal value for a group at a column, or null. */
  subtotalValue: (group: PivotGroup, cIdx: number) => number | null;
  /** Client-side sum of a group's leaves at a column. */
  groupClientSum: (rows: number[], cIdx: number) => number | null;
  /** Row-total value for a leaf index. */
  rowTotal: number[];
  /** Backend grand-total value per column, or null. */
  backendTotal: (cIdx: number) => number | null;
  /** Client-side column totals. */
  colTotal: number[];
  /** Grand total (row totals x column total). */
  grandTotal: number;
}

/** Header label for a column, joining its combination dimensions. */
function colHeaderName(
  cIdx: number,
  colLabels: string[],
  colCombos: string[][],
): string {
  const combo = colCombos[cIdx] ?? [];
  const label = colLabels[cIdx] ?? "";
  return combo.length > 0 && label !== combo.join(" · ")
    ? `${combo.join(" · ")} · ${label}`
    : label;
}

/** Visible dimension labels of a row, honoring which levels are shown. */
function rowDims(
  row: VisiblePivotRow,
  showLevelLabels: boolean[],
): string[] {
  const dims = row.dims ?? [];
  return dims
    .map((label, l) => (showLevelLabels[l] ? label ?? "" : null))
    .filter((v): v is string => v !== null);
}

export function buildPivotTextExport(
  input: PivotTextExportInput,
): string | null {
  const {
    values,
    colLabels,
    colCombos,
    rowDimLabels,
    showLevelLabels,
    visibleRows,
    showRowTotals,
    showColTotals,
    renderCell,
    subtotalValue,
    groupClientSum,
    rowTotal,
    backendTotal,
    colTotal,
    grandTotal,
  } = input;

  if (values.length === 0 || colLabels.length === 0) return null;

  const dimNames = rowDimLabels.filter((_, l) => showLevelLabels[l]);
  const header = [
    ...dimNames,
    ...colLabels.map((_, cIdx) => colHeaderName(cIdx, colLabels, colCombos)),
    ...(showRowTotals ? ["合计"] : []),
  ].join("\t");
  const lines = [header];

  for (const row of visibleRows) {
    const dims = rowDims(row, showLevelLabels);
    const cells: string[] = [];
    for (let c = 0; c < colLabels.length; c += 1) {
      if (row.group) {
        const backend = subtotalValue(row.group, c);
        const fallback = groupClientSum(row.group.rows, c);
        const v = backend !== null ? backend : fallback;
        cells.push(renderCell(colLabels[c], v));
      } else {
        cells.push(renderCell(colLabels[c], values[row.rIdx ?? 0]?.[c] as number));
      }
    }
    if (showRowTotals) {
      const v = row.group
        ? rowTotal[row.group.rows[row.group.rows.length - 1]]
        : rowTotal[row.rIdx ?? 0];
      cells.push(renderCell("__total__", v));
    }
    lines.push([...dims, ...cells].join("\t"));
  }

  if (showColTotals) {
    const totalDims = dimNames.map((_, i) => (i === 0 ? "合计" : ""));
    const cells = colLabels.map((_, cIdx) => {
      const backend = backendTotal(cIdx);
      const v = backend !== null ? backend : colTotal[cIdx];
      return renderCell(colLabels[cIdx], v);
    });
    if (showRowTotals) cells.push(renderCell("__total__", grandTotal));
    lines.push([...totalDims, ...cells].join("\t"));
  }

  return lines.join("\n");
}
