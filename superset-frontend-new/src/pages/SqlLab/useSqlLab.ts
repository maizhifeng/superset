import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { format as formatSql } from "sql-formatter";
import rison from "rison";
import type { Database, QueryResult } from "@/types/api";
import type { Completion } from "@codemirror/autocomplete";

const LAST_DB_KEY = "superset-sql-lab-last-database";
const LAST_SCHEMA_KEY = "superset-sql-lab-last-schema";
const ROWS_PER_PAGE_KEY = "superset-sql-lab-rows-per-page";
const SIDEBAR_KEY = "superset-sql-lab-sidebar-open";
const RECENT_KEY = "superset-sql-lab-recent-queries";

const MAX_RECENT = 6;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function storeRecent(queries: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(queries));
}

export interface UseSqlLabOptions {
  /** 初始 SQL，如从已保存查询"在 SQL 实验室中打开"时预填到首个标签页。 */
  initialSql?: string;
  /** 初始数据库 id，如从数据库详情"在 SQL 实验室中打开"时预选。 */
  initialDatabaseId?: number;
}

export function useSqlLab({ initialSql, initialDatabaseId }: UseSqlLabOptions = {}) {
  const [databases, setDatabases] = useState<Database[]>([]);
  // 记住上次使用的数据库，便于再次进入 SQL 实验室时延续上下文。
  const [databaseId, setDatabaseId] = useState<number | "">(() => {
    if (initialDatabaseId) return initialDatabaseId;
    const saved = Number(localStorage.getItem(LAST_DB_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : "";
  });
  const [schemas, setSchemas] = useState<string[]>([]);
  // 记住上次选中的模式，便于再次进入时延续上下文。
  const [schema, setSchema] = useState(() =>
    localStorage.getItem(LAST_SCHEMA_KEY) ?? "",
  );
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [columnCache, setColumnCache] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const [failedTables, setFailedTables] = useState<Set<string>>(new Set());
  const [loadingTable, setLoadingTable] = useState<string | null>(null);
  const [tableList, setTableList] = useState<{ value: string; type: string }[]>(
    [],
  );
  // 手动刷新 schema 浏览器时递增，触发表与列重新加载。
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const [sql, setSql] = useState(initialSql ?? "");
  const [recentQueries, setRecentQueries] = useState<string[]>(() =>
    readRecent(),
  );
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = Number(localStorage.getItem(ROWS_PER_PAGE_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 100;
  });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [datasetName, setDatasetName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savedDatasetId, setSavedDatasetId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) !== "0",
  );
  const [ctxMenu, setCtxMenu] = useState<{
    mouseX: number;
    mouseY: number;
    table?: string;
    column?: string;
  } | null>(null);

  // 查询标签页：每个标签独立保存 SQL，切换标签不会丢失编辑内容。
  const [tabs, setTabs] = useState<{ id: number; name: string; sql: string }[]>([
    { id: 1, name: "未命名查询 1", sql: initialSql ?? "" },
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const nextTabIdRef = useRef(2);

  // 将当前编辑 SQL 写回活动标签，避免切换时丢失。
  useEffect(() => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, sql } : t)),
    );
  }, [sql, activeTabId]);

  const newQueryTab = useCallback(() => {
    const id = nextTabIdRef.current++;
    setTabs((prev) => [...prev, { id, name: `未命名查询 ${id}`, sql: "" }]);
    setActiveTabId(id);
    setSql("");
    setResult(null);
    setError(null);
    setPage(0);
  }, []);

  /** 关闭全部标签页，回到单一空白标签。 */
  const closeAllTabs = useCallback(() => {
    const id = nextTabIdRef.current++;
    setTabs([{ id, name: "未命名查询 1", sql: "" }]);
    setActiveTabId(id);
    setSql("");
    setResult(null);
    setError(null);
    setPage(0);
  }, []);

  const activateQueryTab = useCallback(
    (id: number) => {
      setActiveTabId(id);
      const target = tabs.find((t) => t.id === id);
      setSql(target?.sql ?? "");
      setResult(null);
      setError(null);
      setPage(0);
    },
    [tabs],
  );

  const closeQueryTab = useCallback(
    (id: number) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const nid = nextTabIdRef.current++;
          next.push({ id: nid, name: `未命名查询 ${nid}`, sql: "" });
        }
        if (activeTabId === id) {
          const target = next[Math.min(idx, next.length - 1)];
          setActiveTabId(target.id);
          setSql(target.sql);
          setResult(null);
          setError(null);
          setPage(0);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const quoteId = (id: string) => (/[^a-zA-Z_0-9]/.test(id) ? `"${id}"` : id);

  const allCompletions = useMemo<Completion[]>(() => {
    const items: Completion[] = [];
    const tables = schema && columnCache[schema] ? columnCache[schema] : {};
    for (const [table, cols] of Object.entries(tables)) {
      items.push({
        label: table,
        type: "table",
        boost: 99,
        apply: quoteId(table),
      });
      for (const col of cols) {
        items.push({
          label: `${table}.${col}`,
          type: "property",
          detail: table,
          boost: 50,
          apply: `${quoteId(table)}.${quoteId(col)}`,
        });
      }
    }
    return items;
  }, [columnCache, schema]);

  useEffect(() => {
    api
      .get<{ result: Database[] }>("/database/?q=(page_size:100,page:0)")
      .then((res) => setDatabases(res.data.result))
      .catch(() => setError("加载数据库失败"));
  }, []);

  /** 手动刷新数据库下拉列表。 */
  const refreshDatabases = useCallback(() => {
    api
      .get<{ result: Database[] }>("/database/?q=(page_size:100,page:0)")
      .then((res) => setDatabases(res.data.result))
      .catch(() => setError("加载数据库失败"));
  }, []);

  // 记住上次选中的数据库，以便再次进入 SQL 实验室时延续上下文。
  useEffect(() => {
    if (databaseId === "") {
      localStorage.removeItem(LAST_DB_KEY);
    } else {
      localStorage.setItem(LAST_DB_KEY, String(databaseId));
    }
  }, [databaseId]);

  // 记住上次选中的模式（数据库切换后若失效会自动清空）。
  useEffect(() => {
    if (schema === "") {
      localStorage.removeItem(LAST_SCHEMA_KEY);
    } else {
      localStorage.setItem(LAST_SCHEMA_KEY, schema);
    }
  }, [schema]);

  // 记住上次选择的结果每页行数。
  useEffect(() => {
    localStorage.setItem(ROWS_PER_PAGE_KEY, String(rowsPerPage));
  }, [rowsPerPage]);

  // 记住左侧栏是否展开。
  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  useEffect(() => {
    if (databaseId === "") {
      setSchemas([]);
      setSchema("");
      setColumnCache({});
      setTableList([]);
      return;
    }
    setSchemasLoading(true);
    setColumnCache({});
    setLoadingTable(null);
    api
      .get<{ result: string[] }>(`/database/${databaseId}/schemas/`)
      .then((res) => {
        const list = res.data.result;
        setSchemas(list);
        // 模式列表已随数据库变化而更新，若上次记忆的模式已失效则复位。
        setSchema((prev) =>
          prev && list.includes(prev) ? prev : "",
        );
        setSchemasLoading(false);
      })
      .catch(() => {
        setSchemas([]);
        setSchemasLoading(false);
      });
  }, [databaseId]);

  useEffect(() => {
    if (databaseId === "" || !schema) {
      setColumnCache({});
      setFailedTables(new Set());
      setTableList([]);
      return;
    }
    setFailedTables(new Set());
    const qs = rison.encode({ schema_name: schema });
    api
      .get<{ result: { value: string; type: string }[] }>(
        `/database/${databaseId}/tables/?q=${qs}`,
      )
      .then((res) => {
        const tables = res.data.result;
        setTableList(tables);
        const CONCURRENCY = 4;
        let cancelled = false;
        void (async () => {
          const map: Record<string, string[]> = {};
          const failed: string[] = [];
          for (let i = 0; i < tables.length; i += CONCURRENCY) {
            if (cancelled) return;
            const batch = tables.slice(i, i + CONCURRENCY);
            await Promise.allSettled(
              batch.map(async (t) => {
                try {
                  const meta = await api.get<{ columns: { name: string }[] }>(
                    `/database/${databaseId}/table/${encodeURIComponent(t.value)}/${encodeURIComponent(schema)}/`,
                  );
                  map[t.value] = meta.data.columns.map((c) => c.name);
                } catch {
                  map[t.value] = [];
                  failed.push(t.value);
                }
              }),
            );
          }
          if (!cancelled) {
            setColumnCache((prev) => ({ ...prev, [schema]: map }));
            if (failed.length > 0) setFailedTables(new Set(failed));
          }
        })();
        return () => {
          cancelled = true;
        };
      })
      .catch(() => setTableList([]));
  }, [databaseId, schema, tableRefreshKey]);

  /** 手动刷新 schema 浏览器（重新拉取表与列元数据）。 */
  const refreshSchemaBrowser = useCallback(() => {
    setTableRefreshKey((k) => k + 1);
  }, []);

  const fetchTableColumns = useCallback(
    async (tableName: string) => {
      if (
        !databaseId ||
        !schema ||
        columnCache[schema]?.[tableName] ||
        failedTables.has(tableName)
      )
        return;
      setLoadingTable(tableName);
      try {
        const meta = await api.get<{ columns: { name: string }[] }>(
          `/database/${databaseId}/table/${encodeURIComponent(tableName)}/${encodeURIComponent(schema)}/`,
        );
        setColumnCache((prev) => ({
          ...prev,
          [schema]: {
            ...prev[schema],
            [tableName]: meta.data.columns.map((c) => c.name),
          },
        }));
      } catch {
        setColumnCache((prev) => ({
          ...prev,
          [schema]: { ...prev[schema], [tableName]: [] },
        }));
        setFailedTables((prev) => new Set(prev).add(tableName));
      } finally {
        setLoadingTable(null);
      }
    },
    [databaseId, schema, columnCache, failedTables],
  );

  useEffect(() => {
    setPage(0);
  }, [result]);

  const handleRun = useCallback(async () => {
    if (databaseId === "" || !sql.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<QueryResult>("/sqllab/execute/", {
        database_id: databaseId,
        sql,
      });
      setResult(res.data);
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "执行查询时发生错误"));
    } finally {
      setLoading(false);
    }
  }, [databaseId, sql]);

  /** 运行一段指定的 SQL（用于"运行选中的语句/当前语句"）。 */
  const handleRunSql = useCallback(
    async (runSql: string) => {
      if (databaseId === "" || !runSql.trim()) return;
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await api.post<QueryResult>("/sqllab/execute/", {
          database_id: databaseId,
          sql: runSql,
        });
        setResult(res.data);
        setRecentQueries((prev) => {
          const next = [
            runSql,
            ...prev.filter((q) => q !== runSql),
          ].slice(0, MAX_RECENT);
          storeRecent(next);
          return next;
        });
      } catch (err: unknown) {
        setError(parseErrorMessage(err, "执行查询时发生错误"));
      } finally {
        setLoading(false);
      }
    },
    [databaseId],
  );

  const handleFormatSql = useCallback(() => {
    try {
      setSql((prev) => formatSql(prev, { language: "sql" }));
    } catch {
      setSql((prev) => prev.trim());
    }
  }, []);

  const handleOpenSaveDialog = () => {
    setDatasetName(datasetNameFromSql(result?.query?.sql));
    setSaveError(null);
    setSaveSuccess(false);
    setSaveDialogOpen(true);
  };

  /** 从 SQL 中提取一个友好的默认数据集名（取第一个 FROM/JOIN 的表名）。 */
  function datasetNameFromSql(sql?: string): string {
    if (!sql) return "未命名";
    const trimmed = sql.trim();
    // 匹配 FROM/JOIN 后的表名（可带 schema 前缀、引号），取最后一个标识符段。
    const m = trimmed.match(
      /\b(?:from|join)\s+[`"[]?(?:[\w$-]+\.)?[`"[]?([\w$-]+)[`"\]]?/i,
    );
    if (m && m[1]) return m[1];
    return `查询结果_${Date.now().toString().slice(-6)}`;
  }

  const handleSaveDataset = async () => {
    if (!datasetName.trim() || databaseId === "") return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    setSavedDatasetId(null);
    try {
      const res = await api.post<{ id?: number; result?: { id?: number } }>(
        "/dataset/",
        {
          database: databaseId,
          table_name: datasetName,
          schema,
          sql,
        },
      );
      const createdId = res.data?.id ?? res.data?.result?.id ?? null;
      setSavedDatasetId(createdId);
      setSaveSuccess(true);
    } catch (err: unknown) {
      setSaveError(parseErrorMessage(err, "保存数据集失败"));
    } finally {
      setSaving(false);
    }
  };

  const insertTable = (name: string) => {
    setSql((prev) => {
      const trimmed = prev.trimEnd();
      const q = quoteId(name);
      return trimmed ? `${trimmed}\nFROM ${q} ` : `SELECT * FROM ${q} `;
    });
  };
  const insertColumn = (table: string, column: string) => {
    const fragment = `${quoteId(table)}.${quoteId(column)}`;
    setSql(
      (prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${fragment} `,
    );
  };

  const paginatedData =
    result?.data?.slice(page * rowsPerPage, (page + 1) * rowsPerPage) ?? [];

  /** 把某条历史查询重新加载到编辑器（不自动执行）。 */
  const loadRecentQuery = useCallback((q: string) => {
    setSql(q);
  }, []);

  /** 清空最近查询历史。 */
  const clearRecentQueries = useCallback(() => {
    setRecentQueries([]);
    localStorage.removeItem(RECENT_KEY);
  }, []);

  return {
    databases,
    refreshDatabases,
    databaseId,
    setDatabaseId,
    schemas,
    schema,
    setSchema,
    schemasLoading,
    columnCache,
    failedTables,
    loadingTable,
    tableList,
    refreshSchemaBrowser,
    sql,
    setSql,
    result,
    loading,
    error,
    page,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    saveDialogOpen,
    datasetName,
    setDatasetName,
    saving,
    saveError,
    saveSuccess,
    savedDatasetId,
    sidebarOpen,
    setSidebarOpen,
    ctxMenu,
    setCtxMenu,
    tabs,
    activeTabId,
    newQueryTab,
    closeAllTabs,
    activateQueryTab,
    closeQueryTab,
    allCompletions,
    quoteId,
    paginatedData,
    handleRun,
    handleRunSql,
    recentQueries,
    loadRecentQuery,
    clearRecentQueries,
    handleFormatSql,
    handleOpenSaveDialog,
    handleSaveDataset,
    setSaveDialogOpen,
    fetchTableColumns,
    insertTable,
    insertColumn,
    setLoading,
    setError,
  };
}
