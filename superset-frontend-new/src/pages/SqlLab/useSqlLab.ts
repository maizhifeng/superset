import { useState, useEffect, useCallback, useMemo } from "react";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { format as formatSql } from "sql-formatter";
import rison from "rison";
import type { Database, QueryResult } from "@/types/api";
import type { Completion } from "@codemirror/autocomplete";

export function useSqlLab() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [databaseId, setDatabaseId] = useState<number | "">("");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schema, setSchema] = useState("");
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [columnCache, setColumnCache] = useState<Record<string, Record<string, string[]>>>({});
  const [failedTables, setFailedTables] = useState<Set<string>>(new Set());
  const [loadingTable, setLoadingTable] = useState<string | null>(null);
  const [tableList, setTableList] = useState<{ value: string; type: string }[]>([]);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [datasetName, setDatasetName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<{ mouseX: number; mouseY: number; table?: string; column?: string } | null>(null);

  const quoteId = (id: string) => /[^a-zA-Z_0-9]/.test(id) ? `"${id}"` : id;

  const allCompletions = useMemo<Completion[]>(() => {
    const items: Completion[] = [];
    const tables = schema && columnCache[schema] ? columnCache[schema] : {};
    for (const [table, cols] of Object.entries(tables)) {
      items.push({ label: table, type: "table", boost: 99, apply: quoteId(table) });
      for (const col of cols) {
        items.push({ label: `${table}.${col}`, type: "property", detail: table, boost: 50, apply: `${quoteId(table)}.${quoteId(col)}` });
      }
    }
    return items;
  }, [columnCache, schema]);

  useEffect(() => {
    api.get<{ result: Database[] }>("/database/?q=(page_size:100,page:0)").then((res) => setDatabases(res.data.result)).catch(() => setError("加载数据库失败"));
  }, []);

  useEffect(() => {
    if (databaseId === "") { setSchemas([]); setSchema(""); setColumnCache({}); setTableList([]); return; }
    setSchemasLoading(true); setColumnCache({}); setLoadingTable(null);
    api.get<{ result: string[] }>(`/database/${databaseId}/schemas/`).then((res) => { setSchemas(res.data.result); setSchemasLoading(false); }).catch(() => { setSchemas([]); setSchemasLoading(false); });
  }, [databaseId]);

  useEffect(() => {
    if (databaseId === "" || !schema) { setColumnCache({}); setFailedTables(new Set()); setTableList([]); return; }
    setFailedTables(new Set());
    const qs = rison.encode({ schema_name: schema });
    api.get<{ result: { value: string; type: string }[] }>(`/database/${databaseId}/tables/?q=${qs}`).then((res) => {
      const tables = res.data.result; setTableList(tables);
      const CONCURRENCY = 4; let cancelled = false;
      (async () => {
        const map: Record<string, string[]> = {}; const failed: string[] = [];
        for (let i = 0; i < tables.length; i += CONCURRENCY) {
          if (cancelled) return;
          const batch = tables.slice(i, i + CONCURRENCY);
          await Promise.allSettled(batch.map(async (t) => {
            try { const meta = await api.get<{ columns: { name: string }[] }>(`/database/${databaseId}/table/${encodeURIComponent(t.value)}/${encodeURIComponent(schema)}/`); map[t.value] = meta.data.columns.map((c) => c.name); }
            catch { map[t.value] = []; failed.push(t.value); }
          }));
        }
        if (!cancelled) { setColumnCache((prev) => ({ ...prev, [schema]: map })); if (failed.length > 0) setFailedTables(new Set(failed)); }
      })();
      return () => { cancelled = true; };
    }).catch(() => setTableList([]));
  }, [databaseId, schema]);

  const fetchTableColumns = useCallback(async (tableName: string) => {
    if (!databaseId || !schema || columnCache[schema]?.[tableName] || failedTables.has(tableName)) return;
    setLoadingTable(tableName);
    try {
      const meta = await api.get<{ columns: { name: string }[] }>(`/database/${databaseId}/table/${encodeURIComponent(tableName)}/${encodeURIComponent(schema)}/`);
      setColumnCache((prev) => ({ ...prev, [schema]: { ...prev[schema], [tableName]: meta.data.columns.map((c) => c.name) } }));
    } catch { setColumnCache((prev) => ({ ...prev, [schema]: { ...prev[schema], [tableName]: [] } })); setFailedTables((prev) => new Set(prev).add(tableName));
    } finally { setLoadingTable(null); }
  }, [databaseId, schema, columnCache, failedTables]);

  useEffect(() => { setPage(0); }, [result]);

  const handleRun = useCallback(async () => {
    if (databaseId === "" || !sql.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try { const res = await api.post<QueryResult>("/sqllab/execute/", { database_id: databaseId, sql }); setResult(res.data); }
    catch (err: unknown) { setError(parseErrorMessage(err, "执行查询时发生错误")); }
    finally { setLoading(false); }
  }, [databaseId, sql]);

  const handleFormatSql = useCallback(() => {
    try { setSql((prev) => formatSql(prev, { language: "sql" })); } catch { setSql((prev) => prev.trim()); }
  }, []);

  const handleOpenSaveDialog = () => {
    setDatasetName(result?.query?.sql ? result.query.sql.split(" ").slice(0, 3).join("_") || "未命名" : "未命名");
    setSaveError(null); setSaveSuccess(false); setSaveDialogOpen(true);
  };

  const handleSaveDataset = async () => {
    if (!datasetName.trim() || databaseId === "") return;
    setSaving(true); setSaveError(null); setSaveSuccess(false);
    try { await api.post("/dataset/", { database: databaseId, table_name: datasetName, schema, sql }); setSaveSuccess(true); setTimeout(() => setSaveDialogOpen(false), 1000); }
    catch (err: unknown) { setSaveError(parseErrorMessage(err, "保存数据集失败")); }
    finally { setSaving(false); }
  };

  const insertTable = (name: string) => { setSql((prev) => { const trimmed = prev.trimEnd(); const q = quoteId(name); return trimmed ? `${trimmed}\nFROM ${q} ` : `SELECT * FROM ${q} `; }); };
  const insertColumn = (table: string, column: string) => { const fragment = `${quoteId(table)}.${quoteId(column)}`; setSql((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${fragment} `); };

  const paginatedData = result?.data?.slice(page * rowsPerPage, (page + 1) * rowsPerPage) ?? [];

  return {
    databases, databaseId, setDatabaseId, schemas, schema, setSchema, schemasLoading,
    columnCache, failedTables, loadingTable, tableList, sql, setSql, result,
    loading, error, page, setPage, rowsPerPage, setRowsPerPage,
    saveDialogOpen, datasetName, setDatasetName, saving, saveError, saveSuccess,
    sidebarOpen, setSidebarOpen, ctxMenu, setCtxMenu,
    allCompletions, quoteId, paginatedData,
    handleRun, handleFormatSql, handleOpenSaveDialog, handleSaveDataset,
    setSaveDialogOpen, fetchTableColumns,
    insertTable, insertColumn, setLoading, setError,
  };
}
