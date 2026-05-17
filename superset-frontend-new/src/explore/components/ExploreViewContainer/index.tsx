import { useCallback } from 'react';
import { useShortcutWithHelp } from '@/hooks/useShortcut';

interface ExploreViewContainerProps {
  onRunQuery: () => void;
  onSaveChart?: () => void;
  onToggleSqlPane?: () => void;
  onToggleDataPane?: () => void;
  onOpenAdvancedAnalytics?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export default function ExploreViewContainer({
  onRunQuery,
  onSaveChart,
  onToggleSqlPane,
  onToggleDataPane,
  onOpenAdvancedAnalytics,
  onUndo,
  onRedo,
}: ExploreViewContainerProps) {
  const noop = useCallback(() => {}, []);
  const modOpts = { allowInInput: true };

  useShortcutWithHelp(
    'ctrl+enter',
    (e) => { e.preventDefault(); onRunQuery(); },
    { label: 'Run Query', category: 'explore' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+s',
    (e) => { e.preventDefault(); (onSaveChart ?? noop)(); },
    { label: 'Save Chart', category: 'explore' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+`',
    (e) => { e.preventDefault(); (onToggleSqlPane ?? noop)(); },
    { label: 'Toggle SQL Pane', category: 'explore' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+d',
    (e) => { e.preventDefault(); (onToggleDataPane ?? noop)(); },
    { label: 'Toggle Data Pane', category: 'explore' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+shift+a',
    (e) => { e.preventDefault(); (onOpenAdvancedAnalytics ?? noop)(); },
    { label: 'Open Advanced Analytics', category: 'explore' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+z',
    (e) => { e.preventDefault(); (onUndo ?? noop)(); },
    { label: 'Undo', category: 'explore' },
    modOpts,
  );

  useShortcutWithHelp(
    'ctrl+y',
    (e) => { e.preventDefault(); (onRedo ?? noop)(); },
    { label: 'Redo', category: 'explore' },
    modOpts,
  );

  return null;
}
