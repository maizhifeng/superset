/**
 * 把表格数据导出为 CSV 文件并触发浏览器下载。
 */
export function downloadCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  filename = "data.csv",
) {
  const escapeCell = (value: unknown): string => {
    const s = value == null ? "" : String(value);
    // 若含逗号、引号或换行则包裹引号并转义引号。
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  // 统一每行按列顺序取值，缺失补空。
  const lines = [
    columns.map(escapeCell).join(","),
    ...rows.map((row) => columns.map((c) => escapeCell(row[c])).join(",")),
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
