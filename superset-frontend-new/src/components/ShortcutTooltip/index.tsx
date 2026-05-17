import type { ReactNode } from 'react';
import Tooltip from '@mui/material/Tooltip';
import { formatShortcut } from '@/hooks/useShortcut';

interface ShortcutTooltipProps {
  label: string;
  shortcut: string | string[];
  children: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export default function ShortcutTooltip({
  label,
  shortcut,
  children,
  placement = 'top',
}: ShortcutTooltipProps) {
  const keys = Array.isArray(shortcut) ? shortcut : [shortcut];
  const shortcutText = keys.map(k => formatShortcut(k)).join(' / ');

  return (
    <Tooltip title={`${label} (${shortcutText})`} placement={placement}>
      <span>{children}</span>
    </Tooltip>
  );
}
