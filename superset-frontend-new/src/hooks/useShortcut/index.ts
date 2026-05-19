import { useEffect, useRef, useCallback } from "react";
import Mousetrap from "mousetrap";
import type { ExtendedKeyboardEvent } from "mousetrap";
import { normalizeKey } from "./constants";
import { shortcutRegistry } from "./shortcutRegistry";
import type { ShortcutEntry, ShortcutCategory } from "./constants";
import { isShortcutFirstUse } from "./firstUseTracker";
import { useNotificationStore } from "@/store/notificationStore";

export { shortcutRegistry } from "./shortcutRegistry";
export { normalizeKey, formatShortcut, OS, KEY_MAP } from "./constants";
export type { ShortcutEntry, ShortcutCategory };

const comboFromKeys = (keys: string | string[]): string[] =>
  (Array.isArray(keys) ? keys : [keys]).map((k) => normalizeKey(k));

const isInputTarget = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
};

Mousetrap.prototype.stopCallback = () => false;

export interface UseShortcutOptions {
  enabled?: boolean;
  allowInInput?: boolean;
}

function useShortcut(
  keybind: string | string[],
  handler: (event: ExtendedKeyboardEvent) => void,
  options?: UseShortcutOptions,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const normalizedKeys = Array.isArray(keybind)
    ? keybind.map((k) => normalizeKey(k))
    : normalizeKey(keybind);

  const wrappedHandler = useCallback(
    (event: ExtendedKeyboardEvent) => {
      if (options?.enabled === false) return;
      if (!options?.allowInInput && isInputTarget(event.target)) return;
      handlerRef.current(event);
    },
    [options?.enabled, options?.allowInInput],
  );

  useEffect(() => {
    const keys = Array.isArray(normalizedKeys)
      ? normalizedKeys
      : [normalizedKeys];
    Mousetrap.bind(keys, wrappedHandler);
    return () => {
      Mousetrap.unbind(keys);
    };
  }, [normalizedKeys, wrappedHandler]);
}

export function useShortcutWithHelp(
  keybind: string | string[],
  handler: (event: ExtendedKeyboardEvent) => void,
  help: {
    label: string;
    category: ShortcutCategory;
    module?: string;
    description?: string;
  },
  options?: UseShortcutOptions,
): void {
  const firstUseId = `${help.category}:${help.label}`;
  const notify = useNotificationStore((s) => s.notify);

  const wrappedHandler = useCallback(
    (event: ExtendedKeyboardEvent) => {
      if (isShortcutFirstUse(firstUseId)) {
        notify({
          severity: "info",
          message: help.description ?? `Shortcut: ${help.label}`,
        });
      }
      handler(event);
    },
    [handler, help.label, help.description, firstUseId, notify],
  );

  useShortcut(keybind, wrappedHandler, options);

  const helpKeys = comboFromKeys(keybind);

  useEffect(() => {
    if (options?.enabled === false) return;
    const unregisters = helpKeys.map((key) =>
      shortcutRegistry.register({
        key,
        label: help.label,
        category: help.category,
        module: help.module,
        description: help.description,
      }),
    );
    return () => {
      unregisters.forEach((u) => u());
    };
  }, [
    helpKeys,
    help.label,
    help.category,
    help.module,
    help.description,
    options?.enabled,
  ]);
}

export { useShortcut };
export default useShortcut;
