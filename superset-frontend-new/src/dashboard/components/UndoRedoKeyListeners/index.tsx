import { useCallback } from 'react';
import { useShortcutWithHelp } from '@/hooks/useShortcut';

interface UndoRedoKeyListenersProps {
  onUndo: () => void;
  onRedo: () => void;
  onSave?: () => void;
  onDiscard?: () => void;
  onToggleFilterBar?: () => void;
  onToggleFullScreen?: () => void;
  onEnterEditMode?: () => void;
}

export default function UndoRedoKeyListeners({
  onUndo,
  onRedo,
  onSave,
  onDiscard,
  onToggleFilterBar,
  onToggleFullScreen,
  onEnterEditMode,
}: UndoRedoKeyListenersProps) {
  const noop = useCallback(() => {}, []);
  const modOpts = { allowInInput: true };

  useShortcutWithHelp(
    'ctrl+z',
    (e) => { e.preventDefault(); onUndo(); },
    { label: 'Undo', category: 'dashboard' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+y',
    (e) => { e.preventDefault(); onRedo(); },
    { label: 'Redo', category: 'dashboard' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+e',
    (e) => { e.preventDefault(); (onEnterEditMode ?? noop)(); },
    { label: 'Enter Edit Mode', category: 'dashboard' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+s',
    (e) => { e.preventDefault(); (onSave ?? noop)(); },
    { label: 'Save Dashboard', category: 'dashboard' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+shift+z',
    (e) => { e.preventDefault(); (onDiscard ?? noop)(); },
    { label: 'Discard Changes', category: 'dashboard' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+f',
    (e) => { e.preventDefault(); (onToggleFilterBar ?? noop)(); },
    { label: 'Toggle Filter Bar', category: 'dashboard' },
    modOpts,
  );

  useShortcutWithHelp(
    'f',
    (e) => { e.preventDefault(); (onToggleFullScreen ?? noop)(); },
    { label: 'Toggle Full Screen', category: 'dashboard' },
  );

  return null;
}
