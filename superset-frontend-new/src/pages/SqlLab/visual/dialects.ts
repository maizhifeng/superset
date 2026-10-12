import type { VisualDateUnit } from "./types";

/**
 * Per-engine SQL dialect helpers for the visual builder. Superset exposes the
 * engine name as `Database.backend`; unknown engines fall back to ANSI double
 * quotes and no date truncation.
 */

export interface QuoteStyle {
  open: string;
  close: string;
}

const DOUBLE_QUOTE: QuoteStyle = { open: '"', close: '"' };
const BACKTICK: QuoteStyle = { open: "`", close: "`" };
const BRACKET: QuoteStyle = { open: "[", close: "]" };

const BACKTICK_BACKENDS = new Set([
  "mysql",
  "mariadb",
  "tidb",
  "singlestore",
  "clickhouse",
  "bigquery",
  "hive",
  "spark",
  "databricks",
  "impala",
  "kylin",
  "doris",
]);

const BRACKET_BACKENDS = new Set(["mssql", "transactsql", "sqlserver"]);

function normalizeBackend(backend: string | undefined | null): string {
  const value = (backend ?? "").trim().toLowerCase();
  if (!value) return "";
  // Backends may carry version suffixes such as "postgresql+psycopg2".
  return value.split(/[+/:_]/)[0];
}

export function quoteIdent(backend: string | undefined, id: string): string {
  const normalized = normalizeBackend(backend);
  const style = BRACKET_BACKENDS.has(normalized)
    ? BRACKET
    : BACKTICK_BACKENDS.has(normalized)
      ? BACKTICK
      : DOUBLE_QUOTE;
  const escaped = id.split(style.close).join(style.close + style.close);
  return `${style.open}${escaped}${style.close}`;
}

/** Fully qualified table reference, schema part optional. */
export function qualifyTable(
  backend: string | undefined,
  schema: string,
  table: string,
): string {
  if (!schema) return quoteIdent(backend, table);
  return `${quoteIdent(backend, schema)}.${quoteIdent(backend, table)}`;
}

const DATE_TRUNC_BACKENDS = new Set([
  "postgresql",
  "postgres",
  "redshift",
  "duckdb",
  "snowflake",
  "trino",
  "presto",
]);

const MYSQL_BACKENDS = new Set(["mysql", "mariadb", "tidb", "singlestore"]);

const MYSQL_TRUNC: Record<VisualDateUnit, (expr: string) => string> = {
  day: (expr) => `DATE(${expr})`,
  week: (expr) =>
    `DATE_FORMAT(DATE_SUB(${expr}, INTERVAL WEEKDAY(${expr}) DAY),'%Y-%m-%d')`,
  month: (expr) => `DATE_FORMAT(${expr},'%Y-%m-01')`,
  quarter: (expr) =>
    `CONCAT(YEAR(${expr}),'-',LPAD((QUARTER(${expr})-1)*3+1,2,'0'),'-01')`,
  year: (expr) => `DATE_FORMAT(${expr},'%Y-01-01')`,
};

const SQLITE_TRUNC: Record<VisualDateUnit, (expr: string) => string> = {
  day: (expr) => `date(${expr})`,
  week: (expr) =>
    `date(${expr}, '-' || ((strftime('%w', ${expr}) + 6) % 7) || ' days')`,
  month: (expr) => `date(${expr}, 'start of month')`,
  quarter: (expr) =>
    `date(${expr}, 'start of month', '+' || (3 * ` +
    `((cast(strftime('%m', ${expr}) as integer) - 1) / 3)) || ' months')`,
  year: (expr) => `date(${expr}, 'start of year')`,
};

const CLICKHOUSE_TRUNC: Record<VisualDateUnit, (expr: string) => string> = {
  day: (expr) => `toStartOfDay(${expr})`,
  week: (expr) => `toStartOfWeek(${expr}, 1)`,
  month: (expr) => `toStartOfMonth(${expr})`,
  quarter: (expr) => `toStartOfQuarter(${expr})`,
  year: (expr) => `toStartOfYear(${expr})`,
};

