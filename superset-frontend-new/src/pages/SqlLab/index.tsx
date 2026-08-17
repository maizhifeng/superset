import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Alert,
  Typography,
  Button,
  CircularProgress,
  Divider,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Menu,
  MenuItem,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import TableChartIcon from "@mui/icons-material/TableChart";
import StopIcon from "@mui/icons-material/Stop";
import ClearIcon from "@mui/icons-material/Clear";
import HistoryIcon from "@mui/icons-material/History";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import CodeIcon2 from "@mui/icons-material/Code";
import { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { sql as sqlLang } from "@codemirror/lang-sql";
import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import { keywordCompletionSource, StandardSQL } from "@codemirror/lang-sql";
import CodeMirror from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import SqlEditor from "@/SqlLab/components/SqlEditor";
import ShortcutTooltip from "@/components/ShortcutTooltip";
import { useNotificationStore } from "@/store/notificationStore";
import { useShortcutWithHelp } from "@/hooks/useShortcut";
import SchemaBrowser from "./SchemaBrowser";
import ResultsTable from "./ResultsTable";
import SaveDatasetDialog from "./SaveDatasetDialog";
import ResizeHandle from "@/components/ResizeHandle";
import { useSqlLab } from "./useSqlLab";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

const EDITOR_MIN = 120;
const EDITOR_MAX = 560;
const EDITOR_DEFAULT = 220;

export default function SqlLab() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialState = location.state as {
    initialSql?: string;
    initialDatabaseId?: number;
    initialRun?: boolean;
  } | null;
  const initialSql =
    typeof initialState?.initialSql === "string"
      ? initialState.initialSql
      : undefined;
  const initialDatabaseId =
    typeof initialState?.initialDatabaseId === "number"
      ? initialState.initialDatabaseId
      : undefined;
  const initialRun = Boolean(initialState?.initialRun);
  // 编辑区高度，可通过下方拖拽句柄垂直调整。
  const [editorHeight, setEditorHeight] = useState(EDITOR_DEFAULT);
  // 保存为"已保存查询"的对话框状态。
  const [saveQueryOpen, setSaveQueryOpen] = useState(false);
  const [saveQueryLabel, setSaveQueryLabel] = useState("");
  const [saveQuerySaving, setSaveQuerySaving] = useState(false);
  const [saveQueryError, setSaveQueryError] = useState<string | null>(null);
  const [recentMenuAnchor, setRecentMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
  const {
    databases,
    databaseId,
    setDatabaseId,
    schemas,
    schema,
    setSchema,
    schemasLoading,
    columnCache,
    loadingTable,
    tableList,
    refreshSchemaBrowser,
    refreshDatabases,
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
  } = useSqlLab({ initialSql, initialDatabaseId });

  // Ctrl/Cmd+S 打开"保存查询"对话框。
  useShortcutWithHelp(
    ["ctrl+s", "command+s"],
    (e) => {
      e.preventDefault();
      setSaveQueryLabel(sql.trim().slice(0, 40) || "未命名查询");
      setSaveQueryError(null);
      setSaveQueryOpen(true);
    },
    {
      label: "保存查询",
      category: "sql_lab",
      description: "按 ⌘S / Ctrl+S 保存当前 SQL",
    },
  );

  const tableCompletionSource = useCallback(
    (context: {
      state: { sliceDoc: (from: number, to: number) => string };
      pos: number;
    }) => {
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
          border: "1px solid var(--mui-palette-divider)",
          borderRadius: "8px",
          fontFamily:
            "'SF Mono', 'Fira Code', 'Consolas', 'Monaco', 'Menlo', monospace",
          fontSize: "0.8125rem",
        },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": { overflow: "auto" },
        ".cm-gutters": { borderRight: "1px solid var(--mui-palette-divider)" },
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
          { key: "Tab", run: (view) => acceptCompletion(view) },
          {
            key: "Ctrl-Enter",
            run: () => {
              void handleRun();
              return true;
            },
          },
        ]),
      ),
    ],
    [tableCompletionSource, handleRun],
  );

  // "打开并运行"：导航携带 initialRun 时，SQL 就绪后自动执行一次。
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (initialRun && !autoRanRef.current && sql.trim()) {
      autoRanRef.current = true;
      void handleRun();
    }
  }, [initialRun, sql, handleRun]);

  const handleCtxClose = () => setCtxMenu(null);

  // 右键上下文菜单：把表/列名复制到剪贴板，便于在 SQL 中直接粘贴引用。
  const notify = useNotificationStore((s) => s.notify);
  const handleCopyCtx = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify({ severity: "success", message: `已复制 ${text}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
    handleCtxClose();
  };

  // 复制当前标签页的完整 SQL 到剪贴板。
  const handleCopySql = async () => {
    if (!sql.trim()) return;
    try {
      await navigator.clipboard.writeText(sql);
      notify({ severity: "success", message: "已复制当前 SQL" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制当前 SQL 为 Markdown 代码块，便于粘贴到文档 / 聊天。 */
  const handleCopySqlMarkdown = async () => {
    if (!sql.trim()) return;
    try {
      await navigator.clipboard.writeText("```sql\n" + sql + "\n```");
      notify({ severity: "success", message: "已复制 SQL（Markdown）" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 从当前 SQL 中提取涉及的表名并复制（每行一个）。 */
  const handleCopySqlTables = async () => {
    if (!sql.trim()) return;
    const matches = sql.match(/\b(?:from|join)\s+["`]?([\w$-]+(?:\.[\w$-]+)?)/gi) ?? [];
    const tables = Array.from(
      new Set(
        matches.map((m) => {
          const parts = m.split(/\s+/);
          return parts[parts.length - 1].replace(/["`]/g, "");
        }),
      ),
    ).filter(Boolean);
    if (tables.length === 0) {
      notify({ severity: "warning", message: "未在 SQL 中找到数据表" });
      return;
    }
    try {
      await navigator.clipboard.writeText(tables.join("\n"));
      notify({ severity: "success", message: `已复制 ${tables.length} 张表名` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  // 把当前 SQL 保存为"已保存查询"。
  const handleSaveQuery = async () => {
    if (!sql.trim() || saveQuerySaving) return;
    if (!saveQueryLabel.trim()) {
      setSaveQueryError("名称不能为空");
      return;
    }
    setSaveQuerySaving(true);
    setSaveQueryError(null);
    try {
      await api.post("/saved_query/", {
        label: saveQueryLabel.trim(),
        sql,
        db_id: databaseId === "" ? undefined : databaseId,
        schema: schema || undefined,
      });
      notify({ severity: "success", message: "查询已保存" });
      setSaveQueryOpen(false);
    } catch (err: unknown) {
      setSaveQueryError(parseErrorMessage(err, "保存查询失败"));
    } finally {
      setSaveQuerySaving(false);
    }
  };

  // CodeMirror 编辑器 ref，用于读取当前选中的语句。
  const cmRef = useRef<ReactCodeMirrorRef | null>(null);

  const runSelectedStatement = () => {
    const view = cmRef.current?.view;
    if (!view) {
      void handleRunSql(sql);
      return;
    }
    const { from, to } = view.state.selection.main;
    const full = sql;
    // 有选区则运行选区；否则按分号切分出光标所在的语句。
    let statement = "";
    if (from !== to) {
      statement = full.slice(from, to);
    } else {
      const before = full.slice(0, from);
      const after = full.slice(from);
      const start = before.lastIndexOf(";") + 1;
      const endIdx = after.indexOf(";");
      const end = endIdx === -1 ? full.length : from + endIdx;
      statement = full.slice(start, end);
    }
    void handleRunSql(statement.trim());
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 3, pt: 2, flexShrink: 0 }}>
        <SqlEditor
          onRunQuery={() => void handleRun()}
          onRunSelected={runSelectedStatement}
          onStopQuery={() => setLoading(false)}
          onNewTab={newQueryTab}
          onFormatSql={handleFormatSql}
          onPrevTab={() => {}}
          onNextTab={() => {}}
          onPrevHistory={() => {}}
          onClearSql={() => setSql("")}
        />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 1,
            flexWrap: "wrap",
          }}
        >
          {tabs.map((t) => {
            const active = t.id === activeTabId;
            return (
              <Box
                key={t.id}
                onClick={() => activateQueryTab(t.id)}
                onMouseDown={(e) => {
                  if (active) e.stopPropagation();
                }}
                title={t.name}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 1.5,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: active ? "primary.main" : "divider",
                  bgcolor: active ? "action.selected" : "background.paper",
                  color: active ? "primary.main" : "text.secondary",
                  userSelect: "none",
                  "&:hover": active
                    ? {}
                    : { bgcolor: "action.hover", color: "text.primary" },
                }}
              >
                <Box sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}
                </Box>
                <Box
                  component="span"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeQueryTab(t.id);
                  }}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    fontSize: 14,
                    lineHeight: 1,
                    color: active ? "primary.main" : "text.disabled",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                  aria-label="关闭标签"
                >
                  ×
                </Box>
              </Box>
            );
          })}
          <Box
            component="button"
            onClick={newQueryTab}
            sx={{
              ml: 0.5,
              cursor: "pointer",
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: 1.5,
              bgcolor: "transparent",
              px: 1.25,
              py: 0.5,
              fontSize: "0.8125rem",
              color: "text.secondary",
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              "&:hover": { color: "primary.main", borderColor: "primary.main" },
            }}
            aria-label="新建标签页"
          >
            + 新建标签页
          </Box>
          {tabs.length > 1 && (
            <Tooltip title="关闭全部标签页">
              <IconButton
                size="small"
                onClick={closeAllTabs}
                aria-label="关闭全部标签页"
                sx={{ ml: 0.5 }}
              >
                <ClearAllIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      <Box
        sx={{
          display: "flex",
          gap: 0,
          px: 3,
          pb: 3,
          flex: 1,
          minHeight: 0,
        }}
      >
        <SchemaBrowser
          databases={databases}
          databaseId={databaseId}
          schemas={schemas}
          schema={schema}
          schemasLoading={schemasLoading}
          tableList={tableList}
          columnCache={columnCache}
          loadingTable={loadingTable}
          sidebarOpen={sidebarOpen}
          onDatabaseChange={(id) => setDatabaseId(id)}
          onSchemaChange={(s) => setSchema(s)}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onRefresh={() => {
            refreshSchemaBrowser();
            refreshDatabases();
          }}
          onTableExpand={(t) => void fetchTableColumns(t)}
          onTableContextMenu={(e, table) =>
            setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, table })
          }
          onColumnContextMenu={(e, table, column) =>
            setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, table, column })
          }
        />
        <Divider
          orientation="vertical"
          flexItem
          sx={{ mx: 1.5, alignSelf: "stretch" }}
        />
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
            variant="outlined"
            sx={{
              p: 2,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              borderRadius: 2,
              bgcolor: "background.paper",
            }}
          >
            <Box
              sx={{
                borderRadius: 1,
                overflow: "hidden",
                height: editorHeight,
                display: "flex",
                "& > *": { flex: 1, width: "100%" },
              }}
            >
              <CodeMirror
                ref={cmRef}
                value={sql}
                onChange={(value) => setSql(value)}
                extensions={cmExtensions}
                height={`${editorHeight}px`}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  autocompletion: true,
                }}
              />
            </Box>
            <ResizeHandle
              baseHeight={editorHeight}
              minHeight={EDITOR_MIN}
              maxHeight={EDITOR_MAX}
              onResize={setEditorHeight}
              title="拖拽调整编辑区高度"
            />
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
                  onClick={() => void handleRun()}
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
              <Tooltip title="复制当前 SQL">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => void handleCopySql()}
                    disabled={!sql.trim()}
                    sx={{ textTransform: "none" }}
                  >
                    复制 SQL
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="复制为 Markdown 代码块">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => void handleCopySqlMarkdown()}
                    disabled={!sql.trim()}
                    sx={{ textTransform: "none" }}
                  >
                    复制 Markdown
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="从当前 SQL 提取表名并复制">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<TableChartIcon />}
                    onClick={() => void handleCopySqlTables()}
                    disabled={!sql.trim()}
                    sx={{ textTransform: "none" }}
                  >
                    复制表名
                  </Button>
                </span>
              </Tooltip>
              <ShortcutTooltip label="清空当前标签页 SQL" shortcut="Ctrl+Shift+Backspace">
                <Button
                  variant="outlined"
                  size="small"
                  color="inherit"
                  startIcon={<ClearIcon />}
                  onClick={() => setSql("")}
                  disabled={!sql.trim()}
                  sx={{ textTransform: "none" }}
                >
                  清空
                </Button>
              </ShortcutTooltip>
              <ShortcutTooltip label="新建查询标签页" shortcut="Ctrl+T">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={newQueryTab}
                >
                  新建标签页
                </Button>
              </ShortcutTooltip>
              <Tooltip title="最近执行的查询">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    color="inherit"
                    startIcon={<HistoryIcon />}
                    onClick={(e) => setRecentMenuAnchor(e.currentTarget)}
                    disabled={recentQueries.length === 0}
                    sx={{ textTransform: "none" }}
                  >
                    最近查询
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="把当前 SQL 保存到已保存查询列表">
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<SaveIcon />}
                    onClick={() => {
                      setSaveQueryLabel(sql.trim().slice(0, 40) || "未命名查询");
                      setSaveQueryError(null);
                      setSaveQueryOpen(true);
                    }}
                    disabled={!sql.trim()}
                  >
                    保存查询
                  </Button>
                </span>
              </Tooltip>
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
              <ResultsTable
                result={result}
                page={page}
                rowsPerPage={rowsPerPage}
                paginatedData={paginatedData}
                onPageChange={setPage}
                onRowsPerPageChange={setRowsPerPage}
              />
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
                <CodeIcon2 sx={{ fontSize: 48, opacity: 0.3 }} />
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
                    <Typography variant="caption">
                      Ctrl+T — 新建标签页
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
      <Box
        component="div"
        onContextMenu={(e) => e.preventDefault()}
        sx={{ position: "fixed", zIndex: (t) => t.zIndex.modal }}
      >
        {ctxMenu && (
          <Paper
            sx={{
              position: "absolute",
              top: ctxMenu.mouseY,
              left: ctxMenu.mouseX,
              py: 0.5,
              minWidth: 180,
              zIndex: (t) => t.zIndex.modal + 1,
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {ctxMenu.column ? (
              <>
                <Button
                  fullWidth
                  sx={{
                    justifyContent: "flex-start",
                    px: 2,
                    py: 0.75,
                    textTransform: "none",
                    fontSize: "0.8125rem",
                  }}
                  onClick={() => {
                    insertColumn(ctxMenu.table!, ctxMenu.column!);
                    handleCtxClose();
                  }}
                >
                  插入列：{ctxMenu.table}.{ctxMenu.column}
                </Button>
                <Button
                  fullWidth
                  sx={{
                    justifyContent: "flex-start",
                    px: 2,
                    py: 0.75,
                    textTransform: "none",
                    fontSize: "0.8125rem",
                  }}
                  onClick={() =>
                    void handleCopyCtx(
                      `${ctxMenu.table}.${ctxMenu.column}`,
                    )
                  }
                >
                  复制列名
                </Button>
              </>
            ) : ctxMenu.table ? (
              <>
                <Button
                  fullWidth
                  sx={{
                    justifyContent: "flex-start",
                    px: 2,
                    py: 0.75,
                    textTransform: "none",
                    fontSize: "0.8125rem",
                  }}
                  onClick={() => {
                    insertTable(ctxMenu.table!);
                    handleCtxClose();
                  }}
                >
                  插入表：FROM {ctxMenu.table}
                </Button>
                <Button
                  fullWidth
                  sx={{
                    justifyContent: "flex-start",
                    px: 2,
                    py: 0.75,
                    textTransform: "none",
                    fontSize: "0.8125rem",
                  }}
                  onClick={() => void handleCopyCtx(ctxMenu.table!)}
                >
                  复制表名
                </Button>
                <Button
                  fullWidth
                  sx={{
                    justifyContent: "flex-start",
                    px: 2,
                    py: 0.75,
                    textTransform: "none",
                    fontSize: "0.8125rem",
                  }}
                  onClick={() =>
                    void handleCopyCtx(
                      schema
                        ? `SELECT * FROM ${schema}.${ctxMenu.table!};`
                        : `SELECT * FROM ${ctxMenu.table!};`,
                    )
                  }
                >
                  复制 SELECT
                </Button>
                <Button
                  fullWidth
                  sx={{
                    justifyContent: "flex-start",
                    px: 2,
                    py: 0.75,
                    textTransform: "none",
                    fontSize: "0.8125rem",
                  }}
                  onClick={() => {
                    const cols =
                      (schema && columnCache[schema]?.[ctxMenu.table!]) || [];
                    void handleCopyCtx(
                      cols.length ? cols.join(", ") : "（未加载列）",
                    );
                  }}
                >
                  复制全部列名
                </Button>
              </>
            ) : null}
          </Paper>
        )}
      </Box>
      <SaveDatasetDialog
        open={saveDialogOpen}
        datasetName={datasetName}
        saving={saving}
        saveError={saveError}
        saveSuccess={saveSuccess}
        savedDatasetId={savedDatasetId}
        onNameChange={setDatasetName}
        onSave={() => void handleSaveDataset()}
        onOpenCreated={(id) => navigate(`/dataset/edit/${id}`)}
        onCreateChart={(id) => navigate(`/explore?datasource_id=${id}`)}
        onClose={() => setSaveDialogOpen(false)}
      />
      <Menu
        anchorEl={recentMenuAnchor}
        open={Boolean(recentMenuAnchor)}
        onClose={() => setRecentMenuAnchor(null)}
        slotProps={{
          paper: { sx: { maxWidth: 480, maxHeight: 360 } },
        }}
      >
        {recentQueries.map((q, i) => (
          <MenuItem
            key={`${q}-${i}`}
            onClick={() => {
              loadRecentQuery(q);
              setRecentMenuAnchor(null);
            }}
            sx={{ whiteSpace: "pre", fontFamily: "monospace", fontSize: 12 }}
          >
            {q}
          </MenuItem>
        ))}
        {recentQueries.length > 0 && (
          <Divider />
        )}
        {recentQueries.length > 0 && (
          <MenuItem
            onClick={() => {
              clearRecentQueries();
              setRecentMenuAnchor(null);
            }}
          >
            清除历史
          </MenuItem>
        )}
      </Menu>
      <Dialog open={saveQueryOpen} onClose={() => !saveQuerySaving && setSaveQueryOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>保存查询</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="查询名称"
            value={saveQueryLabel}
            onChange={(e) => setSaveQueryLabel(e.target.value)}
            size="small"
            sx={{ mt: 1 }}
          />
          {saveQueryError && (
            <Alert severity="error" sx={{ mt: 1.5, borderRadius: 1.5 }}>
              {saveQueryError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveQueryOpen(false)} disabled={saveQuerySaving}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={saveQuerySaving || !saveQueryLabel.trim()}
            onClick={() => void handleSaveQuery()}
          >
            {saveQuerySaving ? "保存中..." : "保存"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
