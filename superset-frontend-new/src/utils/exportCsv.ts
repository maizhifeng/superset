/**
 * 把表格数据导出为 CSV 文件并触发浏览器下载。
 */

/** Formats one cell; used by callers that already know the metric semantics. */
export type CsvCellFormatter = (key: string, value: unknown) => string;

/**
 * Default numeric export: whole values stay integers, fractional values round
 * to one decimal, and no thousands separators are added so Excel keeps the
 * cell numeric.
 */
function defaultCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value);
}

/** Remove grouping separators from an already formatted numeric string. */
function stripGrouping(value: string): string {
  return /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)
    ? value.replace(/,/g, "")
    : value;
}

export function downloadCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  filename = "data.csv",
  formatCell?: CsvCellFormatter,
) {
  const escapeText = (text: string): string => {
    // 若含逗号、引号或换行则包裹引号并转义引号。
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const escapeCell = (key: string, value: unknown): string => {
    const text = formatCell ? formatCell(key, value) : defaultCell(value);
    return escapeText(stripGrouping(text));
  };

  // 统一每行按列顺序取值，缺失补空。
  const lines = [
    columns.map(escapeText).join(","),
    ...rows.map((row) => columns.map((c) => escapeCell(c, row[c])).join(",")),
  ];
  const csv = "\uFEFF" + lines.join("\r\n"); // BOM 便于 Excel 识别 UTF-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
