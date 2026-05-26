import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Menu as ContextMenu,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import StopIcon from "@mui/icons-material/Stop";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import TableChartIcon from "@mui/icons-material/TableChart";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { useState, useEffect, useCallback, useMemo } from "react";
import rison from "rison";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import api from "@/api";
import { format as formatSql } from "sql-formatter";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { sql as sqlLang } from "@codemirror/lang-sql";
import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { keywordCompletionSource, StandardSQL } from "@codemirror/lang-sql";
import type { Database, QueryResult } from "@/types/api";
import SqlEditor from "@/SqlLab/components/SqlEditor";
import ShortcutTooltip from "@/components/ShortcutTooltip";

export default function SqlLab() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [databaseId, setDatabaseId] = useState<number | "">("");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schema, setSchema] = useState("");
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [columnCache, setColumnCache] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const [failedTables, setFailedTables] = useState<Set<string>>(new Set());
  const [loadingTable, setLoadingTable] = useState<string | null>(null);
  const [tableList, setTableList] = useState<{ value: string; type: string }[]>(
    [],
  );
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
      .then((res) => {
        setDatabases(res.data.result);
      })
      .catch(() => {
        setError("加载数据库失败");
      });
  }, []);

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
        setSchemas(res.data.result);
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
        (async () => {
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
      .catch(() => {
        setTableList([]);
      });
  }, [databaseId, schema]);

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
      setError(
        parseErrorMessage(err, "执行查询时发生错误"),
      );
    } finally {
      setLoading(false);
    }
  }, [databaseId, sql]);

  const noop = useCallback(() => {}, []);

  const handleFormatSql = useCallback(() => {
    try {
      setSql((prev) => formatSql(prev, { language: "sql" }));
    } catch {
      setSql((prev) => prev.trim());
    }
  }, []);

  const handleOpenSaveDialog = () => {
    setDatasetName(
      result?.query?.sql
        ? result.query.sql.split(" ").slice(0, 3).join("_") || "未命名"
        : "未命名",
    );
    setSaveError(null);
    setSaveSuccess(false);
    setSaveDialogOpen(true);
  };

  const handleSaveDataset = async () => {
    if (!datasetName.trim() || databaseId === "") return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await api.post("/dataset/", {
        database: databaseId,
        table_name: datasetName,
        schema,
        sql,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveDialogOpen(false), 1000);
    } catch (err: unknown) {
      setSaveError(parseErrorMessage(err, "保存数据集失败"));
    } finally {
      setSaving(false);
    }
  };

  const [ctxMenu, setCtxMenu] = useState<{
    mouseX: number;
    mouseY: number;
    table?: string;
    column?: string;
  } | null>(null);

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

  const handleCtxClose = () => setCtxMenu(null);

  const tableCompletionSource = useCallback(
    (context: CompletionContext) => {
      const list = allCompletions;
      if (list.length === 0) return null;

      const textBefore = context.state.sliceDoc(
        Math.max(0, context.pos - 100),
        context.pos,
      );

      const dotMatch = textBefore.match(/(\w+)\.(\w*)$/);
      if (dotMatch) {
        const table = dotMatch[1];
        const colPrefix = dotMatch[2].toLowerCase();
        const from =
          dotMatch[2].length > 0
            ? context.pos - dotMatch[2].length
            : context.pos - dotMatch[0].length;
        const matches = list.filter((o) => {
          const dotIdx = o.label.indexOf(".");
          return (
            dotIdx > 0 &&
            o.label.slice(0, dotIdx).toLowerCase() === table.toLowerCase() &&
            o.label
              .slice(dotIdx + 1)
              .toLowerCase()
              .startsWith(colPrefix)
          );
        });
        if (matches.length > 0)
          return { from, options: matches, filter: false };
      }

      const wordMatch = textBefore.match(/(\w+)$/);
      if (!wordMatch) return null;

      const prefix = wordMatch[1].toLowerCase();
      const from = context.pos - wordMatch[1].length;
      const matches = list.filter((o) =>
        o.label.toLowerCase().startsWith(prefix),
      );
      if (matches.length === 0) return null;

      return { from, options: matches, filter: false };
    },
    [allCompletions],
  );

  const cmExtensions = useMemo(
    () => [
      EditorView.theme({
        "&": {
          height: "100%",
          border: "1px solid var(--mui-palette-divider, rgba(0,0,0,0.12))",
          borderRadius: "8px",
          fontFamily:
            "'SF Mono', 'Fira Code', 'Consolas', 'Monaco', 'Menlo', monospace",
          fontSize: "0.8125rem",
        },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": { overflow: "auto" },
        ".cm-gutters": {
          borderRight: "1px solid var(--mui-palette-divider, rgba(0,0,0,0.12))",
        },
        ".cm-gutter": { minWidth: 0 },
      }),
      sqlLang(),
      autocompletion({
        activateOnTyping: true,
        override: [
          keywordCompletionSource(StandardSQL, false),
          tableCompletionSource,
        ],
      }),
      Prec.high(
        keymap.of([
          {
            key: "Tab",
            run: (view) => acceptCompletion(view),
          },
          {
            key: "Ctrl-Enter",
            run: () => {
              handleRun();
              return true;
            },
          },
        ]),
      ),
    ],
    [tableCompletionSource, handleRun],
  );

  const paginatedData =
    result?.data?.slice(page * rowsPerPage, (page + 1) * rowsPerPage) ?? [];

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 3, pt: 3, flexShrink: 0 }}>
        <SqlEditor
          onRunQuery={handleRun}
          onRunSelected={handleRun}
          onStopQuery={() => setLoading(false)}
          onNewTab={() => setSql("")}
          onFormatSql={handleFormatSql}
          onPrevTab={noop}
          onNextTab={noop}
          onPrevHistory={noop}
        />
      </Box>
      <Box
        sx={{ display: "flex", gap: 0, px: 3, pb: 3, flex: 1, minHeight: 0 }}
      >
        {sidebarOpen && (
          <Paper
            sx={{
              width: 260,
              flexShrink: 0,
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              overflow: "hidden",
              mr: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                数据库浏览器
              </Typography>
              <IconButton size="small" onClick={() => setSidebarOpen(false)}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Box>
            <FormControl size="small" fullWidth>
              <InputLabel id="db-label">数据库</InputLabel>
              <Select
                labelId="db-label"
                label="数据库"
                value={databaseId}
                onChange={(e) => setDatabaseId(e.target.value as number)}
              >
                {databases.map((db) => (
                  <MenuItem key={db.id} value={db.id}>
                    {db.database_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {databaseId !== "" && (
              <FormControl size="small" fullWidth>
                <InputLabel id="schema-label">模式</InputLabel>
                <Select
                  labelId="schema-label"
                  label="模式"
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                  disabled={schemasLoading}
                >
                  {schemas.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {schema && (
              <>
                <Divider />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600, px: 0.5 }}
                >
表
                </Typography>
                {tableList.length === 0 ? (
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ px: 0.5 }}
                  >
                    暂无表
                  </Typography>
                ) : (
                  <SimpleTreeView
                    sx={{ flex: 1, overflow: "auto" }}
                    onItemExpansionToggle={(event, itemId, isExpanded) => {
                      if (isExpanded) fetchTableColumns(itemId);
                    }}
                  >
                    {tableList.map((t) => {
                      const cols = columnCache[schema]?.[t.value] ?? [];
                      const isLoading = loadingTable === t.value;
                      return (
                        <TreeItem
                          key={t.value}
                          itemId={t.value}
                          label={
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.75,
                              }}
                            >
                              <TableChartIcon
                                sx={{
                                  fontSize: 15,
                                  color:
                                    t.type === "view"
                                      ? "warning.main"
                                      : "primary.main",
                                }}
                              />
                              <Typography variant="body2">{t.value}</Typography>
                              {isLoading && (
                                <CircularProgress size={12} sx={{ ml: 0.5 }} />
                              )}
                            </Box>
                          }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setCtxMenu({
                              mouseX: e.clientX,
                              mouseY: e.clientY,
                              table: t.value,
                            });
                          }}
                        >
                          {cols.map((col) => (
                            <TreeItem
                              key={col}
                              itemId={`${t.value}.${col}`}
                              label={
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.75,
                                  }}
                                >
                                  <ViewColumnIcon
                                    sx={{
                                      fontSize: 14,
                                      color: "text.secondary",
                                    }}
                                  />
                                  <Typography variant="caption">
                                    {col}
                                  </Typography>
                                </Box>
                              }
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCtxMenu({
                                  mouseX: e.clientX,
                                  mouseY: e.clientY,
                                  table: t.value,
                                  column: col,
                                });
                              }}
                            />
                          ))}
                        </TreeItem>
                      );
                    })}
                  </SimpleTreeView>
                )}
              </>
            )}
          </Paper>
        )}
        {!sidebarOpen && (
          <Paper
            sx={{
              width: 40,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 1,
              mr: 2,
            }}
          >
            <Tooltip title="显示浏览器" placement="right">
              <IconButton size="small" onClick={() => setSidebarOpen(true)}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Paper>
        )}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minHeight: 0,
          }}
        >
          <Paper
            sx={{
              p: 2,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <Box
              sx={{
                borderRadius: 1,
                overflow: "hidden",
                height: 200,
                display: "flex",
                "& > *": { flex: 1, width: "100%" },
              }}
            >
              <CodeMirror
                value={sql}
                onChange={(value) => setSql(value)}
                extensions={cmExtensions}
                height="200px"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  autocompletion: true,
                }}
              />
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                flexWrap: "wrap",
                mt: 1.5,
              }}
            >
              <ShortcutTooltip
                label="运行查询"
                shortcut={["Ctrl+Enter", "Ctrl+R"]}
              >
                <Button
                  variant="contained"
                  onClick={handleRun}
                  disabled={loading || databaseId === "" || !sql.trim()}
                >
                  {loading ? <CircularProgress size={20} /> : "运行"}
                </Button>
              </ShortcutTooltip>
              <ShortcutTooltip label="停止查询" shortcut="Ctrl+E">
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<StopIcon />}
                  onClick={() => setLoading(false)}
                  disabled={!loading}
                >
                  停止
                </Button>
              </ShortcutTooltip>
              <ShortcutTooltip label="格式化 SQL" shortcut="Ctrl+Shift+F">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CodeIcon />}
                  onClick={handleFormatSql}
                  disabled={!sql.trim()}
                >
                  格式化
                </Button>
              </ShortcutTooltip>
              <ShortcutTooltip label="新建查询标签页" shortcut="Ctrl+T">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setSql("")}
                >
                  新建标签页
                </Button>
              </ShortcutTooltip>
              {result && result.data && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<SaveIcon />}
                  onClick={handleOpenSaveDialog}
                >
                  保存为数据集
                </Button>
              )}
            </Box>
          </Paper>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              minHeight: 0,
            }}
          >
            {error && (
              <Alert severity="error" sx={{ flexShrink: 0 }}>
                {error}
              </Alert>
            )}
            {result && result.columns && result.columns.length > 0 ? (
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    flexShrink: 0,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {result.data.length} 行
                    {result.query_id ? ` · query #${result.query_id}` : ""}
                    {result.query?.queryId
                      ? ` · server query #${result.query.queryId}`
                      : ""}
                    {result.query?.state ? ` · ${result.query.state}` : ""}
                  </Typography>
                </Box>
                <TableContainer
                  component={Paper}
                  sx={{ flex: 1, minHeight: 0, mt: 1 }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {result.columns.map((col) => (
                          <TableCell
                            key={col.name}
                            sx={{ fontWeight: 700, fontSize: "0.75rem" }}
                          >
                            {col.name}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedData.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={result.columns.length}
                            sx={{
                              textAlign: "center",
                              py: 4,
                              color: "text.secondary",
                            }}
                          >
                            无数据
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedData.map((row, i) => (
                          <TableRow key={i}>
                            {result.columns.map((col) => (
                              <TableCell
                                key={col.name}
                                sx={{
                                  fontSize: "0.75rem",
                                  maxWidth: 160,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {String(row[col.name] ?? "")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={result.data.length}
                  page={page}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => {
                    setRowsPerPage(parseInt(e.target.value, 10));
                    setPage(0);
                  }}
                  rowsPerPageOptions={[25, 50, 100, 500]}
                  sx={{ flexShrink: 0 }}
                />
              </Box>
            ) : (
              <Paper
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  color: "text.secondary",
                }}
              >
                <CodeIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                <Typography variant="h6" sx={{ fontWeight: 500, opacity: 0.7 }}>
                  SQL 实验室
                </Typography>
                <Box sx={{ textAlign: "center", maxWidth: 320 }}>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    从左面板选择数据库和模式，编写 SQL，然后点击运行。
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.75,
                      fontSize: "0.75rem",
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ fontWeight: 600, mb: 0.5 }}
                    >
                      快捷键
                    </Typography>
                    <Typography variant="caption">
                      Ctrl+Enter / Ctrl+R — 运行查询
                    </Typography>
                    <Typography variant="caption">
                      Ctrl+Shift+F — 格式化 SQL
                    </Typography>
                    <Typography variant="caption">Ctrl+T — 新建标签页</Typography>
                  </Box>
                </Box>
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
      <ContextMenu
        open={ctxMenu !== null}
        onClose={handleCtxClose}
        anchorReference="anchorPosition"
        anchorPosition={
          ctxMenu ? { top: ctxMenu.mouseY, left: ctxMenu.mouseX } : undefined
        }
      >
        {ctxMenu?.column ? (
          <MenuItem
            onClick={() => {
              insertColumn(ctxMenu.table!, ctxMenu.column!);
              handleCtxClose();
            }}
          >
            插入列：{ctxMenu.table}.{ctxMenu.column}
          </MenuItem>
        ) : ctxMenu?.table ? (
          <MenuItem
            onClick={() => {
              insertTable(ctxMenu.table!);
              handleCtxClose();
            }}
          >
            插入表：FROM {ctxMenu.table}
          </MenuItem>
        ) : null}
      </ContextMenu>
      <Dialog
        open={saveDialogOpen}
        onClose={() => !saving && setSaveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>保存为数据集</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {saveSuccess && (
              <Alert severity="success">数据集保存成功</Alert>
            )}
            {saveError && <Alert severity="error">{saveError}</Alert>}
            <TextField
              label="数据集名称"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              fullWidth
              autoFocus
              disabled={saving}
              helperText="这将从当前 SQL 创建虚拟数据集"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)} disabled={saving}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveDataset}
            disabled={saving || !datasetName.trim()}
          >
            {saving ? <CircularProgress size={20} /> : "保存"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
