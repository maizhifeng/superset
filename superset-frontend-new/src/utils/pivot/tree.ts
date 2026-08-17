/**
 * Pivot row-tree helpers.
 *
 * These are the pure, side-effect-free pieces of the pivot table: collapsing
 * consecutive labels and building the hierarchical group tree from the
 * already-flattened row headers.  Kept separate from the renderer so they are
 * unit-testable in isolation.
 */

/** Merge consecutive equal labels into `{label, span}` runs (for row-grouping). */
export function mergeConsecutive(
  labels: string[],
): { label: string; span: number }[] {
  const groups: { label: string; span: number }[] = [];
  for (const label of labels) {
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.span += 1;
    } else {
      groups.push({ label, span: 1 });
    }
  }
  return groups;
}

export interface PivotGroup {
  level: number;
  /** Dimension values from level 0 up to this group's level. */
  keyTuple: string[];
  /** Unique collapse key: level + ancestor values. */
  collapseKey: string;
  /** Leaf row indices under this group. */
  rows: number[];
  /** Sub-groups at the next level (empty for leaf groups). */
  children: PivotGroup[];
}

/**
 * Build the hierarchical collapse tree from flattened row headers.
 *
 * Groups by key with a Map instead of relying on consecutive rows: the 95%
 * mode sorts rows by the split metric, so same-key rows are no longer
 * adjacent and must still collapse into a single group.
 */
export function buildTree(
  level: number,
  indices: number[],
  ancestors: string[],
  rowHeaders: string[][],
): PivotGroup[] {
  const byKey = new Map<string, PivotGroup>();
  for (const i of indices) {
    const key = rowHeaders[level]?.[i] ?? "";
    let group = byKey.get(key);
    if (!group) {
      group = {
        level,
        keyTuple: [...ancestors, key],
        collapseKey: `${level}:${[...ancestors, key].join("\u0000")}`,
        rows: [],
        children: [],
      };
      byKey.set(key, group);
    }
    group.rows.push(i);
  }
  const result = [...byKey.values()];
  if (level < rowHeaders.length - 1) {
    for (const group of result) {
      group.children = buildTree(
        level + 1,
        group.rows,
        group.keyTuple,
        rowHeaders,
      );
    }
  }
  return result;
}
