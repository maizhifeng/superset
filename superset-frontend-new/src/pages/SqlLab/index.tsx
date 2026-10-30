import {
  useMemo,
  useCallback,
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  DialogContentText,
  DialogActions,
  TextField,
  IconButton,
  Menu,
  MenuItem,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import StopIcon from "@mui/icons-material/Stop";
import ClearIcon from "@mui/icons-material/Clear";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import HistoryIcon from "@mui/icons-material/History";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import SaveIcon from "@mui/icons-material/Save";
import CodeIcon2 from "@mui/icons-material/Code";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
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
import VisualQueryBuilder from "./visual/components/VisualQueryBuilder";
import type { BuilderContext } from "./visual/components/builderContext";
import { useVisualQuery } from "./visual/useVisualQuery";
import { buildSql } from "./visual/sqlBuilder";
import {
  embedModel,
  extractModel,
  isModelSqlUnmodified,
  stripVisualComment,
} from "./visual/modelIO";
import {
  applyStageView,
  addStage,
  removeStage,
  renameStage,
  setStageSource,
} from "./visual/modelEdits";
import { emptyModel, stageView, type VisualQueryModel } from "./visual/types";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

const EDITOR_MIN = 120;
const EDITOR_MAX = 560;
const EDITOR_DEFAULT = 220;

const MONO_FONT_STACK =
  "'SF Mono', 'Fira Code', 'Consolas', 'Monaco', 'Menlo', monospace";

interface QueryHintCardProps {
  icon: ReactNode;
  title: string;
  hint?: string;
  description: string;
}

/** 结果区空态中的一条快捷键提示（纯说明，不使用伪按钮）。 */
function QueryHintCard({ icon, title, hint, description }: QueryHintCardProps) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        p: 1.25,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        textAlign: "left",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 1,
          bgcolor: "bg.muted",
          color: "primary.main",
          flexShrink: 0,
          mt: 0.125,
          "& svg": { fontSize: 16 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: "text.primary" }}
          >
            {title}
          </Typography>
          {hint && (
            <Box
              component="kbd"
              sx={{
                fontFamily: MONO_FONT_STACK,
                fontSize: "0.625rem",
                lineHeight: 1.6,
                px: 0.5,
                borderRadius: "4px",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "surface.variant",
                color: "text.secondary",
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {hint}
            </Box>
          )}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.25, lineHeight: 1.45 }}
        >
          {description}
        </Typography>
      </Box>
    </Box>
  );
}

