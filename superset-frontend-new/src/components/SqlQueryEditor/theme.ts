import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import type { Theme } from "@mui/material/styles";
import type { ThemeMode } from "@/store/themeStore";
import { monoFontFamily } from "@/theme/typography";

/**
 * CodeMirror theme for SQL surfaces.
 *
 * The editor is a paper surface: warm ink, a terracotta caret and muted
 * punctuation so the query structure reads at a glance. Structural colours come
 * from the MUI palette (so both app themes keep the editor consistent), while
 * tokens carry explicit per-theme values tuned for contrast on the tinted page.
 */

interface SyntaxColors {
  keyword: string;
  typeName: string;
  builtin: string;
  string: string;
  quotedIdentifier: string;
  number: string;
  bool: string;
  nullValue: string;
  comment: string;
  operator: string;
  punctuation: string;
  property: string;
  gutterText: string;
}

// Token colours target at least 4:1 on the paper surface; comments and
// punctuation sit a step lower so identifiers stay dominant.
const PAPER_SYNTAX: SyntaxColors = {
  keyword: "#9b4a1f",
  typeName: "#7a6f60",
  builtin: "#4f7083",
  string: "#3f7a4f",
  quotedIdentifier: "#2f6f5e",
  number: "#9c5316",
  bool: "#8f4722",
  nullValue: "#9a6a2f",
  comment: "#82796c",
  operator: "#746b5d",
  punctuation: "#7f7668",
  property: "#2c2416",
  gutterText: "#847b6d",
};

const NOTION_SYNTAX: SyntaxColors = {
  keyword: "#005bab",
  typeName: "#213183",
  builtin: "#00796b",
  string: "#1a7f37",
  quotedIdentifier: "#0d6f63",
  number: "#b34a00",
  bool: "#005bab",
  nullValue: "#b34a00",
  comment: "#78736c",
  operator: "#6b665f",
  punctuation: "#827d77",
  property: "#111111",
  gutterText: "#827d77",
};

