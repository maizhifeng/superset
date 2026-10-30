import { format as formatSql } from "sql-formatter";
import type { SqlLanguage } from "sql-formatter";

/**
 * Engine-name helpers shared by the SQL surfaces.
 *
 * Superset reports engines on ``Database.backend`` and the value can carry a
 * driver suffix (``postgresql+psycopg2``) or a version suffix, so it is
 * normalised before being mapped onto a formatter dialect.
 */

/** Normalise a Superset engine name (strips driver/version suffixes). */
export function normalizeBackend(backend: string | undefined | null): string {
  const value = (backend ?? "").trim().toLowerCase();
  if (!value) return "";
  return value.split(/[+/:_]/)[0];
}

// sql-formatter's dialect ids, keyed by Superset engine name.
const FORMATTER_DIALECTS: Record<string, SqlLanguage> = {
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
  plsql: "plsql",
  sqlite: "sqlite",
};

/** sql-formatter language for the backend (falls back to generic SQL). */
export function formatterDialect(
  backend: string | undefined | null,
): SqlLanguage {
  const normalized = normalizeBackend(backend);
  return FORMATTER_DIALECTS[normalized] ?? "sql";
}

/**
 * Format SQL for the given engine.
 *
 * Throws when sql-formatter cannot parse the statement; callers decide whether
 * to surface that to the user or leave the buffer untouched.
 */
export function formatSqlText(
  sql: string,
  backend: string | undefined | null,
): string {
  return formatSql(sql, {
    language: formatterDialect(backend),
    keywordCase: "upper",
    tabWidth: 2,
    useTabs: false,
    linesBetweenQueries: 2,
  });
}
