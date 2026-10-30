import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useTheme } from "@mui/material/styles";
import CodeIcon from "@mui/icons-material/Code";
import StorageIcon from "@mui/icons-material/Storage";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RestoreIcon from "@mui/icons-material/Restore";
import WrapTextIcon from "@mui/icons-material/WrapText";
import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import {
  Cassandra,
  MSSQL,
  MariaSQL,
  MySQL,
  PLSQL,
  PostgreSQL,
  SQLite,
  StandardSQL,
  keywordCompletionSource,
  sql as sqlLanguage,
} from "@codemirror/lang-sql";
import type { SQLDialect } from "@codemirror/lang-sql";
import {
  acceptCompletion,
  autocompletion,
  completionStatus,
} from "@codemirror/autocomplete";
import { indentLess, indentMore } from "@codemirror/commands";
import { useThemeStore } from "@/store/themeStore";
import { monoFontFamily } from "@/theme/typography";
import { normalizeBackend } from "@/utils/sqlFormat";
import { OS } from "@/hooks/useShortcut";
import { buildSqlEditorExtensions } from "./theme";

/** Superset engine name -> CodeMirror SQL dialect (unknown engines stay ANSI). */
const CODE_MIRROR_DIALECTS: Record<string, SQLDialect> = {
  postgresql: PostgreSQL,
  postgres: PostgreSQL,
  redshift: PostgreSQL,
  timescale: PostgreSQL,
  mysql: MySQL,
  tidb: MySQL,
  mariadb: MariaSQL,
  mssql: MSSQL,
  transactsql: MSSQL,
  sqlserver: MSSQL,
  oracle: PLSQL,
  plsql: PLSQL,
  sqlite: SQLite,
  cassandra: Cassandra,
};

function dialectFor(backend: string | undefined): SQLDialect {
  return CODE_MIRROR_DIALECTS[normalizeBackend(backend)] ?? StandardSQL;
}

/** Small keycap used by the status-bar hints. */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <Box
      component="kbd"
      sx={{
        fontFamily: monoFontFamily,
        fontSize: "0.6875rem",
        lineHeight: 1.55,
        px: 0.5,
        borderRadius: "4px",
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        color: "text.secondary",
        fontWeight: 500,
      }}
    >
      {children}
    </Box>
  );
}

export interface SqlQueryEditorProps {
  /** Current SQL text (controlled). */
  value: string;
  /** Called on every edit with the new text. */
  onChange: (value: string) => void;
  /** Superset engine name; drives syntax highlighting and completion. */
  backend?: string;
  /** Database the dataset reads from, shown as a meta pill. */
  databaseName?: string;
  /** Panel heading, defaults to "SQL 查询". */
  title?: string;
  /** One-line explanation shown under the heading. */
  subtitle?: string;
  /** Shows a "未保存修改" pill in the toolbar. */
  dirty?: boolean;
  /** Placeholder shown while the buffer is empty. */
  placeholder?: string;
  /** Minimum editor body height in px. */
  minHeight?: number;
  /** Format action; the toolbar button is hidden when omitted. */
  onFormat?: () => void;
  /** Copy action; the toolbar button is hidden when omitted. */
  onCopy?: () => void;
  /** Restore action; the toolbar button is hidden when omitted. */
  onReset?: () => void;
  /** Save action wired to Ctrl/Cmd+Enter; the hint is hidden when omitted. */
  onSave?: () => void;
}

// Keyboard hints use the platform's native modifier glyphs.
const FORMAT_HINT = OS === "mac" ? "\u2318\u21e7F" : "Ctrl+Shift+F";
const SAVE_HINT = OS === "mac" ? "\u2318\u23ce" : "Ctrl+Enter";

const numberFormat = new Intl.NumberFormat("zh-CN");

// Localise the built-in CodeMirror search panel; unlisted phrases fall back to
// its English defaults.
const SEARCH_PHRASES: Record<string, string> = {
  Find: "查找",
  Replace: "替换",
  next: "下一个",
  previous: "上一个",
  all: "全部选中",
  "match case": "区分大小写",
  regexp: "正则",
  "by word": "全词匹配",
  replace: "替换",
  "replace all": "全部替换",
  close: "关闭",
  "Go to line": "跳转到行",
  go: "跳转",
  "current match": "当前匹配",
  "on line": "位于第",
  "replaced match on line $": "已替换第 $ 行的匹配",
  "replaced $ matches": "已替换 $ 处匹配",
};

/**
 * SQL editor panel used by the dataset definition page.
 *
 * Wraps CodeMirror in the app's paper surface: a toolbar with the engine meta
 * and formatting actions, a syntax-highlighted editor and a status bar with the
 * caret position and buffer size.
 */
