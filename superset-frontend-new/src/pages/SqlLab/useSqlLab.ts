import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api, { QUERY_TIMEOUT_MS } from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { format as formatSql } from "sql-formatter";
import rison from "rison";
import type { Database, QueryResult, TableMetadata } from "@/types/api";
import type { Completion } from "@codemirror/autocomplete";
import {
  emptyModel,
  tableMetaKey,
  type VisualMode,
  type VisualQueryModel,
} from "./visual/types";
import { stripVisualComment } from "./visual/modelIO";

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

export interface QueryTab {
  id: number;
  name: string;
  sql: string;
  mode: VisualMode;
  /** Present when the tab was created in (or restored to) visual mode. */
  model?: VisualQueryModel;
}

export interface UseSqlLabOptions {
  /** 初始 SQL，如从已保存查询"在 SQL 实验室中打开"时预填到首个标签页。 */
  initialSql?: string;
  /** 初始数据库 id，如从数据库详情"在 SQL 实验室中打开"时预选。 */
  initialDatabaseId?: number;
  /** 初始模式名，与初始 SQL/数据库一起恢复上下文。 */
  initialSchema?: string;
}

export function useSqlLab({
  initialSql,
  initialDatabaseId,
  initialSchema,
}: UseSqlLabOptions = {}) {
  const [databases, setDatabases] = useState<Database[]>([]);
  // 记住上次使用的数据库，便于再次进入 SQL 实验室时延续上下文。
  const [databaseId, setDatabaseId] = useState<number | "">(() => {
    if (initialDatabaseId) return initialDatabaseId;
    const saved = Number(localStorage.getItem(LAST_DB_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : "";
  });
  const [schemas, setSchemas] = useState<string[]>([]);
  // 记住上次选中的模式，便于再次进入时延续上下文。
  const [schema, setSchema] = useState(
    () => initialSchema ?? localStorage.getItem(LAST_SCHEMA_KEY) ?? "",
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

  // 查询标签页：每个标签独立保存 SQL 与编辑模式，切换标签不会丢失编辑内容。
  // 初始化默认给出一个可视化类型的空白查询。
  const [tabs, setTabs] = useState<QueryTab[]>(() => [
    {
      id: 1,
      name: "未命名查询 1",
      sql: initialSql ?? "",
      mode: "visual",
      model: emptyModel(Number(databaseId) || 0, schema),
    },
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const nextTabIdRef = useRef(2);

  // 将当前编辑 SQL 写回活动标签，避免切换时丢失。
  useEffect(() => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, sql } : t)),
    );
  }, [sql, activeTabId]);

  /** 更新活动标签页的任意字段（模式、可视模型等）。 */
  const updateActiveTab = useCallback(
    (patch: Partial<QueryTab>) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, ...patch } : t)),
      );
    },
    [activeTabId],
  );

  /**
   * 新建标签页；mode 缺省时继承当前标签页的类型
   * （点击事件等非法值会被忽略，避免把事件对象当成模式）。
   */
  const newQueryTab = useCallback(
    (mode?: VisualMode) => {
      const id = nextTabIdRef.current++;
      setTabs((prev) => {
        const active = prev.find((t) => t.id === activeTabId);
        const nextMode: VisualMode =
          mode === "sql" || mode === "visual"
            ? mode
            : (active?.mode ?? "visual");
        return [
          ...prev,
          {
            id,
            name: `未命名查询 ${id}`,
            sql: "",
            mode: nextMode,
            model:
              nextMode === "visual"
                ? emptyModel(Number(databaseId) || 0, schema)
                : undefined,
          },
        ];
      });
      setActiveTabId(id);
      setSql("");
      setResult(null);
      setError(null);
      setPage(0);
    },
    [activeTabId, databaseId, schema],
  );

  /** 关闭全部标签页，回到单一空白标签（沿用当前模式）。 */
  const closeAllTabs = useCallback(() => {
    const id = nextTabIdRef.current++;
    setTabs((prev) => {
      const active = prev.find((t) => t.id === activeTabId);
      const mode: VisualMode = active?.mode ?? "visual";
      return [
        {
          id,
          name: "未命名查询 1",
          sql: "",
          mode,
          model:
            mode === "visual"
              ? emptyModel(Number(databaseId) || 0, schema)
              : undefined,
        },
      ];
    });
    setActiveTabId(id);
    setSql("");
    setResult(null);
    setError(null);
    setPage(0);
  }, [activeTabId, databaseId, schema]);

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
          const mode: VisualMode = prev[idx]?.mode ?? "visual";
          next.push({
            id: nid,
            name: `未命名查询 ${nid}`,
            sql: "",
            mode,
            model:
              mode === "visual"
                ? emptyModel(Number(databaseId) || 0, schema)
                : undefined,
          });
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
    [activeTabId, databaseId, schema],
  );

  const quoteId = (id: string) => (/[^a-zA-Z_0-9]/.test(id) ? `"${id}"` : id);

  // 表结构元数据缓存（列类型、主键、外键），供可视化组装器与表浏览器共用。
  const [tableMetas, setTableMetas] = useState<Record<string, TableMetadata>>(
    {},
  );
  const tableMetasRef = useRef(tableMetas);
  tableMetasRef.current = tableMetas;
  const inflightMetaRef = useRef<Map<string, Promise<TableMetadata | null>>>(
    new Map(),
  );

  const fetchTableMetadata = useCallback(
    async (
      dbId: number | "",
      sch: string,
      table: string,
    ): Promise<TableMetadata | null> => {
      if (dbId === "" || !sch || !table) return null;
      const key = tableMetaKey(dbId, sch, table);
      const cached = tableMetasRef.current[key];
      if (cached) return cached;
      const inflight = inflightMetaRef.current.get(key);
      if (inflight) return inflight;
      const promise = api
        .get<TableMetadata>(
          `/database/${dbId}/table/${encodeURIComponent(table)}/${encodeURIComponent(sch)}/`,
        )
        .then((res) => {
          setTableMetas((prev) =>
            prev[key] ? prev : { ...prev, [key]: res.data },
          );
          return res.data;
        })
        .catch(() => null)
        .finally(() => {
          inflightMetaRef.current.delete(key);
        });
      inflightMetaRef.current.set(key, promise);
      return promise;
    },
    [],
  );

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
        setSchema((prev) => (prev && list.includes(prev) ? prev : ""));
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
    let cancelled = false;
    const qs = rison.encode({ schema_name: schema });
    api
      .get<{ result: { value: string; type: string }[] }>(
        `/database/${databaseId}/tables/?q=${qs}`,
      )
      .then((res) => {
        const tables = res.data.result;
        setTableList(tables);
        const CONCURRENCY = 4;
        void (async () => {
          const map: Record<string, string[]> = {};
          const failed: string[] = [];
          for (let i = 0; i < tables.length; i += CONCURRENCY) {
            if (cancelled) return;
            const batch = tables.slice(i, i + CONCURRENCY);
            await Promise.allSettled(
              batch.map(async (t) => {
                const meta = await fetchTableMetadata(
                  databaseId,
                  schema,
                  t.value,
                );
                if (meta) {
                  map[t.value] = meta.columns.map((c) => c.name);
                } else {
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
      })
      .catch(() => {
        if (!cancelled) setTableList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [databaseId, schema, tableRefreshKey, fetchTableMetadata]);

  /** 手动刷新 schema 浏览器（重新拉取表与列元数据）。 */
  const refreshSchemaBrowser = useCallback(() => {
    setTableRefreshKey((k) => k + 1);
  }, []);

  // 任意模式的表列表缓存（键含数据库，供关联表对话框跨模式选择使用）。
  const schemaTableListsRef = useRef<Map<string, string[]>>(new Map());

  const fetchTableListForSchema = useCallback(
    async (sch: string): Promise<string[]> => {
      if (databaseId === "" || !sch) return [];
      const key = `${databaseId}:${sch}`;
      const cached = schemaTableListsRef.current.get(key);
      if (cached) return cached;
      try {
        const qs = rison.encode({ schema_name: sch });
        const res = await api.get<{ result: { value: string }[] }>(
          `/database/${databaseId}/tables/?q=${qs}`,
        );
        const list = (res.data.result ?? []).map((t) => t.value);
        schemaTableListsRef.current.set(key, list);
        return list;
      } catch {
        return [];
      }
    },
    [databaseId],
  );

  const fetchTableColumns = useCallback(
    async (tableName: string) => {
      if (
        !databaseId ||
        !schema ||
        columnCache[schema]?.[tableName] ||
        failedTables.has(tableName)
      )
        return;
      const cachedMeta =
        tableMetasRef.current[tableMetaKey(databaseId, schema, tableName)];
      if (cachedMeta) {
        setColumnCache((prev) => ({
          ...prev,
          [schema]: {
            ...prev[schema],
            [tableName]: cachedMeta.columns.map((c) => c.name),
          },
        }));
        return;
      }
      setLoadingTable(tableName);
      const meta = await fetchTableMetadata(databaseId, schema, tableName);
      if (meta) {
        setColumnCache((prev) => ({
          ...prev,
          [schema]: {
            ...prev[schema],
            [tableName]: meta.columns.map((c) => c.name),
          },
        }));
      } else {
        setColumnCache((prev) => ({
          ...prev,
          [schema]: { ...prev[schema], [tableName]: [] },
        }));
        setFailedTables((prev) => new Set(prev).add(tableName));
      }
      setLoadingTable(null);
    },
    [databaseId, schema, columnCache, failedTables, fetchTableMetadata],
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
      const res = await api.post<QueryResult>(
        "/sqllab/execute/",
        {
          database_id: databaseId,
          sql,
        },
        { timeout: QUERY_TIMEOUT_MS },
      );
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
        const res = await api.post<QueryResult>(
          "/sqllab/execute/",
          {
            database_id: databaseId,
            sql: runSql,
          },
          { timeout: QUERY_TIMEOUT_MS },
        );
        setResult(res.data);
        setRecentQueries((prev) => {
          const next = [runSql, ...prev.filter((q) => q !== runSql)].slice(
            0,
            MAX_RECENT,
          );
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
    const trimmed = stripVisualComment(sql).trim();
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
    // 以实际执行的 SQL 创建数据集；剥离可视化模型注释。
    const datasetSql = stripVisualComment(result?.query?.sql ?? sql);
    try {
      const res = await api.post<{ id?: number; result?: { id?: number } }>(
        "/dataset/",
        {
          database: databaseId,
          table_name: datasetName,
          schema,
          sql: datasetSql,
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
    updateActiveTab,
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
    fetchTableListForSchema,
    tableMetas,
    fetchTableMetadata,
    insertTable,
    insertColumn,
    setLoading,
    setError,
  };
}