const BIGQUERY_TRUNC: Record<VisualDateUnit, (expr: string) => string> = {
  day: (expr) => `DATE_TRUNC(${expr}, DAY)`,
  week: (expr) => `DATE_TRUNC(${expr}, WEEK)`,
  month: (expr) => `DATE_TRUNC(${expr}, MONTH)`,
  quarter: (expr) => `DATE_TRUNC(${expr}, QUARTER)`,
  year: (expr) => `DATE_TRUNC(${expr}, YEAR)`,
};

const MSSQL_TRUNC: Record<VisualDateUnit, (expr: string) => string> = {
  day: (expr) => `DATETRUNC(day, ${expr})`,
  week: (expr) => `DATETRUNC(week, ${expr})`,
  month: (expr) => `DATETRUNC(month, ${expr})`,
  quarter: (expr) => `DATETRUNC(quarter, ${expr})`,
  year: (expr) => `DATETRUNC(year, ${expr})`,
};

const ORACLE_TRUNC: Record<VisualDateUnit, (expr: string) => string> = {
  day: (expr) => `TRUNC(${expr})`,
  week: (expr) => `TRUNC(${expr}, 'IW')`,
  month: (expr) => `TRUNC(${expr}, 'MM')`,
  quarter: (expr) => `TRUNC(${expr}, 'Q')`,
  year: (expr) => `TRUNC(${expr}, 'YYYY')`,
};

/**
 * Returns the SQL truncating a temporal expression to the given unit, or null
 * when the engine is unknown/unsupported (the caller then falls back to the
 * raw expression and surfaces a hint in the UI).
 */
export function dateTrunc(
  backend: string | undefined,
  expr: string,
  unit: VisualDateUnit,
): string | null {
  const normalized = normalizeBackend(backend);
  if (DATE_TRUNC_BACKENDS.has(normalized)) {
    return `DATE_TRUNC('${unit}', ${expr})`;
  }
  if (MYSQL_BACKENDS.has(normalized)) return MYSQL_TRUNC[unit](expr);
  if (normalized === "sqlite") return SQLITE_TRUNC[unit](expr);
  if (normalized === "clickhouse") return CLICKHOUSE_TRUNC[unit](expr);
  if (normalized === "bigquery") return BIGQUERY_TRUNC[unit](expr);
  if (BRACKET_BACKENDS.has(normalized)) return MSSQL_TRUNC[unit](expr);
  if (normalized === "oracle") return ORACLE_TRUNC[unit](expr);
  return null;
}

export function supportsDateUnit(backend: string | undefined): boolean {
  return dateTrunc(backend, "x", "month") !== null;
}

/** Boolean literal for engines without TRUE/FALSE keywords. */
export function booleanLiteral(
  backend: string | undefined,
  value: boolean,
): string {
  const normalized = normalizeBackend(backend);
  if (BRACKET_BACKENDS.has(normalized)) return value ? "1" : "0";
  return value ? "TRUE" : "FALSE";
}

/** sql-formatter language for the backend (falls back to generic SQL). */
export function formatterDialect(backend: string | undefined): string {
  const normalized = normalizeBackend(backend);
  const map: Record<string, string> = {
    postgresql: "postgresql",
    postgres: "postgresql",
    redshift: "redshift",
    duckdb: "duckdb",
    snowflake: "snowflake",
    trino: "trino",
    presto: "trino",
    mysql: "mysql",
    mariadb: "mariadb",
    tidb: "tidb",
    singlestore: "singlestoredb",
    clickhouse: "clickhouse",
    bigquery: "bigquery",
    hive: "hive",
    spark: "spark",
    databricks: "spark",
    mssql: "transactsql",
    transactsql: "transactsql",
    sqlserver: "transactsql",
    oracle: "plsql",
    sqlite: "sqlite",
  };
  return map[normalized] ?? "sql";
}

export const DATE_UNIT_LABELS: Record<VisualDateUnit, string> = {
  day: "按天",
  week: "按周",
  month: "按月",
  quarter: "按季",
  year: "按年",
};

export const JOIN_TYPE_LABELS: Record<string, string> = {
  inner: "内连接 INNER JOIN",
  left: "左连接 LEFT JOIN",
  right: "右连接 RIGHT JOIN",
  full: "全连接 FULL JOIN",
};
