import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type SetStateAction,
} from "react";
import api, { QUERY_TIMEOUT_MS } from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { formatSqlText } from "@/utils/sqlFormat";
import { useNotificationStore } from "@/store/notificationStore";
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

/**
 * 查询执行失败的提示：权限不足 / 限流给出可操作的明确说明，
 * 其余错误交给共享的错误解析（同样不会只显示 "Forbidden" 之类模糊文本）。
 */
function formatQueryError(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return "当前账号没有执行 SQL 的权限：需要 Admin 角色或 sql_lab 角色，请联系管理员开通";
  }
  if (status === 429) {
    return "查询请求过于频繁（HTTP 429），请稍等片刻后重试";
  }
  return parseErrorMessage(err, "执行查询时发生错误");
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
  const notify = useNotificationStore((state) => state.notify);
  const [databases, setDatabases] = useState<Database[]>([]);
  // 记住上次使用的数据库，便于再次进入 SQL 实验室时延续上下文。
  const [databaseId, setDatabaseId] = useState<number | "">(() => {
    if (initialDatabaseId) return initialDatabaseId;
    const saved = Number(localStorage.getItem(LAST_DB_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : "";
  });
  // 当前数据库引擎：格式化 SQL 时用于选择 sql-formatter 方言，使 SQL 实验室
  // 与数据集编辑页（SqlQueryEditor / formatSqlText）产出一致的格式。
  const selectedDatabaseBackend = databases.find(
    (database) => database.id === databaseId,
  )?.backend;
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
  const [sql, setSqlState] = useState(initialSql ?? "");
  // 编辑器内容的最新值：setSql 包装会同步维护它，使标签切换/执行等边界
  // 能直接拿到最新内容，而不必用 [sql] effect 在每次按键后再写一遍 tabs
  // （那会导致按键产生第二次整页 state 更新/渲染）。
  const sqlRef = useRef(initialSql ?? "");
  const setSql = useCallback((next: SetStateAction<string>) => {
    const value = typeof next === "function" ? next(sqlRef.current) : next;
    sqlRef.current = value;
    setSqlState(value);
  }, []);
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

  /**
   * 把编辑器里最新的 SQL 提交进指定标签页。
   * 标签页的 sql 字段只在「切换/关闭/新建标签、切模式、执行」等边界写入，
   * 不再用 effect 监听 sql 同步：每次按键都写一次 tabs 会让每次输入产生
   * 第二次整页渲染（SqlLab 页面大，这是编辑区卡顿的直接来源之一）。
   */
  const commitSqlToTab = useCallback((tabId: number) => {
    // 注意：必须在 setTabs 之外捕获，updater 可能在本处理函数后续 setSql 之后才执行。
    const latestSql = sqlRef.current;
    setTabs((prev) => {
      const target = prev.find((t) => t.id === tabId);
      if (!target || target.sql === latestSql) return prev;
      return prev.map((t) => (t.id === tabId ? { ...t, sql: latestSql } : t));
    });
  }, []);

  /** 更新活动标签页的任意字段（模式、可视模型等），顺带落盘最新 SQL。 */
  const updateActiveTab = useCallback(
    (patch: Partial<QueryTab>) => {
      const latestSql = sqlRef.current;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, sql: latestSql, ...patch } : t,
        ),
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
      // 先落盘当前标签的编辑内容，切换后仍可切回恢复。
      commitSqlToTab(activeTabId);
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
    [activeTabId, commitSqlToTab, databaseId, schema, setSql],
  );

  /** 关闭全部标签页，回到单一空白标签（沿用当前模式）。 */
  const closeAllTabs = useCallback(() => {
    // 关闭全部会丢弃所有编辑内容，无需落盘；保留原有行为。
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
  }, [activeTabId, databaseId, schema, setSql]);

  const activateQueryTab = useCallback(
    (id: number) => {
      // 切走前先把当前编辑内容落盘，保证切回时能恢复。
      commitSqlToTab(activeTabId);
      setActiveTabId(id);
      if (id !== activeTabId) {
        const target = tabs.find((t) => t.id === id);
        setSql(target?.sql ?? "");
      }
      setResult(null);
      setError(null);
      setPage(0);
    },
    [activeTabId, commitSqlToTab, setSql, tabs],
  );

  const closeQueryTab = useCallback(
    (id: number) => {
      // 关闭其它标签时也要落盘当前编辑内容，否则后续切回会丢失。
      commitSqlToTab(activeTabId);
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
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
    [activeTabId, commitSqlToTab, databaseId, schema, setSql],
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

  // 编辑器列补全的数据源 = columnCache 中已按需加载的列 ∪ tableMetas 中
  // 已缓存的表列（同库同模式）。两者都来自用户实际展开过 / 可视化里用过的表，
  // 不为补全发起任何批量请求（全量预取见下方表列表 effect 的说明）。
  const allCompletions = useMemo<Completion[]>(() => {
    const items: Completion[] = [];
    const columnsByTable = new Map<string, Set<string>>();
    const addTable = (table: string, columns: Iterable<string>) => {
      const existing = columnsByTable.get(table) ?? new Set<string>();
      for (const col of columns) existing.add(col);
      columnsByTable.set(table, existing);
    };

    const cached = schema && columnCache[schema] ? columnCache[schema] : {};
    for (const [table, cols] of Object.entries(cached)) {
      addTable(table, cols);
    }
    if (databaseId !== "" && schema) {
      const prefix = tableMetaKey(databaseId, schema, "");
      for (const [key, meta] of Object.entries(tableMetas)) {
        if (!key.startsWith(prefix)) continue;
        addTable(
          key.slice(prefix.length),
          meta.columns.map((c) => c.name),
        );
      }
    }

    for (const [table, cols] of columnsByTable) {
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
  }, [columnCache, databaseId, schema, tableMetas]);

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

  // 只加载当前模式的表清单；列元数据一律按需加载（展开表 / 可视化组装器）。
  // 这里曾经在表清单返回后对全部表串行预取列元数据（CONCURRENCY=4，每表一次
  // GET /database/{id}/table/{table}/{schema}/）来填充编辑器补全。对
  // inland_sdk_log 这种 1035 张表的模式意味着 1035 个请求（实测约 13 分钟），
  // 且每完成一张表就 setTableMetas 触发一次整页重渲染——不可接受，故删除。
  // 补全改由 columnCache ∪ tableMetas 的已加载数据提供（见 allCompletions）。
  useEffect(() => {
    if (databaseId === "" || !schema) {
      setColumnCache({});
      setFailedTables(new Set());
      setTableList([]);
      return;
    }
    // 模式/库变化或手动刷新后，允许之前失败的表重新重试：失败时
    // fetchTableColumns 会写入 columnCache[schema][table] = []，而 [] 在早退
    // 判断里是 truthy（会被当成"已加载"），所以这里把这些空条目删掉。
    // 只清理空列缓存，已成功加载的列保持不动；真正 0 列的表下次展开时会
    // 重新拉一次 metadata（代价可忽略，行为与旧版整份重建 columnCache 一致）。
    setFailedTables(new Set());
    setColumnCache((prev) => {
      const cached = prev[schema];
      if (!cached) return prev;
      const loaded = Object.entries(cached).filter(
        ([, columns]) => columns.length > 0,
      );
      if (loaded.length === Object.keys(cached).length) return prev;
      return { ...prev, [schema]: Object.fromEntries(loaded) };
    });
    let cancelled = false;
    const qs = rison.encode({ schema_name: schema });
    api
      .get<{ result: { value: string; type: string }[] }>(
        `/database/${databaseId}/tables/?q=${qs}`,
      )
      .then((res) => {
        if (!cancelled) setTableList(res.data.result);
      })
      .catch(() => {
        if (!cancelled) setTableList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [databaseId, schema, tableRefreshKey]);

  /**
   * 手动刷新 schema 浏览器（重新拉取表清单；失败表可重试）。
   * 空列缓存的清理在下方表清单 effect 中统一处理：failedTables 被重置，
   * 且 columnCache 中长度为 0 的条目会被移除（见该 effect 注释）。
   */
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

  // 最新一次执行优先：每次执行自增 runId，响应返回时若已不是最新一次
  //（已被后发起的执行取代）则整份丢弃，避免旧响应覆盖新状态。
  // loading 也只由最新一次执行收尾，防止旧请求提前关闭新请求的加载态。
  const runIdRef = useRef(0);

  /**
   * 执行 SQL 的统一实现。
   * @param runSql 实际执行的 SQL
   * @param recordRecent 是否写入"最近查询"（handleRun 不写，handleRunSql 写）
   */
  const runQuery = useCallback(
    async (runSql: string, recordRecent: boolean) => {
      if (databaseId === "" || !runSql.trim()) return;
      const runId = ++runIdRef.current;
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await api.post<QueryResult>(
          "/sqllab/execute/",
          {
            database_id: databaseId,
            sql: runSql,
            // 携带当前模式：PostgreSQL 系引擎会据此设置 search_path
            //（Hive/Spark 等设置 USE/SET SCHEMA），使未加模式前缀的表名
            // 解析到所选模式，也让 RLS 能对未限定表名生效。
            ...(schema ? { schema } : {}),
          },
          { timeout: QUERY_TIMEOUT_MS },
        );
        // 已有更新的执行发起，过期响应不写 result / error / loading。
        if (runId !== runIdRef.current) return;
        setResult(res.data);
        // 成功与失败互斥：清掉可能残留的旧错误，避免 Alert 与结果表格同屏。
        setError(null);
        if (recordRecent) {
          setRecentQueries((prev) => {
            const next = [runSql, ...prev.filter((q) => q !== runSql)].slice(
              0,
              MAX_RECENT,
            );
            storeRecent(next);
            return next;
          });
        }
      } catch (err: unknown) {
        if (runId !== runIdRef.current) return;
        setError(formatQueryError(err));
        // 成功与失败互斥：失败时清掉可能残留的旧结果。
        setResult(null);
      } finally {
        if (runId === runIdRef.current) setLoading(false);
      }
    },
    [databaseId, schema],
  );

  const handleRun = useCallback(() => {
    // 执行也是"落盘点"：保证标签页保存的是实际编辑的最新 SQL。
    commitSqlToTab(activeTabId);
    return runQuery(sql, false);
  }, [activeTabId, commitSqlToTab, runQuery, sql]);

  /** 运行一段指定的 SQL（用于"运行选中的语句/当前语句"）。 */
  const handleRunSql = useCallback(
    (runSql: string) => {
      commitSqlToTab(activeTabId);
      return runQuery(runSql, true);
    },
    [activeTabId, commitSqlToTab, runQuery],
  );

  /**
   * 格式化编辑器中的 SQL。
   *
   * 与数据集编辑页（SqlQueryEditor 的「格式化」按钮）共用同一套规则：
   * 按当前数据库引擎选择 sql-formatter 方言、关键字大写、2 空格缩进，
   * 保证两个 SQL 编辑入口产出一致的美观格式；解析失败时保留原文并提示。
   */
  const handleFormatSql = useCallback(() => {
    const currentSql = sqlRef.current;
    if (!currentSql.trim()) return;
    try {
      setSql(formatSqlText(currentSql, selectedDatabaseBackend));
    } catch {
      notify({ severity: "error", message: "SQL 解析失败，暂时无法格式化" });
    }
  }, [notify, selectedDatabaseBackend, setSql]);

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

  // 分页切片用 useMemo 缓存：结果表按引用 memo 化，每次 render 都新建数组
  // 会使结果区无效重渲染（大结果集尤其明显）。
  const paginatedData = useMemo(
    () =>
      result?.data?.slice(page * rowsPerPage, (page + 1) * rowsPerPage) ?? [],
    [result, page, rowsPerPage],
  );

  /** 把某条历史查询重新加载到编辑器（不自动执行）。 */
  const loadRecentQuery = useCallback(
    (q: string) => {
      setSql(q);
    },
    [setSql],
  );

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
