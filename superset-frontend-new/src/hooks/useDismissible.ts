import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_PREFIX = 'superset_dismiss_';
const listeners = new Map<string, Set<() => void>>();

function getDismissed(key: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === '1';
  } catch {
    return false;
  }
}

function setDismissed(key: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, '1');
  } catch {
  }
}

function subscribe(key: string, callback: () => void) {
  const set = listeners.get(key) ?? new Set();
  set.add(callback);
  listeners.set(key, set);
  return () => { set.delete(callback); };
}

function notify(key: string) {
  listeners.get(key)?.forEach(fn => fn());
}

export function resetDismissible(key: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
  }
  notify(key);
}

export function resetAllOnboarding() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {
  }
  listeners.forEach(set => set.forEach(fn => fn()));
}

function useSelector<V>(key: string, selector: (state: boolean) => V): V {
  return useSyncExternalStore(
    cb => subscribe(key, cb),
    () => selector(getDismissed(key)),
    () => selector(getDismissed(key)),
  );
}

export function useDismissible(key: string): [boolean, () => void] {
  const dismissed = useSelector(key, v => v);

  const dismiss = useCallback(() => {
    setDismissed(key);
    notify(key);
  }, [key]);

  return [dismissed, dismiss];
}
