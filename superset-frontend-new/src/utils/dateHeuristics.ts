export type DateFormat = "YYYYMMDD" | "unix_seconds" | "unix_ms";

export interface DateColumnInfo {
  columnName: string;
  format: DateFormat;
  confidence: number;
}

const DATE_KEYWORDS = /date|time/i;

export function detectDateColumnFromMeta(
  columnName: string,
  columnType: string | null,
  existingComputedNames?: Set<string>,
): DateColumnInfo | null {
  if (!columnName || !columnType) return null;

  if (!DATE_KEYWORDS.test(columnName)) return null;

  const numericTypes =
    /^int\d*$|^bigint$|^smallint$|^tinyint$|^numeric$|^decimal$|^number$/i;
  if (!numericTypes.test(columnType)) return null;

  const computedName = `${columnName}_calc`;
  if (existingComputedNames?.has(computedName)) return null;

  return {
    columnName,
    format: "YYYYMMDD",
    confidence: 0.85,
  };
}

export function detectDateColumnsFromMeta(
  columns: {
    column_name: string;
    type: string | null;
    expression?: string | null;
    is_dttm?: boolean;
  }[],
): DateColumnInfo[] {
  const computedNames = new Set(
    columns.filter((c) => c.expression || c.is_dttm).map((c) => c.column_name),
  );

  const results: DateColumnInfo[] = [];
  for (const col of columns) {
    if (!col.column_name) continue;
    if (col.expression) continue;
    if (col.is_dttm) continue;
    const info = detectDateColumnFromMeta(
      col.column_name,
      col.type,
      computedNames,
    );
    if (info) results.push(info);
  }
  return results;
}

export function generateDateExpression(
  columnName: string,
  format: DateFormat,
): string {
  switch (format) {
    case "YYYYMMDD":
      return `CASE WHEN ${columnName} > 0 THEN TO_DATE(CAST(${columnName} AS TEXT), 'YYYYMMDD') END`;
    case "unix_ms":
      return `CASE WHEN ${columnName} > 0 THEN (TIMESTAMP 'epoch' + (${columnName} / 1000) * INTERVAL '1 second') END`;
    case "unix_seconds":
      return `CASE WHEN ${columnName} > 0 THEN (TIMESTAMP 'epoch' + ${columnName} * INTERVAL '1 second') END`;
    default:
      return `CAST(${columnName} AS DATE)`;
  }
}
