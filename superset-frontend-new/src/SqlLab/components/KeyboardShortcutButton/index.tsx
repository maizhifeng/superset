import Tooltip from '@mui/material/Tooltip';
import type { ReactNode } from 'react';
import { useShortcut, formatShortcut } from '@/hooks/useShortcut';
import type { ExtendedKeyboardEvent } from 'mousetrap';

interface KeyboardShortcutButtonProps {
  keybind: string | string[];
  label: string;
  tooltip?: string;
  onPress?: () => void;
  children: ReactNode;
  as?: 'button' | 'icon';
  disabled?: boolean;
}

export default function KeyboardShortcutButton({
  keybind,
  label,
  tooltip,
  onPress,
  children,
  disabled,
}: KeyboardShortcutButtonProps) {
  useShortcut(keybind, (event: ExtendedKeyboardEvent) => {
    if (disabled) return;
    event.preventDefault();
    onPress?.();
  });

  const keys = Array.isArray(keybind) ? keybind : [keybind];
  const shortcutText = keys.map(k => formatShortcut(k)).join(' / ');

  const tooltipText = tooltip || `${label} (${shortcutText})`;

  return (
    <Tooltip title={tooltipText}>
      <span>{children}</span>
    </Tooltip>
  );
}
