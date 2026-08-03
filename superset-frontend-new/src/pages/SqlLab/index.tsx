import { useMemo, useCallback } from "react";
import {
  Box,
  Paper,
  Alert,
  Typography,
  Button,
  CircularProgress,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import StopIcon from "@mui/icons-material/Stop";
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
import SqlEditor from "@/SqlLab/components/SqlEditor";
import ShortcutTooltip from "@/components/ShortcutTooltip";
import SchemaBrowser from "./SchemaBrowser";
import ResultsTable from "./ResultsTable";
import SaveDatasetDialog from "./SaveDatasetDialog";
import { useSqlLab } from "./useSqlLab";

export default function SqlLab() {
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
    sidebarOpen,
    setSidebarOpen,
    ctxMenu,
    setCtxMenu,
    allCompletions,
    paginatedData,
    handleRun,
    handleFormatSql,
    handleOpenSaveDialog,
    handleSaveDataset,
    setSaveDialogOpen,
    fetchTableColumns,
    insertTable,
    insertColumn,
    setLoading,
  } = useSqlLab();

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

  const handleCtxClose = () => setCtxMenu(null);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 3, pt: 3, flexShrink: 0 }}>
        <SqlEditor
          onRunQuery={() => void handleRun()}
          onRunSelected={() => void handleRun()}
          onStopQuery={() => setLoading(false)}
          onNewTab={() => setSql("")}
          onFormatSql={handleFormatSql}
          onPrevTab={() => {}}
          onNextTab={() => {}}
          onPrevHistory={() => {}}
        />
      </Box>
      <Box
        sx={{ display: "flex", gap: 0, px: 3, pb: 3, flex: 1, minHeight: 0 }}
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
          onTableExpand={(t) => void fetchTableColumns(t)}
          onTableContextMenu={(e, table) =>
            setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, table })
          }
          onColumnContextMenu={(e, table, column) =>
            setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, table, column })
          }
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
            ) : ctxMenu.table ? (
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
        onNameChange={setDatasetName}
        onSave={() => void handleSaveDataset()}
        onClose={() => setSaveDialogOpen(false)}
      />
    </Box>
  );
}
