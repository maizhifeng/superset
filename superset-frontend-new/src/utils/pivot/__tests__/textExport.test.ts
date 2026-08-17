import { test, expect } from "vitest";
import {
  buildPivotTextExport,
  type PivotTextExportInput,
} from "@/utils/pivot/textExport";
import type { PivotGroup } from "@/utils/pivot/tree";

const baseInput = (over: Partial<PivotTextExportInput> = {}): PivotTextExportInput => ({
  values: [[10, 20], [30, 40]],
  colLabels: ["clicks", "revenue"],
  colCombos: [],
  rowDimLabels: ["platform"],
  showLevelLabels: [true],
  visibleRows: [{ key: "L0", rIdx: 0, dims: ["a"] }, { key: "L1", rIdx: 1, dims: ["b"] }],
  showRowTotals: false,
  showColTotals: false,
  renderCell: (_k, v) => (v == null ? "" : String(v)),
  subtotalValue: () => null,
  groupClientSum: () => null,
  rowTotal: [30, 70],
  backendTotal: () => null,
  colTotal: [40, 60],
  grandTotal: 100,
  ...over,
});

test("returns null with no data", () => {
  expect(buildPivotTextExport({ ...baseInput(), values: [] })).toBeNull();
});

test("emits header and leaf rows as TSV", () => {
  const out = buildPivotTextExport(baseInput());
  expect(out).toBe(
    "platform\tclicks\trevenue\na\t10\t20\nb\t30\t40",
  );
});

test("hides hidden levels and appends 合计 when row totals are on", () => {
  const out = buildPivotTextExport(
    baseInput({
      showLevelLabels: [true],
      showRowTotals: true,
      rowTotal: [30, 70],
    }),
  );
  expect(out).toBe(
    "platform\tclicks\trevenue\t合计\na\t10\t20\t30\nb\t30\t40\t70",
  );
});

test("emits a column totals row when enabled", () => {
  const out = buildPivotTextExport(
    baseInput({
      showColTotals: true,
      colTotal: [40, 60],
      grandTotal: 100,
    }),
  );
  expect(out).toBe(
    "platform\tclicks\trevenue\n" +
      "a\t10\t20\n" +
      "b\t30\t40\n" +
      "合计\t40\t60",
  );
});

test("group rows use subtotal/fallback values and their keyTuple dims", () => {
  const group: PivotGroup = {
    level: 0,
    keyTuple: ["a"],
    collapseKey: "0:a",
    rows: [0, 1],
    children: [],
  };
  const out = buildPivotTextExport(
    baseInput({
      visibleRows: [{ key: "G", group, dims: ["a"] }],
      subtotalValue: (_g, c) => (c === 0 ? 10 : null),
      groupClientSum: (_rows, c) => (c === 0 ? 0 : 55),
    }),
  );
  expect(out).toBe(
    "platform\tclicks\trevenue\na\t10\t55",
  );
});
