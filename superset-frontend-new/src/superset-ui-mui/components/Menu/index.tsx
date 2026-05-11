import { forwardRef, type ReactNode } from 'react';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';

export interface MenuItemConfig {
  key: string;
  label: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  icon?: ReactNode;
}

export interface MenuProps {
  items?: MenuItemConfig[];
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onClick?: (key: string) => void;
}

const SupersetMenu = forwardRef<HTMLDivElement, MenuProps>(
  ({ items, open, anchorEl, onClose, onClick }, ref) => (
    <MuiMenu ref={ref} open={open} anchorEl={anchorEl} onClose={onClose}>
      {items?.map(item => (
        <MenuItem
          key={item.key}
          disabled={item.disabled}
          onClick={() => {
            onClick?.(item.key);
            onClose();
          }}
          sx={item.danger ? { color: 'error.main' } : undefined}
        >
          {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
          {item.label}
        </MenuItem>
      ))}
    </MuiMenu>
  ),
);

SupersetMenu.displayName = 'SupersetMenu';

export default SupersetMenu;
