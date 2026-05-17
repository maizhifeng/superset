import { useShortcutWithHelp } from '@/hooks/useShortcut';
import type { ExtendedKeyboardEvent } from 'mousetrap';

interface SqlEditorProps {
  onRunQuery: () => void;
  onRunSelected: () => void;
  onStopQuery: () => void;
  onNewTab: () => void;
  onFormatSql: () => void;
  onPrevTab: () => void;
  onNextTab: () => void;
  onPrevHistory: () => void;
}

export default function SqlEditor({
  onRunQuery,
  onRunSelected,
  onStopQuery,
  onNewTab,
  onFormatSql,
  onPrevTab,
  onNextTab,
  onPrevHistory,
}: SqlEditorProps) {
  const editorOpts = { allowInInput: true };

  useShortcutWithHelp(
    ['ctrl+enter', 'ctrl+r'],
    (e: ExtendedKeyboardEvent) => { e.preventDefault(); onRunQuery(); },
    { label: 'Run Query', category: 'sql_lab' },
    editorOpts,
  );

  useShortcutWithHelp(
    'ctrl+shift+enter',
    (e: ExtendedKeyboardEvent) => { e.preventDefault(); onRunSelected(); },
    { label: 'Run Selected Statement', category: 'sql_lab' },
    editorOpts,
  );

  useShortcutWithHelp(
    'ctrl+e',
    (e: ExtendedKeyboardEvent) => { e.preventDefault(); onStopQuery(); },
    { label: 'Stop Query', category: 'sql_lab' },
    editorOpts,
  );

  useShortcutWithHelp(
    'ctrl+t',
    (e: ExtendedKeyboardEvent) => { e.preventDefault(); onNewTab(); },
    { label: 'New Query Tab', category: 'sql_lab' },
    editorOpts,
  );

  useShortcutWithHelp(
    'ctrl+shift+f',
    (e: ExtendedKeyboardEvent) => { e.preventDefault(); onFormatSql(); },
    { label: 'Format SQL', category: 'sql_lab' },
    editorOpts,
  );

  useShortcutWithHelp(
    'ctrl+[',
    (e: ExtendedKeyboardEvent) => { e.preventDefault(); onPrevTab(); },
    { label: 'Previous Tab', category: 'sql_lab' },
    editorOpts,
  );

  useShortcutWithHelp(
    'ctrl+]',
    (e: ExtendedKeyboardEvent) => { e.preventDefault(); onNextTab(); },
    { label: 'Next Tab', category: 'sql_lab' },
    editorOpts,
  );

  useShortcutWithHelp(
    'ctrl+p',
    (e: ExtendedKeyboardEvent) => { e.preventDefault(); onPrevHistory(); },
    { label: 'Previous History', category: 'sql_lab' },
    editorOpts,
  );

  return null;
}
