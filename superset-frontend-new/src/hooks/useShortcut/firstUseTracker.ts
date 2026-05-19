const STORAGE_KEY = "superset_shortcut_first_use";

function getUsedShortcuts(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persistUsedShortcuts(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* localStorage unavailable */
  }
}

export function isShortcutFirstUse(shortcutKey: string): boolean {
  const used = getUsedShortcuts();
  if (used.has(shortcutKey)) return false;
  used.add(shortcutKey);
  persistUsedShortcuts(used);
  return true;
}

export function hasUsedShortcut(shortcutKey: string): boolean {
  return getUsedShortcuts().has(shortcutKey);
}

export function markShortcutUsed(shortcutKey: string): void {
  const used = getUsedShortcuts();
  used.add(shortcutKey);
  persistUsedShortcuts(used);
}
