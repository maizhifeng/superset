export type DateFormat = "YYYYMMDD" | "unix_seconds" | "unix_ms";

export interface DateColumnInfo {
  columnName: string;
  format: DateFormat;
  confidence: number;
}

const DATE_KEYWORDS = /date|time/i;

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Format a value that represents a date into "YYYY-MM-DD".
 *
 * Handles Unix timestamps (milliseconds/seconds), YYYYMMDD integers, and
 * ISO 8601 date/datetime strings.  ISO strings keep their date part verbatim
 * so timezone-aware values (e.g. "...T16:00:00.000Z") never shift the day.
 */
export function formatDateValue(value: unknown): string | null {
  if (typeof value === "number") {
    // YYYYMMDD integers (1900-01-01 .. 2200-12-31)
    if (Number.isInteger(value) && value >= 19000101 && value <= 22001231) {
      const s = String(Math.floor(value));
      if (s.length === 8) {
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      }
    }
    // Unix milliseconds
    if (value > 1e12 && value < 1e16) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return toYmd(d);
    }
    // Unix seconds
    if (value > 1e8 && value < 1e12) {
      const d = new Date(value * 1000);
      if (
        !isNaN(d.getTime()) &&
        d.getFullYear() > 1900 &&
        d.getFullYear() < 2200
      ) {
        return toYmd(d);
      }
    }
  }
  if (typeof value === "string") {
    const iso = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const num = Number(value);
    if (!isNaN(num) && num >= 19000101) {
      return formatDateValue(num);
    }
  }
  return null;
}

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
      return `CASE WHEN ${columnName} > 0 AND LENGTH(CAST(${columnName} AS TEXT)) = 8 THEN TO_DATE(CAST(${columnName} AS TEXT), 'YYYYMMDD') END`;
    case "unix_ms":
      return `CASE WHEN ${columnName} > 0 THEN (TIMESTAMP 'epoch' + (${columnName} / 1000) * INTERVAL '1 second') END`;
    case "unix_seconds":
      return `CASE WHEN ${columnName} > 0 THEN (TIMESTAMP 'epoch' + ${columnName} * INTERVAL '1 second') END`;
    default:
      return `CAST(${columnName} AS DATE)`;
  }
}