export default function SqlLab() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialState = location.state as {
    initialSql?: string;
    initialDatabaseId?: number;
    initialSchema?: string;
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
  const initialSchema =
    typeof initialState?.initialSchema === "string"
      ? initialState.initialSchema
      : undefined;
  const initialRun = Boolean(initialState?.initialRun);
  // 编辑区高度，可通过下方拖拽句柄垂直调整。
  const [editorHeight, setEditorHeight] = useState(EDITOR_DEFAULT);
  const [copyMenuAnchor, setCopyMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
  // 保存为"已保存查询"的对话框状态。
  const [saveQueryOpen, setSaveQueryOpen] = useState(false);
  const [saveQueryLabel, setSaveQueryLabel] = useState("");
  const [saveQuerySaving, setSaveQuerySaving] = useState(false);
  const [saveQueryError, setSaveQueryError] = useState<string | null>(null);
  const [recentMenuAnchor, setRecentMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
  const [newTabMenuAnchor, setNewTabMenuAnchor] = useState<HTMLElement | null>(
    null,
  );

  // 可视化构建器高度：null = 自适应内容高度，分割线默认跟随最下方的 block；
  // 拖拽分割线后固定为像素高度，折叠步骤不再影响下方结果区。
  const [builderHeight, setBuilderHeight] = useState<number | null>(null);
  const builderRef = useRef<HTMLDivElement | null>(null);

  const handleSplitterPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = builderRef.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = el.getBoundingClientRect().height;
    setBuilderHeight(startHeight);
    const clamp = (value: number) =>
      Math.max(160, Math.min(Math.max(240, window.innerHeight - 240), value));
    const onMove = (ev: PointerEvent) => {
      setBuilderHeight(clamp(startHeight + (ev.clientY - startY)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** 双击分割线恢复自适应高度（重新跟随最下方的 block）。 */
  const handleSplitterReset = () => setBuilderHeight(null);
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
    updateActiveTab,
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
    tableMetas,
    fetchTableMetadata,
    fetchTableListForSchema,
    insertTable,
    insertColumn,
    setLoading,
  } = useSqlLab({ initialSql, initialDatabaseId, initialSchema });

  // ---- 可视化组装器接线 ----
  const notify = useNotificationStore((s) => s.notify);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const mode = activeTab?.mode ?? "visual";
  const visualModel = useMemo<VisualQueryModel>(
    () => activeTab?.model ?? emptyModel(Number(databaseId) || 0, schema),
    [activeTab, databaseId, schema],
  );
  const visualBackend = databases.find(
    (d) => d.id === (visualModel.databaseId || databaseId),
  )?.backend;

  const visual = useVisualQuery({
    model: visualModel,
    backend: visualBackend,
    databaseId,
    fetchTableMetadata,
    tableMetas,
  });

  /** 是否至少有一个阶段选择了数据源（用于运行/保存等禁用判断）。 */
  const visualHasSource = visual.stageViews.some((view) => view.table);
  const firstStageTable =
    visualModel.stages[0]?.source.kind === "table"
      ? visualModel.stages[0].source.table
      : "";

  // 每个阶段一个 BuilderContext：内层步骤组件完全复用原有逻辑。
  const stageCtxs = useMemo<BuilderContext[]>(() => {
    const stages = visualModel.stages ?? [];
    return stages.map((stage, index) => {
      const view = visual.stageViews[index] ?? stageView(visualModel, stage);
      return {
        model: view,
        onChange: (next) =>
          updateActiveTab({
            model: applyStageView(visualModel, stage.id, next),
          }),
        backend: visualBackend,
        tableList,
        schemas,
        contextSchema: visualModel.schema,
        columnsForTable: visual.columnsForTable,
        refCategory: (ref) => visual.refCategory(view, ref),
        metaForTable: visual.metaForTable,
        fetchTableMeta: visual.fetchTableMeta,
        fetchTableListForSchema,
        isLoadingMeta: visual.isLoadingMeta,
        metaError: visual.metaError,
        retryMeta: visual.retryMeta,
        dateUnitSupported: visual.dateUnitSupported,
        stageId: stage.id,
        stageName: stage.name,
        stageIndex: index + 1,
        stageCount: stages.length,
        isLastStage: index === stages.length - 1,
        upstreamStages: stages
          .slice(0, index)
          .map((s, i) => ({ id: s.id, name: s.name, index: i + 1 })),
        onSelectUpstream: (sourceId) =>
          updateActiveTab({
            model: setStageSource(visualModel, stage.id, sourceId),
          }),
        sourceStageId:
          stage.source.kind === "stage" ? stage.source.stageId : undefined,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visualModel,
    visual.stageViews,
    visualBackend,
    tableList,
    schemas,
    updateActiveTab,
    visual.columnsForTable,
    visual.refCategory,
    visual.metaForTable,
    visual.fetchTableMeta,
    fetchTableListForSchema,
    visual.isLoadingMeta,
    visual.metaError,
    visual.retryMeta,
    visual.dateUnitSupported,
  ]);

  const handleAddStage = useCallback(() => {
    updateActiveTab({ model: addStage(visualModel) });
  }, [visualModel, updateActiveTab]);

  const handleRemoveStage = useCallback(
    (stageId: string) => {
      const next = removeStage(visualModel, stageId);
      if (
        next === visualModel ||
        next.stages.length === visualModel.stages.length
      ) {
        notify({ severity: "info", message: "该阶段被后续阶段引用，无法删除" });
        return;
      }
      updateActiveTab({ model: next });
    },
    [visualModel, updateActiveTab, notify],
  );

  const handleRenameStage = useCallback(
    (stageId: string, name: string) => {
      updateActiveTab({ model: renameStage(visualModel, stageId, name) });
    },
    [visualModel, updateActiveTab],
  );

  const handleRunVisual = useCallback(() => {
    if (!visualHasSource || visual.blockReason || !visual.generatedSql) return;
    void handleRunSql(visual.generatedSql);
  }, [visualHasSource, visual.blockReason, visual.generatedSql, handleRunSql]);

  // 从已保存查询恢复：SQL 首行带模型注释时自动进入可视化模式。
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!initialSql) return;
    const extracted = extractModel(initialSql);
    if (!extracted) return;
    updateActiveTab({ mode: "visual", model: extracted.model });
    if (extracted.model.databaseId) setDatabaseId(extracted.model.databaseId);
    if (extracted.model.schema) setSchema(extracted.model.schema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换标签页时，让全局数据库/模式跟随该标签的可视模型上下文。
  const syncedTabRef = useRef<number | null>(null);
  useEffect(() => {
    if (syncedTabRef.current === activeTabId) return;
    syncedTabRef.current = activeTabId;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab?.mode === "visual" && tab.model) {
      if (tab.model.databaseId && tab.model.databaseId !== databaseId) {
        setDatabaseId(tab.model.databaseId);
      }
      if (tab.model.schema && tab.model.schema !== schema) {
        setSchema(tab.model.schema);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // 可视模式下未选任何数据源时，数据库/模式变化直接同步进模型上下文。
  useEffect(() => {
    if (mode !== "visual") return;
    const current = activeTab?.model;
    if (!current) return;
    const hasSource = (current.stages ?? []).some(
      (stage) => stage.source.kind === "table" && stage.source.table,
    );
    if (hasSource) return;
    const nextDb = Number(databaseId) || 0;
    if (current.databaseId === nextDb && current.schema === schema) return;
    const stages = (current.stages ?? []).map((stage, index) =>
      index === 0 && stage.source.kind === "table"
        ? { ...stage, source: { ...stage.source, schema } }
        : stage,
    );
    updateActiveTab({
      model: { ...current, databaseId: nextDb, schema, stages },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, databaseId, schema]);

  // 模式切换：V→S 把生成的 SQL 带入编辑器；S→V 仅当 SQL 携带合法模型注释。
  const [switchDialog, setSwitchDialog] = useState<
    { kind: "no-model" } | { kind: "modified"; model: VisualQueryModel } | null
  >(null);
  const [pendingContext, setPendingContext] = useState<
    | { kind: "database"; value: number }
    | { kind: "schema"; value: string }
    | null
  >(null);

  const backendOf = useCallback(
    (id?: number) =>
      databases.find((d) => d.id === (id || databaseId))?.backend,
    [databases, databaseId],
  );

  const applyVisualModel = useCallback(
    (model: VisualQueryModel) => {
      updateActiveTab({ mode: "visual", model });
      if (model.databaseId && model.databaseId !== databaseId) {
        setDatabaseId(model.databaseId);
      }
      if (model.schema && model.schema !== schema) {
        setSchema(model.schema);
      }
    },
    [updateActiveTab, databaseId, schema, setDatabaseId, setSchema],
  );

  const switchToSql = useCallback(() => {
    if (mode !== "visual") return;
    if (visualHasSource) {
      setSql(embedModel(visual.generatedSql, visualModel));
      notify({ severity: "info", message: "已生成 SQL，可继续编辑" });
    }
    updateActiveTab({ mode: "sql" });
  }, [
    mode,
    visualHasSource,
    visualModel,
    visual.generatedSql,
    setSql,
    updateActiveTab,
    notify,
  ]);

  const switchToVisual = useCallback(() => {
    if (mode !== "sql") return;
    // 空白 SQL 直接进入可视化模式，不弹转换提示。
    if (!sql.trim()) {
      updateActiveTab({
        mode: "visual",
        model: activeTab?.model ?? emptyModel(Number(databaseId) || 0, schema),
      });
      return;
    }
    const extracted = extractModel(sql);
    if (!extracted) {
      setSwitchDialog({ kind: "no-model" });
      return;
    }
    const generated = buildSql(
      extracted.model,
      backendOf(extracted.model.databaseId),
    );
    if (!isModelSqlUnmodified(sql, generated)) {
      setSwitchDialog({ kind: "modified", model: extracted.model });
      return;
    }
    applyVisualModel(extracted.model);
  }, [
    mode,
    sql,
    activeTab?.model,
    databaseId,
    schema,
    updateActiveTab,
    backendOf,
    applyVisualModel,
  ]);

  const handleDatabaseChange = useCallback(
    (id: number) => {
      if (mode === "visual" && visualHasSource) {
        setPendingContext({ kind: "database", value: id });
        return;
      }
      setDatabaseId(id);
    },
    [mode, visualHasSource, setDatabaseId],
  );

  const handleSchemaChange = useCallback(
    (nextSchema: string) => {
      if (mode === "visual" && visualHasSource) {
        setPendingContext({ kind: "schema", value: nextSchema });
        return;
      }
      setSchema(nextSchema);
    },
    [mode, visualHasSource, setSchema],
  );

  const confirmContextChange = useCallback(() => {
    if (!pendingContext) return;
    if (pendingContext.kind === "database") {
      setDatabaseId(pendingContext.value);
      updateActiveTab({ model: emptyModel(pendingContext.value, "") });
    } else {
      setSchema(pendingContext.value);
      updateActiveTab({
        model: emptyModel(Number(databaseId) || 0, pendingContext.value),
      });
    }
    setPendingContext(null);
  }, [pendingContext, databaseId, setDatabaseId, setSchema, updateActiveTab]);

  // Ctrl/Cmd+S 打开"保存查询"对话框。
  useShortcutWithHelp(
    ["ctrl+s", "command+s"],
    (e) => {
      e.preventDefault();
      setSaveQueryLabel(
        mode === "visual"
          ? firstStageTable || "未命名查询"
          : sql.trim().slice(0, 40) || "未命名查询",
      );
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

  // "打开并运行"：导航携带 initialRun 时，SQL/可视模型就绪后自动执行一次。
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!initialRun || autoRanRef.current) return;
    if (mode === "visual") {
      if (visualHasSource && !visual.blockReason && visual.generatedSql) {
        autoRanRef.current = true;
        void handleRunSql(visual.generatedSql);
      }
      return;
    }
    if (sql.trim()) {
      autoRanRef.current = true;
      void handleRun();
    }
  }, [
    initialRun,
    mode,
    visualHasSource,
    visual.blockReason,
    visual.generatedSql,
    sql,
    handleRun,
    handleRunSql,
  ]);

  const handleCtxClose = () => setCtxMenu(null);

  // 右键上下文菜单：把表/列名复制到剪贴板，便于在 SQL 中直接粘贴引用。
  const handleCopyCtx = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify({ severity: "success", message: `已复制 ${text}` });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
    handleCtxClose();
  };

  // 复制当前标签页的完整 SQL 到剪贴板（不含可视化模型注释）。
  const handleCopySql = async () => {
    const body = stripVisualComment(sql);
    if (!body.trim()) return;
    try {
      await navigator.clipboard.writeText(body);
      notify({ severity: "success", message: "已复制当前 SQL" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 复制当前 SQL 为 Markdown 代码块，便于粘贴到文档 / 聊天。 */
  const handleCopySqlMarkdown = async () => {
    const body = stripVisualComment(sql);
    if (!body.trim()) return;
    try {
      await navigator.clipboard.writeText("```sql\n" + body + "\n```");
      notify({ severity: "success", message: "已复制 SQL（Markdown）" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  /** 从当前 SQL 中提取涉及的表名并复制（每行一个）。 */
  const handleCopySqlTables = async () => {
    const body = stripVisualComment(sql);
    if (!body.trim()) return;
    const matches =
      body.match(/\b(?:from|join)\s+["`]?([\w$-]+(?:\.[\w$-]+)?)/gi) ?? [];
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
      notify({
        severity: "success",
        message: `已复制 ${tables.length} 张表名`,
      });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  // 把当前 SQL 保存为"已保存查询"；可视模式内嵌模型注释以便重新打开。
  const handleSaveQuery = async () => {
    const sqlToSave =
      mode === "visual" && visualHasSource
        ? embedModel(visual.generatedSql, visualModel)
        : sql;
    if (!sqlToSave.trim() || saveQuerySaving) return;
    if (!saveQueryLabel.trim()) {
      setSaveQueryError("名称不能为空");
      return;
    }
    setSaveQuerySaving(true);
    setSaveQueryError(null);
    try {
      await api.post("/saved_query/", {
        label: saveQueryLabel.trim(),
        sql: sqlToSave,
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

  // 最近查询：带模型注释的自动恢复可视化模式，否则加载为普通 SQL。
  const handleRecentSelect = (q: string) => {
    const extracted = extractModel(q);
    if (extracted) {
      setSql(q);
      updateActiveTab({ mode: "visual", model: extracted.model });
      if (
        extracted.model.databaseId &&
        extracted.model.databaseId !== databaseId
      ) {
        setDatabaseId(extracted.model.databaseId);
      }
      if (extracted.model.schema && extracted.model.schema !== schema) {
        setSchema(extracted.model.schema);
      }
    } else {
      if (mode === "visual") updateActiveTab({ mode: "sql" });
      loadRecentQuery(q);
    }
    setRecentMenuAnchor(null);
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
          onRunQuery={() =>
            mode === "visual" ? handleRunVisual() : void handleRun()
          }
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
                title={`${t.name}（${t.mode === "visual" ? "可视化" : "SQL"}）`}
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
                {t.mode === "visual" ? (
                  <AutoFixHighIcon sx={{ fontSize: 13, flexShrink: 0 }} />
                ) : (
                  <CodeIcon2 sx={{ fontSize: 13, flexShrink: 0 }} />
                )}
                <Box
                  sx={{
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name}
                </Box>
                {active && (
                  <Tooltip
                    title={
                      t.mode === "visual"
                        ? "跳转到 SQL 编辑器"
                        : "切换到可视化组装"
                    }
                  >
                    <IconButton
                      size="small"
                      aria-label={
                        t.mode === "visual"
                          ? "跳转到 SQL 编辑器"
                          : "切换到可视化组装"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (t.mode === "visual") switchToSql();
                        else switchToVisual();
                      }}
                      sx={{
                        p: 0.25,
                        color: "inherit",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      {t.mode === "visual" ? (
                        <ArrowForwardIcon sx={{ fontSize: 14 }} />
                      ) : (
                        <ArrowBackIcon sx={{ fontSize: 14 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
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
            onClick={(e) => setNewTabMenuAnchor(e.currentTarget)}
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
            aria-haspopup="menu"
          >
            + 新建标签页
          </Box>
          <Menu
            anchorEl={newTabMenuAnchor}
            open={Boolean(newTabMenuAnchor)}
            onClose={() => setNewTabMenuAnchor(null)}
          >
            <MenuItem
              onClick={() => {
                newQueryTab("visual");
                setNewTabMenuAnchor(null);
              }}
            >
              <AutoFixHighIcon sx={{ fontSize: 16, mr: 1 }} />
              新建可视化查询
            </MenuItem>
            <MenuItem
              onClick={() => {
                newQueryTab("sql");
                setNewTabMenuAnchor(null);
              }}
            >
              <CodeIcon2 sx={{ fontSize: 16, mr: 1 }} />
              新建 SQL 查询
            </MenuItem>
          </Menu>
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
          {/* 运行/停止/最近查询/保存查询等操作与标签页同一行，右对齐。 */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 1,
              minWidth: 0,
            }}
          >
            <ShortcutTooltip
              label="运行查询"
              shortcut={["Ctrl+Enter", "Ctrl+R"]}
            >
              <span>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() =>
                    mode === "visual" ? handleRunVisual() : void handleRun()
                  }
                  disabled={
                    loading ||
                    databaseId === "" ||
                    (mode === "visual"
                      ? !visualHasSource || visual.blockReason !== null
                      : !sql.trim())
                  }
                  startIcon={
                    loading ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : null
                  }
                >
                  运行
                </Button>
              </span>
            </ShortcutTooltip>
            <ShortcutTooltip label="停止查询" shortcut="Ctrl+E">
              <span>
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
              </span>
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
            <ShortcutTooltip label="保存查询" shortcut="Ctrl+S">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<SaveIcon />}
                  onClick={() => {
                    setSaveQueryLabel(
                      mode === "visual"
                        ? firstStageTable || "未命名查询"
                        : sql.trim().slice(0, 40) || "未命名查询",
                    );
                    setSaveQueryError(null);
                    setSaveQueryOpen(true);
                  }}
                  disabled={mode === "visual" ? !visualHasSource : !sql.trim()}
                >
                  保存查询
                </Button>
              </span>
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
        {mode === "sql" && (
          <>
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
              onDatabaseChange={handleDatabaseChange}
              onSchemaChange={handleSchemaChange}
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
                setCtxMenu({
                  mouseX: e.clientX,
                  mouseY: e.clientY,
                  table,
                  column,
                })
              }
            />
            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: 1.5, alignSelf: "stretch" }}
            />
          </>
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
          {mode === "visual" ? (
            <>
              <Box
                ref={builderRef}
                sx={{
                  flexShrink: 0,
                  // 未拖拽时高度跟随内容（分割线位于最后一个 block 下方）；
                  // 拖拽后固定高度，内部滚动。
                  height: builderHeight != null ? `${builderHeight}px` : "auto",
                  maxHeight:
                    builderHeight != null
                      ? undefined
                      : { xs: "none", md: "min(65vh, 640px)" },
                  // md+ 时由左侧阶段列与右侧 SQL 面板各自滚动，
                  // 因此外层不再作为整体滚动容器。
                  display: { xs: "block", md: "flex" },
                  flexDirection: { md: "column" },
                  minHeight: 0,
                  overflow: { xs: "auto", md: "hidden" },
                }}
              >
                <VisualQueryBuilder
                  stages={visualModel.stages}
                  ctxs={stageCtxs}
                  databaseId={databaseId}
                  schema={schema}
                  databases={databases}
                  schemas={schemas}
                  schemasLoading={schemasLoading}
                  onDatabaseChange={handleDatabaseChange}
                  onSchemaChange={handleSchemaChange}
                  formattedSql={visual.formattedSql}
                  backend={visualBackend}
                  onAddStage={handleAddStage}
                  onRemoveStage={handleRemoveStage}
                  onRenameStage={handleRenameStage}
                />
              </Box>
              {/* 上下容器分割线：拖拽调整高度；默认高度自适应，跟随最下方 block。 */}
              <Box
                role="separator"
                aria-orientation="horizontal"
                title="拖拽调整上下高度，双击恢复自适应"
                onPointerDown={handleSplitterPointerDown}
                onDoubleClick={handleSplitterReset}
                sx={{
                  flexShrink: 0,
                  height: 12,
                  mx: 0.5,
                  display: "flex",
                  alignItems: "center",
                  cursor: "row-resize",
                  userSelect: "none",
                  "&:hover .viz-splitter-bar": {
                    bgcolor: "primary.main",
                    height: "3px",
                  },
                }}
              >
                <Box
                  className="viz-splitter-bar"
                  sx={{
                    width: "100%",
                    height: "2px",
                    bgcolor: "divider",
                    borderRadius: 1,
                    transition: "background-color .12s ease, height .12s ease",
                  }}
                />
              </Box>
            </>
          ) : (
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
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  endIcon={<ArrowDropDownIcon />}
                  onClick={(event) => setCopyMenuAnchor(event.currentTarget)}
                  disabled={!sql.trim()}
                  sx={{ textTransform: "none" }}
                >
                  复制
                </Button>
                <Menu
                  anchorEl={copyMenuAnchor}
                  open={Boolean(copyMenuAnchor)}
                  onClose={() => setCopyMenuAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                  transformOrigin={{ vertical: "top", horizontal: "left" }}
                >
                  <MenuItem
                    onClick={() => {
                      setCopyMenuAnchor(null);
                      void handleCopySql();
                    }}
                  >
                    复制 SQL
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setCopyMenuAnchor(null);
                      void handleCopySqlMarkdown();
                    }}
                  >
                    复制为 Markdown
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setCopyMenuAnchor(null);
                      void handleCopySqlTables();
                    }}
                  >
                    复制 SQL 中的表名
                  </MenuItem>
                </Menu>
                <ShortcutTooltip
                  label="清空当前标签页 SQL"
                  shortcut="Ctrl+Shift+Backspace"
                >
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
              </Box>
            </Paper>
          )}
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
                showSqlToggle={mode === "sql"}
              />
            ) : (
              <Paper
                variant="outlined"
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  display: "flex",
                  borderRadius: 2,
                  borderStyle: "dashed",
                  borderColor: "divider",
                  bgcolor: "surface.variant",
                  px: { xs: 2, md: 4 },
                  py: 2,
                  // 以面板自身高度（而非视口高度）决定空态密度：
                  // 可视化组装器较高时结果区会被压缩，此时逐级收起说明文字，
                  // 避免提示卡片被裁切。
                  containerType: "size",
                }}
              >
                <Box
                  sx={{
                    // 用自动外边距居中：内容高于面板时仍可从顶部滚动，
                    // 不会被 flex 居中裁掉顶部。
                    m: "auto",
                    width: "100%",
                    maxWidth: 720,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    "@container (max-height: 190px)": { gap: 1.5 },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      alignItems: "center",
                      gap: 1.5,
                      textAlign: { xs: "center", sm: "left" },
                    }}
                  >
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: "background.paper",
                        border: "1px solid",
                        borderColor: "divider",
                        color: "primary.main",
                        flexShrink: 0,
                      }}
                    >
                      {mode === "visual" ? (
                        <AutoFixHighIcon sx={{ fontSize: 22 }} />
                      ) : (
                        <CodeIcon2 sx={{ fontSize: 22 }} />
                      )}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 600,
                          color: "text.primary",
                          mb: 0.25,
                          lineHeight: 1.4,
                        }}
                      >
                        {mode === "visual"
                          ? "运行可视化查询以查看结果"
                          : "运行 SQL 以查看结果"}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ lineHeight: 1.5 }}
                      >
                        {mode === "visual"
                          ? "在上方「数据源」选择数据库、模式与数据表，配置关联、字段、筛选与汇总，然后点击运行。"
                          : "从左面板选择数据库和模式，编写 SQL，然后点击运行。"}
                      </Typography>
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      alignItems: "stretch",
                      gap: 1,
                      width: "100%",
                      "@container (max-height: 140px)": { display: "none" },
                    }}
                  >
                    <QueryHintCard
                      icon={<PlayArrowIcon />}
                      title="运行查询"
                      hint="Ctrl+Enter / Ctrl+R"
                      description={
                        mode === "visual"
                          ? "按当前组装配置生成并执行 SQL"
                          : "执行编辑器中的 SQL"
                      }
                    />
                    <QueryHintCard
                      icon={<FormatAlignLeftIcon />}
                      title="格式化 SQL"
                      hint="Ctrl+Shift+F"
                      description={
                        mode === "sql"
                          ? "整理当前 SQL 的缩进与换行"
                          : "切换到 SQL 模式后可用"
                      }
                    />
                    {mode === "visual" ? (
                      <QueryHintCard
                        icon={<ArrowForwardIcon />}
                        title="切换 SQL 模式"
                        description="把生成的 SQL 带到编辑器继续手写"
                      />
                    ) : (
                      <QueryHintCard
                        icon={<SaveIcon />}
                        title="保存为数据集"
                        description="查询返回结果后可保存为数据集"
                      />
                    )}
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{
                      "@container (max-height: 200px)": { display: "none" },
                    }}
                  >
                    Ctrl+T 新建标签页 · Ctrl+S 保存查询
                  </Typography>
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
                    void handleCopyCtx(`${ctxMenu.table}.${ctxMenu.column}`)
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
            onClick={() => handleRecentSelect(q)}
            sx={{ whiteSpace: "pre", fontFamily: "monospace", fontSize: 12 }}
          >
            {q}
          </MenuItem>
        ))}
        {recentQueries.length > 0 && <Divider />}
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
      <Dialog
        open={saveQueryOpen}
        onClose={() => !saveQuerySaving && setSaveQueryOpen(false)}
        maxWidth="xs"
        fullWidth
      >
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
          <Button
            onClick={() => setSaveQueryOpen(false)}
            disabled={saveQuerySaving}
          >
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

      {/* 切换到可视化模式的保护对话框 */}
      <Dialog
        open={switchDialog !== null}
        onClose={() => setSwitchDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {switchDialog?.kind === "modified"
            ? "SQL 已被手工修改"
            : "无法转换为可视化查询"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {switchDialog?.kind === "modified"
              ? "当前 SQL 与可视化模型生成的语句不一致。继续进入可视化模式将丢弃手工修改（模型本身不受影响）。"
              : "当前 SQL 未携带可视化模型注释（手写 SQL 无法自动反解）。可新建一个可视化查询，或继续使用 SQL 编辑器。"}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSwitchDialog(null)}>取消</Button>
          {switchDialog?.kind === "modified" ? (
            <Button
              variant="contained"
              color="warning"
              onClick={() => {
                applyVisualModel(switchDialog.model);
                setSwitchDialog(null);
              }}
            >
              继续（丢弃手改）
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={() => {
                setSql("");
                updateActiveTab({
                  mode: "visual",
                  model: emptyModel(Number(databaseId) || 0, schema),
                });
                setSwitchDialog(null);
              }}
            >
              新建可视化查询
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* 切换数据库/模式导致可视查询重置的确认对话框 */}
      <Dialog
        open={pendingContext !== null}
        onClose={() => setPendingContext(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>重置可视化查询？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingContext?.kind === "database"
              ? "切换数据库会清空当前的可视化查询配置（数据表、关联、字段、筛选与汇总）。"
              : "切换模式会清空当前的可视化查询配置（数据表、关联、字段、筛选与汇总）。"}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingContext(null)}>取消</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={confirmContextChange}
          >
            切换并重置
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
