import { test, expect, beforeEach, vi } from 'vitest';
import {
  isShortcutFirstUse,
  hasUsedShortcut,
  markShortcutUsed,
} from '@/hooks/useShortcut/firstUseTracker';

const STORAGE_KEY = 'superset_shortcut_first_use';

beforeEach(() => {
  localStorage.clear();
});

test('isShortcutFirstUse returns true on first invocation', () => {
  expect(isShortcutFirstUse('test:first')).toBe(true);
});

test('isShortcutFirstUse returns false on subsequent invocations', () => {
  expect(isShortcutFirstUse('test:second')).toBe(true);
  expect(isShortcutFirstUse('test:second')).toBe(false);
});

test('hasUsedShortcut returns false before shortcut is used', () => {
  expect(hasUsedShortcut('test:unused')).toBe(false);
});

test('hasUsedShortcut returns true after markShortcutUsed', () => {
  markShortcutUsed('test:marked');
  expect(hasUsedShortcut('test:marked')).toBe(true);
});

test('hasUsedShortcut returns true after isShortcutFirstUse', () => {
  isShortcutFirstUse('test:auto');
  expect(hasUsedShortcut('test:auto')).toBe(true);
});

test('multiple shortcuts are tracked independently', () => {
  expect(isShortcutFirstUse('alpha')).toBe(true);
  expect(isShortcutFirstUse('beta')).toBe(true);
  expect(hasUsedShortcut('alpha')).toBe(true);
  expect(hasUsedShortcut('beta')).toBe(true);
  expect(hasUsedShortcut('gamma')).toBe(false);
});

test('persists to localStorage', () => {
  isShortcutFirstUse('persistent');
  const raw = localStorage.getItem(STORAGE_KEY);
  expect(raw).not.toBeNull();
  const parsed = JSON.parse(raw!);
  expect(parsed).toContain('persistent');
});

test('recovers from corrupted localStorage', () => {
  localStorage.setItem(STORAGE_KEY, 'not-valid-json');
  expect(isShortcutFirstUse('recover')).toBe(true);
  expect(hasUsedShortcut('recover')).toBe(true);
});

test('handles localStorage setItem throwing', () => {
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = vi.fn(() => { throw new Error('quota exceeded'); });

  expect(isShortcutFirstUse('quota')).toBe(true);
  expect(hasUsedShortcut('quota')).toBe(false);

  Storage.prototype.setItem = setItem;
});

test('handles localStorage getItem throwing', () => {
  const getItem = Storage.prototype.getItem;
  Storage.prototype.getItem = vi.fn(() => { throw new Error('unavailable'); });

  expect(isShortcutFirstUse('fail')).toBe(true);
  expect(hasUsedShortcut('fail')).toBe(false);

  Storage.prototype.getItem = getItem;
});
