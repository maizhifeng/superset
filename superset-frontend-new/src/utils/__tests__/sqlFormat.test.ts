import {
  formatterDialect,
  formatSqlText,
  normalizeBackend,
} from "@/utils/sqlFormat";
import { test, expect } from "vitest";

test("normalizeBackend strips driver and version suffixes", () => {
  expect(normalizeBackend("postgresql+psycopg2")).toBe("postgresql");
  expect(normalizeBackend("MySQL")).toBe("mysql");
  expect(normalizeBackend(" postgresql:14 ")).toBe("postgresql");
  expect(normalizeBackend(undefined)).toBe("");
});

test("formatterDialect maps Superset engines onto sql-formatter languages", () => {
  expect(formatterDialect("postgresql+psycopg2")).toBe("postgresql");
  expect(formatterDialect("mssql")).toBe("transactsql");
  expect(formatterDialect("oracle")).toBe("plsql");
  expect(formatterDialect("unknown-engine")).toBe("sql");
  expect(formatterDialect(undefined)).toBe("sql");
});

test("formatSqlText uppercases keywords and keeps the statement structure", () => {
  const formatted = formatSqlText(
    "select id, name from users where id = 1",
    "postgresql",
  );

  expect(formatted).toContain("SELECT");
  expect(formatted).toContain("FROM");
  expect(formatted).toContain("WHERE");
  expect(formatted).not.toContain("select");
});
