import { forwardRef, useState } from 'react';
import Button from '@mui/material/Button';
import MuiMenu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

export interface DropdownButtonItem {
  key: string;
  label: string;
  onClick?: () => void;
}

export interface DropdownButtonProps {
  label?: string;
  menu?: DropdownButtonItem[];
  variant?: 'text' | 'outlined' | 'contained';
}

const SupersetDropdownButton = forwardRef<HTMLDivElement, DropdownButtonProps>(
  ({ label, menu, variant }, ref) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
      setAnchorEl(null);
    };

    return (
      <div ref={ref}>
        <Button
          variant={variant ?? 'text'}
          onClick={handleClick}
          endIcon={<ArrowDropDownIcon />}
        >
          {label}
        </Button>
        <MuiMenu anchorEl={anchorEl} open={open} onClose={handleClose}>
          {menu?.map(item => (
            <MenuItem
              key={item.key}
              onClick={() => {
                item.onClick?.();
                handleClose();
              }}
            >
              {item.label}
            </MenuItem>
          ))}
        </MuiMenu>
      </div>
    );
  },
);

SupersetDropdownButton.displayName = 'SupersetDropdownButton';

export default SupersetDropdownButton;
