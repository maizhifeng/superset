import { useState, useEffect } from "react";
import { shortcutRegistry } from "@/hooks/useShortcut";
import type { ShortcutEntry } from "@/hooks/useShortcut";

const MAX_HINTS = 8;

const CATEGORY_PRIORITY: Record<string, number> = {
  global: 0,
  navigation: 1,
  dashboard: 2,
  explore: 3,
  sql_lab: 4,
  list_view: 5,
};

function formatKeyForCarousel(key: string): string {
  const display = key.replace(/ /g, "+");
  return display
    .split("+")
    .map((p) => {
      const t = p.toLowerCase();
      if (t === "command" || t === "cmd") return "Cmd";
      if (t === "ctrl") return "Ctrl";
      if (t === "shift") return "Shift";
      if (t === "alt" || t === "option") return "Alt";
      if (t === "enter") return "Enter";
      if (t === "escape" || t === "esc") return "Esc";
      if (t === "tab") return "Tab";
      if (t === "delete" || t === "del") return "Del";
      if (t === "backspace") return "BS";
      if (t === "space") return "Space";
      if (t === "up") return "Up";
      if (t === "down") return "Down";
      if (t === "left") return "Left";
      if (t === "right") return "Right";
      if (t.length === 1) return t.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join("+");
}

function shortenLabel(label: string): string {
  const patterns = [
    /^(Open|Toggle|Show|Hide)\s+/i,
    /^(Enter|Exit)\s+/i,
    /^(Navigate to|Go to)\s+/i,
    /^(Run|Stop|Format)\s+/i,
  ];
  let result = label;
  for (const re of patterns) {
    result = result.replace(re, "");
  }

  result = result.replace(/^Keyboard Shortcuts Help$/, "Shortcuts");

  return result;
}

function entriesToHints(entries: ShortcutEntry[]): string[] {
  const sorted = [...entries].sort(
    (a, b) =>
      (CATEGORY_PRIORITY[a.category] ?? 99) -
      (CATEGORY_PRIORITY[b.category] ?? 99),
  );
  return sorted.slice(0, MAX_HINTS).map((entry) => {
    const displayKey = formatKeyForCarousel(entry.key);
    return `${displayKey} to ${shortenLabel(entry.label)}`;
  });
}

const FALLBACK_HINTS = ["按 Shift+? 查看快捷键"];

export function useRotatingShortcutHints(): string[] {
  const [hints, setHints] = useState<string[]>(() =>
    entriesToHints(shortcutRegistry.getAll()),
  );

  useEffect(() => {
    setHints(entriesToHints(shortcutRegistry.getAll()));
    const unsub = shortcutRegistry.subscribe((all) => {
      setHints(entriesToHints(all));
    });
    return unsub;
  }, []);

  return hints.length > 0 ? hints : FALLBACK_HINTS;
}