export default function SqlQueryEditor({
  value,
  onChange,
  backend,
  databaseName,
  title = "SQL 查询",
  subtitle,
  dirty = false,
  placeholder = "在此输入 SQL，例如 SELECT * FROM schema.table",
  minHeight = 220,
  onFormat,
  onCopy,
  onReset,
  onSave,
}: SqlQueryEditorProps) {
  const theme = useTheme();
  const themeMode = useThemeStore((s) => s.theme);
  const titleId = useId();
  const [wrapLines, setWrapLines] = useState(true);
  const [stats, setStats] = useState(() => {
    const lines = value.split("\n");
    return {
      line: 1,
      column: 1,
      totalLines: lines.length,
      totalChars: value.length,
    };
  });

  // Shortcuts live inside CodeMirror, so handlers are kept in refs to avoid
  // rebuilding the extension set on every render of the parent page.
  const formatRef = useRef(onFormat);
  formatRef.current = onFormat;
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const dialect = useMemo(() => dialectFor(backend), [backend]);
  const themeExtensions = useMemo(
    () => buildSqlEditorExtensions(theme, themeMode),
    [theme, themeMode],
  );

  const extensions = useMemo<Extension[]>(
    () => [
      ...themeExtensions,
      EditorState.phrases.of(SEARCH_PHRASES),
      // The panel heading names the contenteditable editor for screen readers.
      EditorView.contentAttributes.of({ "aria-labelledby": titleId }),
      sqlLanguage({ dialect }),
      autocompletion({
        activateOnTyping: true,
        override: [keywordCompletionSource(dialect, false)],
      }),
      placeholderExtension(placeholder),
      ...(wrapLines ? [EditorView.lineWrapping] : []),
      Prec.high(
        keymap.of([
          {
            key: "Mod-Shift-f",
            run: () => {
              formatRef.current?.();
              return true;
            },
          },
          {
            key: "Mod-Enter",
            run: () => {
              saveRef.current?.();
              return true;
            },
          },
          {
            key: "Tab",
            // Accept a completion first, otherwise indent like a code editor.
            run: (view) => acceptCompletion(view) || indentMore(view),
          },
          { key: "Shift-Tab", run: (view) => indentLess(view) },
          {
            key: "Escape",
            // Escape leaves the editor so Tab-to-indent never traps focus; the
            // completion popup and search panel keep their own Escape handling.
            run: (view) => {
              if (completionStatus(view.state) === "active") return false;
              if (view.dom.querySelector(".cm-panel.cm-search")) return false;
              view.contentDOM.blur();
              return true;
            },
          },
        ]),
      ),
    ],
    [themeExtensions, dialect, placeholder, wrapLines, titleId],
  );

  const handleUpdate = useCallback((update: ViewUpdate) => {
    if (!update.docChanged && !update.selectionSet) return;
    const head = update.state.selection.main.head;
    const line = update.state.doc.lineAt(head);
    const next = {
      line: line.number,
      column: head - line.from + 1,
      totalLines: update.state.doc.lines,
      totalChars: update.state.doc.length,
    };
    setStats((prev) =>
      prev.line === next.line &&
      prev.column === next.column &&
      prev.totalLines === next.totalLines &&
      prev.totalChars === next.totalChars
        ? prev
        : next,
    );
  }, []);

  const isEmpty = value.trim().length === 0;

  const toolbarButtonSx = {
    height: 28,
    px: 1.25,
    borderRadius: "8px",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "text.secondary",
    "& .MuiButton-startIcon": { mr: 0.625 },
    "& .MuiSvgIcon-root": { fontSize: 15 },
    "&:hover": { bgcolor: "action.hover", color: "text.primary" },
  } as const;

  return (
    <Box
      data-testid="sql-query-editor"
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "12px",
        bgcolor: "surface.main",
        boxShadow: theme.palette.shadow.sm,
        overflow: "hidden",
        transition: "border-color 140ms ease, box-shadow 140ms ease",
        "&:focus-within": {
          borderColor: "primary.main",
          boxShadow: theme.palette.shadow.focus,
        },
      }}
    >
      {/* Toolbar: identity, engine meta and actions. */}
      <Box
        data-testid="sql-editor-toolbar"
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1.5,
          rowGap: 1,
          px: 1.75,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "surface.variant",
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: "9px",
            display: "grid",
            placeItems: "center",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            boxShadow: "0 1px 2px rgba(44,36,22,0.16)",
            flexShrink: 0,
          }}
        >
          <CodeIcon sx={{ fontSize: 17 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            id={titleId}
            variant="subtitle2"
            sx={{ color: "text.primary", lineHeight: 1.3 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: { xs: "none", sm: "block" }, maxWidth: 480 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          {databaseName && (
            <Chip
              size="small"
              icon={<StorageIcon />}
              label={databaseName}
              variant="outlined"
              sx={{
                height: 22,
                borderRadius: "999px",
                borderColor: "divider",
                color: "text.secondary",
                "& .MuiChip-icon": {
                  fontSize: 13,
                  ml: 1,
                  mr: -0.25,
                  color: "text.disabled",
                },
                "& .MuiChip-label": {
                  px: 1,
                  fontSize: "0.6875rem",
                  letterSpacing: "0.01em",
                },
              }}
            />
          )}
          {backend && (
            <Chip
              size="small"
              label={backend}
              sx={{
                height: 22,
                borderRadius: "999px",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                color: "text.secondary",
                fontFamily: monoFontFamily,
                "& .MuiChip-label": {
                  px: 1.25,
                  fontSize: "0.6875rem",
                  letterSpacing: 0,
                },
              }}
            />
          )}
          {dirty && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.625,
                height: 22,
                px: 1,
                borderRadius: "999px",
                border: "1px solid",
                borderColor: "primary.light",
                bgcolor: "primary.container",
                color: "primary.onContainer",
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}
            >
              <Box
                sx={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                }}
              />
              未保存修改
            </Box>
          )}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Tooltip title={wrapLines ? "关闭自动换行" : "开启自动换行"}>
            <IconButton
              size="small"
              aria-label="自动换行"
              onClick={() => setWrapLines((prev) => !prev)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "8px",
                color: wrapLines ? "primary.main" : "text.disabled",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <WrapTextIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          {(onFormat || onCopy || onReset) && (
            <Box
              sx={{
                width: "1px",
                height: 14,
                bgcolor: "divider",
                mx: 0.75,
              }}
            />
          )}
          {onFormat && (
            <Tooltip title={`格式化 SQL (${FORMAT_HINT})`}>
              <span>
                <Button
                  size="small"
                  disableRipple
                  startIcon={<AutoFixHighIcon />}
                  onClick={onFormat}
                  disabled={isEmpty}
                  sx={{
                    ...toolbarButtonSx,
                    color: "primary.main",
                    "&:hover": {
                      bgcolor: "action.hover",
                      color: "primary.dark",
                    },
                  }}
                >
                  格式化
                </Button>
              </span>
            </Tooltip>
          )}
          {onCopy && (
            <Tooltip title="复制当前 SQL">
              <span>
                <Button
                  size="small"
                  disableRipple
                  startIcon={<ContentCopyIcon />}
                  onClick={onCopy}
                  disabled={isEmpty}
                  sx={toolbarButtonSx}
                >
                  复制
                </Button>
              </span>
            </Tooltip>
          )}
          {onReset && (
            <Tooltip title="还原为已保存的 SQL">
              <span>
                <Button
                  size="small"
                  disableRipple
                  startIcon={<RestoreIcon />}
                  onClick={onReset}
                  disabled={!dirty}
                  sx={toolbarButtonSx}
                >
                  还原
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Editor body. */}
      <Box
        sx={{
          flex: 1,
          minHeight,
          display: "flex",
          flexDirection: "column",
          "& .sql-query-editor": {
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          },
          "& .cm-editor": { flex: 1, minHeight: 0, height: "100%" },
        }}
      >
        <CodeMirror
          className="sql-query-editor"
          value={value}
          onChange={onChange}
          onUpdate={handleUpdate}
          autoFocus
          theme="none"
          indentWithTab={false}
          height="100%"
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            indentOnInput: true,
            highlightSelectionMatches: false,
            tabSize: 2,
            syntaxHighlighting: false,
          }}
        />
      </Box>

      {/* Status bar: caret, buffer size and keyboard hints. */}
      <Box
        data-testid="sql-editor-statusbar"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          columnGap: 2,
          rowGap: 0.5,
          px: 1.75,
          py: 0.5,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "bg.muted",
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <Typography variant="caption" color="inherit">
            第 {stats.line} 行 · 第 {stats.column} 列
          </Typography>
          <Box sx={{ width: "1px", height: 10, bgcolor: "divider" }} />
          <Typography variant="caption" color="inherit">
            {numberFormat.format(stats.totalLines)} 行 ·{" "}
            {numberFormat.format(stats.totalChars)} 字符
          </Typography>
        </Box>
        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            alignItems: "center",
            gap: 1.5,
          }}
        >
          {onFormat && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.625 }}>
              <Kbd>{FORMAT_HINT}</Kbd>
              <Typography variant="caption" color="text.secondary">
                格式化
              </Typography>
            </Box>
          )}
          {onSave && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.625 }}>
              <Kbd>{SAVE_HINT}</Kbd>
              <Typography variant="caption" color="text.secondary">
                保存
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
