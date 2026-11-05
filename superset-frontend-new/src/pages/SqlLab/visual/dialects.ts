import type { VisualDateUnit } from "./types";
import { normalizeBackend } from "@/utils/sqlFormat";

/**
 * Per-engine SQL dialect helpers for the visual builder. Superset exposes the
 * engine name as `Database.backend`; unknown engines fall back to ANSI double
 * quotes and no date truncation.
 *
 * The sql-formatter dialect table itself lives in ``@/utils/sqlFormat`` so every
 * SQL surface shares one engine mapping; it is re-exported here for the visual
 * builder's imports.
 */
export { formatterDialect } from "@/utils/sqlFormat";

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

/**
 * Identifiers that are safe unquoted: lowercase ASCII letter/underscore start,
 * then letters/digits/underscore/dollar. Anything else (uppercase, spaces,
 * CJK labels, punctuation) keeps engine-specific quotes so its exact name is
 * preserved.
 */
const SAFE_UNQUOTED_IDENT = /^[a-z_][a-z0-9_$]*$/;

/**
 * Reserved keywords (union of PostgreSQL / MySQL / SQL Server / Hive common
 * sets). A safe-looking name that is a keyword must stay quoted. False
 * positives only add harmless quotes; false negatives would break parsing, so
 * the list is intentionally broad.
 */
const RESERVED_WORDS = new Set([
  "accessible",
  "add",
  "all",
  "alter",
  "analyze",
  "and",
  "any",
  "as",
  "asc",
  "asymmetric",
  "authorization",
  "backup",
  "begin",
  "between",
  "bigint",
  "binary",
  "blob",
  "boolean",
  "both",
  "break",
  "browse",
  "bulk",
  "by",
  "call",
  "cascade",
  "case",
  "cast",
  "change",
  "char",
  "character",
  "check",
  "checkpoint",
  "close",
  "clustered",
  "coalesce",
  "collate",
  "column",
  "commit",
  "compute",
  "condition",
  "conflict",
  "constraint",
  "contains",
  "containstable",
  "continue",
  "convert",
  "create",
  "cross",
  "current",
  "current_catalog",
  "current_date",
  "current_role",
  "current_schema",
  "current_time",
  "current_timestamp",
  "current_user",
  "cursor",
  "database",
  "dbcc",
  "deallocate",
  "declare",
  "default",
  "deferrable",
  "delayed",
  "delete",
  "deny",
  "desc",
  "deterministic",
  "disk",
  "distinct",
  "distinctrow",
  "distributed",
  "div",
  "do",
  "double",
  "drop",
  "dual",
  "dump",
  "each",
  "else",
  "enclosed",
  "end",
  "errlvl",
  "escape",
  "except",
  "exec",
  "execute",
  "exists",
  "exit",
  "explain",
  "external",
  "false",
  "fetch",
  "file",
  "fillfactor",
  "filter",
  "first",
  "float",
  "following",
  "for",
  "force",
  "foreign",
  "freetext",
  "freetexttable",
  "from",
  "full",
  "function",
  "goto",
  "grant",
  "group",
  "groups",
  "having",
  "holdlock",
  "identity",
  "identity_insert",
  "identitycol",
  "if",
  "ignore",
  "ilike",
  "in",
  "index",
  "infile",
  "inner",
  "insert",
  "int",
  "integer",
  "intersect",
  "interval",
  "into",
  "is",
  "iterate",
  "join",
  "key",
  "kill",
  "last",
  "lateral",
  "leading",
  "leave",
  "left",
  "like",
  "limit",
  "linear",
  "lineno",
  "load",
  "local",
  "localtime",
  "localtimestamp",
  "lock",
  "long",
  "loop",
  "low_priority",
  "master",
  "mediumint",
  "merge",
  "mod",
  "modifies",
  "national",
  "natural",
  "nocheck",
  "nonclustered",
  "not",
  "null",
  "nullif",
  "nulls",
  "numeric",
  "of",
  "off",
  "offset",
  "offsets",
  "on",
  "only",
  "open",
  "opendatasource",
  "openquery",
  "openrowset",
  "openxml",
  "optimize",
  "option",
  "optionally",
  "or",
  "order",
  "outfile",
  "outer",
  "over",
  "partition",
  "percent",
  "pivot",
  "placing",
  "plan",
  "precision",
  "primary",
  "print",
  "proc",
  "procedure",
  "purge",
  "raiserror",
  "read",
  "reads",
  "readtext",
  "real",
  "reconfigure",
  "references",
  "regexp",
  "rename",
  "repeat",
  "replace",
  "require",
  "resignal",
  "restore",
  "restrict",
  "return",
  "returning",
  "revert",
  "revoke",
  "right",
  "rlike",
  "rollback",
  "row",
  "rowcount",
  "rowguidcol",
  "rows",
  "rule",
  "save",
  "schema",
  "securityaudit",
  "select",
  "semantickeyphrasetable",
  "semanticsimilaritydetailstable",
  "semanticsimilaritytable",
  "separator",
  "session_user",
  "set",
  "setuser",
  "show",
  "shutdown",
  "signal",
  "smallint",
  "some",
  "spatial",
  "specific",
  "sql",
  "sqlexception",
  "sqlstate",
  "sqlwarning",
  "ssl",
  "starting",
  "statistics",
  "straight_join",
  "symmetric",
  "system_user",
  "table",
  "tables",
  "tablesample",
  "terminated",
  "textsize",
  "then",
  "tinyint",
  "to",
  "top",
  "tran",
  "transaction",
  "trailing",
  "trigger",
  "true",
  "truncate",
  "try_convert",
  "tsequal",
  "undo",
  "union",
  "unique",
  "unlock",
  "unsigned",
  "update",
  "updatetext",
  "usage",
  "use",
  "user",
  "using",
  "utf8",
  "values",
  "varchar",
  "varying",
  "view",
  "waitfor",
  "when",
  "where",
  "while",
  "window",
  "with",
  "within",
  "without",
  "write",
  "writetext",
  "xor",
  "year_month",
  "zerofill",
  "zone",
]);

/**
 * Format an identifier, quoting only when needed. Safe lowercase non-keyword
 * names stay unquoted so generated SQL is readable; anything else keeps the
 * engine quote style so the exact name is preserved.
 */
export function formatIdent(backend: string | undefined, id: string): string {
  if (SAFE_UNQUOTED_IDENT.test(id) && !RESERVED_WORDS.has(id)) return id;
  return quoteIdent(backend, id);
}

/**
 * Engines whose SQL Lab execution applies the selected schema as the session
 * default (``get_prequeries`` on the backend), so unqualified table names
 * resolve to it. PostgreSQL-family engines set ``search_path``; Hive/Spark/
 * Databricks/StarRocks/DB2 issue ``USE``/``SET SCHEMA``.
 */
const DEFAULT_SCHEMA_BACKENDS = new Set([
  "postgresql",
  "postgres",
  "db2",
  "databricks",
  "hive",
  "spark",
  "starrocks",
]);

/** True when the selected schema becomes the session default for unqualified names. */
export function supportsDefaultSchema(backend: string | undefined): boolean {
  return DEFAULT_SCHEMA_BACKENDS.has(normalizeBackend(backend));
}

/** Fully qualified table reference; schema part is omitted when known to be the default. */
export function qualifyTable(
  backend: string | undefined,
  schema: string,
  table: string,
  omitSchema = false,
): string {
  const tableRef = formatIdent(backend, table);
  if (!schema || omitSchema) return tableRef;
  return `${formatIdent(backend, schema)}.${tableRef}`;
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
