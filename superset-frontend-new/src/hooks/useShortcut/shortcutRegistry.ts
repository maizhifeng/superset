import type { ShortcutEntry, ShortcutCategory } from './constants';

type Listener = (entries: ShortcutEntry[]) => void;

class ShortcutRegistryImpl {
  private entries: ShortcutEntry[] = [];
  private listeners: Set<Listener> = new Set();

  register(entry: ShortcutEntry): () => void {
    this.entries.push(entry);
    this.notify();
    return () => {
      this.entries = this.entries.filter(
        e => e.key !== entry.key || e.label !== entry.label || e.category !== entry.category,
      );
      this.notify();
    };
  }

  getAll(): ShortcutEntry[] {
    return [...this.entries];
  }

  getByCategory(category: ShortcutCategory): ShortcutEntry[] {
    return this.entries.filter(e => e.category === category);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = [...this.entries];
    this.listeners.forEach(fn => fn(snapshot));
  }
}

export const shortcutRegistry = new ShortcutRegistryImpl();
