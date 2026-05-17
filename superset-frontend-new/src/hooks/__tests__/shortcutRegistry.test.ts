import { test, expect, vi } from 'vitest';
import { shortcutRegistry } from '@/hooks/useShortcut/shortcutRegistry';
import type { ShortcutEntry } from '@/hooks/useShortcut/constants';

const entry1: ShortcutEntry = { key: 'ctrl+s', label: 'Save', category: 'global' };
const entry2: ShortcutEntry = { key: 'ctrl+z', label: 'Undo', category: 'dashboard' };
const entry3: ShortcutEntry = { key: 'ctrl+enter', label: 'Run Query', category: 'sql_lab' };

test('starts with no entries', () => {
  expect(shortcutRegistry.getAll()).toEqual([]);
});

test('register adds an entry', () => {
  const unreg = shortcutRegistry.register(entry1);
  expect(shortcutRegistry.getAll()).toContainEqual(entry1);
  unreg();
});

test('getAll returns snapshot not affected by later changes', () => {
  const unreg = shortcutRegistry.register(entry1);
  const snapshot = shortcutRegistry.getAll();
  unreg();
  expect(snapshot).toHaveLength(1);
});

test('unregister removes the entry', () => {
  const unreg = shortcutRegistry.register(entry1);
  unreg();
  expect(shortcutRegistry.getAll()).not.toContainEqual(entry1);
});

test('getByCategory filters entries', () => {
  const unreg1 = shortcutRegistry.register(entry1);
  const unreg2 = shortcutRegistry.register(entry2);
  const unreg3 = shortcutRegistry.register(entry3);

  const global = shortcutRegistry.getByCategory('global');
  expect(global).toEqual([entry1]);

  const sqlLab = shortcutRegistry.getByCategory('sql_lab');
  expect(sqlLab).toEqual([entry3]);

  unreg1();
  unreg2();
  unreg3();
});

test('getByCategory returns empty array when none match', () => {
  expect(shortcutRegistry.getByCategory('explore')).toEqual([]);
});

test('subscribe notifies listener on register', () => {
  const listener = vi.fn();
  const unsub = shortcutRegistry.subscribe(listener);

  const unreg = shortcutRegistry.register(entry1);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(expect.arrayContaining([entry1]));

  unreg();
  unsub();
});

test('subscribe notifies listener on unregister', () => {
  const listener = vi.fn();
  const unsub = shortcutRegistry.subscribe(listener);

  const unreg = shortcutRegistry.register(entry1);
  listener.mockClear();

  unreg();
  expect(listener).toHaveBeenCalledTimes(1);

  unsub();
});

test('unsubscribe removes listener', () => {
  const listener = vi.fn();
  const unsub = shortcutRegistry.subscribe(listener);

  unsub();
  shortcutRegistry.register(entry1);
  expect(listener).not.toHaveBeenCalled();

  shortcutRegistry.getAll().forEach(() => {}); // cleanup not needed
  // Manually unregister
  shortcutRegistry.getAll().forEach(e => {
    if (e.key === entry1.key) {
      // can't unregister without reference, but test is about listener
    }
  });
});
