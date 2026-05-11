import {
  forwardRef,
  useState,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';

export interface DropdownMenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface DropdownMenu {
  items: DropdownMenuItem[];
}

export interface DropdownProps {
  menu: DropdownMenu;
  children: ReactElement;
  disabled?: boolean;
}

const SupersetDropdown = forwardRef<HTMLDivElement, DropdownProps>(
  ({ menu, children, disabled }, ref) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      if (!disabled) {
        setAnchorEl(event.currentTarget);
      }
    };

    const handleClose = () => {
      setAnchorEl(null);
    };

    const trigger = cloneElement(children, {
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        children.props.onClick?.(event);
        handleClick(event);
      },
    });

    return (
      <div ref={ref}>
        {trigger}
        <MuiMenu anchorEl={anchorEl} open={open} onClose={handleClose}>
          {menu.items.map(item => (
            <MenuItem
              key={item.key}
              disabled={item.disabled}
              onClick={() => {
                item.onClick?.();
                handleClose();
              }}
              sx={item.danger ? { color: 'error.main' } : undefined}
            >
              {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
              {item.label}
            </MenuItem>
          ))}
        </MuiMenu>
      </div>
    );
  },
);

SupersetDropdown.displayName = 'SupersetDropdown';

export default SupersetDropdown;
