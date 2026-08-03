export type ShortcutCategory =
  "global" | "navigation" | "sql_lab" | "explore" | "dashboard" | "list_view";

export interface ShortcutEntry {
  key: string;
  label: string;
  category: ShortcutCategory;
  module?: string;
  description?: string;
}

export const KEY_MAP: Record<string, string> = {
  mod: isMac() ? "command" : "ctrl",
  ctrlOrCmd: isMac() ? "command" : "ctrl",
  altOrOpt: isMac() ? "alt" : "alt",
};

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? "");
}

export function normalizeKey(key: string): string {
  if (isMac()) {
    return key.replace(/\bCtrl\b/gi, "command").replace(/\bCmd\b/gi, "command");
  }
  return key.replace(/\bcommand\b/gi, "ctrl").replace(/\bCmd\b/gi, "ctrl");
}

export function formatShortcut(key: string): string {
  const osKey = normalizeKey(key);
  const separator = osKey.includes("+") ? "+" : " ";
  const parts = osKey
    .split(separator)
    .filter(Boolean)
    .map((p) => {
      const t = p.trim().toLowerCase();
      if (t === "command" || t === "cmd") return "\u2318";
      if (t === "ctrl") return "Ctrl";
      if (t === "shift") return "\u21E7";
      if (t === "alt" || t === "option") return "\u2325";
      if (t === "enter") return "Enter";
      if (t === "escape" || t === "esc") return "Esc";
      if (t === "tab") return "Tab";
      if (t === "up") return "\u2191";
      if (t === "down") return "\u2193";
      if (t === "left") return "\u2190";
      if (t === "right") return "\u2192";
      if (t === "delete" || t === "del") return "Del";
      if (t === "backspace") return "BS";
      if (t === "space") return "Space";
      return p;
    });
  return parts.join("+");
}

export const OS = isMac() ? "mac" : "windows";