/** Build the CodeMirror extensions (chrome theme + syntax highlighting). */
export function buildSqlEditorExtensions(
  theme: Theme,
  mode: ThemeMode,
): Extension[] {
  const syntax = mode === "notion" ? NOTION_SYNTAX : PAPER_SYNTAX;
  const palette = theme.palette;
  const uiFontFamily =
    theme.typography.fontFamily?.toString() ?? "system-ui, sans-serif";

  // Interaction colours are derived from the palette so a theme swap keeps the
  // caret, selection and bracket highlights in sync automatically.
  const mix = (color: string, percent: number) =>
    `color-mix(in srgb, ${color} ${percent}%, transparent)`;
  const caret = palette.primary.main;
  const activeLine = mix(palette.primary.main, 5.5);
  const selection = mix(palette.primary.main, 16);
  const selectionMatch = mix(palette.warning.main, 22);
  const matchingBracket = mix(palette.primary.main, 14);
  const matchingBracketOutline = mix(palette.primary.main, 45);
  const nonmatchingBracket = mix(palette.error.main, 16);
  const nonmatchingBracketOutline = mix(palette.error.main, 40);
  const foldPlaceholder = mix(palette.primary.main, 10);
  const searchMatch = mix(palette.warning.main, 26);
  const searchMatchSelected = mix(palette.primary.main, 26);

  const editorTheme = EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "transparent",
        color: palette.text.primary,
        fontFamily: monoFontFamily,
        fontSize: "0.8125rem",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": {
        fontFamily: monoFontFamily,
        lineHeight: "1.7",
        overflow: "auto",
      },
      ".cm-content": {
        padding: "14px 0 20px",
        caretColor: caret,
      },
      ".cm-line": { padding: "0 20px 0 12px" },
      ".cm-cursor, .cm-dropCursor": {
        borderLeft: `2px solid ${caret}`,
        marginLeft: "-1px",
      },
      // The base theme draws the focused selection through a descendant chain
      // with five classes of specificity; mirror that shape so the palette
      // value wins instead of CodeMirror's default lavender.
      ".cm-selectionBackground": { backgroundColor: selection },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
        { backgroundColor: selection },
      "::selection": { backgroundColor: selection },
      ".cm-activeLine": { backgroundColor: activeLine },
      ".cm-gutters": {
        backgroundColor: palette.bg.muted,
        color: syntax.gutterText,
        border: "none",
        borderRight: `1px solid ${palette.divider}`,
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 10px 0 16px",
        minWidth: "40px",
        fontSize: "0.75rem",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: palette.primary.dark,
        fontWeight: "600",
      },
      ".cm-foldGutter .cm-gutterElement": {
        color: syntax.gutterText,
        fontSize: "0.6875rem",
        padding: "0 6px 0 2px",
      },
      ".cm-foldGutter .cm-gutterElement:hover": { color: palette.primary.main },
      ".cm-foldPlaceholder": {
        backgroundColor: foldPlaceholder,
        border: "none",
        borderRadius: "4px",
        color: palette.text.secondary,
        padding: "0 6px",
        margin: "0 2px",
      },
      // Bracket highlighting is only styled by the base theme under
      // ``.cm-focused``; keep that specificity in the selector.
      ".cm-matchingBracket": {
        backgroundColor: matchingBracket,
        outline: `1px solid ${matchingBracketOutline}`,
        borderRadius: "2px",
        color: "inherit",
      },
      "&.cm-focused .cm-matchingBracket": {
        backgroundColor: matchingBracket,
        outline: `1px solid ${matchingBracketOutline}`,
        borderRadius: "2px",
        color: "inherit",
      },
      ".cm-nonmatchingBracket": {
        backgroundColor: nonmatchingBracket,
        outline: `1px solid ${nonmatchingBracketOutline}`,
      },
      "&.cm-focused .cm-nonmatchingBracket": {
        backgroundColor: nonmatchingBracket,
        outline: `1px solid ${nonmatchingBracketOutline}`,
      },
      ".cm-selectionMatch": { backgroundColor: selectionMatch },
      ".cm-searchMatch": {
        backgroundColor: searchMatch,
        borderRadius: "2px",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: searchMatchSelected,
      },
      ".cm-placeholder": {
        color: palette.text.disabled,
        fontStyle: "italic",
      },
      ".cm-panels": {
        backgroundColor: palette.surface.variant,
        color: palette.text.secondary,
        fontFamily: uiFontFamily,
        fontSize: "0.75rem",
      },
      ".cm-panels.cm-panels-top": {
        borderBottom: `1px solid ${palette.divider}`,
      },
      ".cm-panel.cm-search": { padding: "8px 12px" },
      ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label":
        {
          fontFamily: uiFontFamily,
          fontSize: "0.75rem",
        },
      ".cm-textfield": {
        border: `1px solid ${palette.divider}`,
        borderRadius: "6px",
        backgroundColor: palette.background.paper,
        padding: "3px 8px",
      },
      ".cm-panel.cm-search .cm-textfield": { borderRadius: "6px" },
      ".cm-panel.cm-search .cm-textfield:focus-visible": {
        borderRadius: "6px",
        outline: "none",
        boxShadow: `0 0 0 2px ${selection}`,
      },
      ".cm-button": {
        border: `1px solid ${palette.divider}`,
        borderRadius: "6px",
        backgroundImage: "none",
        backgroundColor: palette.background.paper,
        padding: "2px 10px",
        color: palette.text.secondary,
      },
      ".cm-tooltip": {
        border: `1px solid ${palette.divider}`,
        borderRadius: "10px",
        backgroundColor: palette.background.paper,
        boxShadow: palette.shadow.popover,
        overflow: "hidden",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul": {
        fontFamily: monoFontFamily,
        fontSize: "0.75rem",
        maxHeight: "260px",
        padding: "4px",
      },
      ".cm-tooltip-autocomplete > ul > li": {
        padding: "4px 8px",
        borderRadius: "6px",
        lineHeight: "1.5",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: palette.primary.container ?? palette.primary.light,
        color: palette.primary.onContainer ?? palette.primary.contrastText,
      },
      ".cm-completionIcon": { opacity: "0.65", marginRight: "8px" },
      ".cm-completionLabel": { fontFamily: monoFontFamily },
      ".cm-completionDetail": {
        color: palette.text.secondary,
        fontStyle: "normal",
        marginLeft: "12px",
        fontSize: "0.6875rem",
      },
      ".cm-scroller::-webkit-scrollbar": { width: "10px", height: "10px" },
      ".cm-scroller::-webkit-scrollbar-track": { background: "transparent" },
      ".cm-scroller::-webkit-scrollbar-thumb": {
        backgroundColor: palette.border.medium,
        borderRadius: "6px",
        border: "2px solid transparent",
        backgroundClip: "content-box",
      },
      ".cm-scroller::-webkit-scrollbar-thumb:hover": {
        backgroundColor: palette.border.strong,
      },
    },
    { dark: false },
  );

  const highlight = HighlightStyle.define(
    [
      {
        tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword],
        color: syntax.keyword,
        fontWeight: "600",
      },
      {
        tag: [t.typeName, t.className, t.namespace],
        color: syntax.typeName,
      },
      {
        tag: [t.standard(t.name), t.standard(t.tagName), t.macroName],
        color: syntax.builtin,
      },
      { tag: [t.string, t.character], color: syntax.string },
      { tag: t.special(t.string), color: syntax.quotedIdentifier },
      { tag: [t.number, t.integer, t.float], color: syntax.number },
      { tag: [t.bool, t.atom], color: syntax.bool },
      { tag: [t.null, t.special(t.name)], color: syntax.nullValue },
      {
        tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
        color: syntax.comment,
        fontStyle: "italic",
      },
      { tag: [t.operator, t.derefOperator], color: syntax.operator },
      {
        tag: [
          t.punctuation,
          t.separator,
          t.paren,
          t.brace,
          t.squareBracket,
          t.bracket,
        ],
        color: syntax.punctuation,
      },
      {
        tag: [t.propertyName, t.attributeName, t.labelName],
        color: syntax.property,
      },
      { tag: [t.name, t.variableName, t.definition(t.name)], color: "inherit" },
      { tag: [t.meta, t.processingInstruction], color: syntax.comment },
    ],
    { themeType: "light" },
  );

  return [editorTheme, syntaxHighlighting(highlight)];
}
