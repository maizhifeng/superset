import { forwardRef, type ReactNode } from 'react';
import MuiIconButton from '@mui/material/IconButton';
import MuiTooltip from '@mui/material/Tooltip';
import type { IconButtonProps as MuiIconButtonProps } from '@mui/material/IconButton';

export interface IconButtonProps {
  icon: ReactNode;
  tooltip?: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: MuiIconButtonProps['size'];
  color?: MuiIconButtonProps['color'];
  edge?: MuiIconButtonProps['edge'];
}

const SupersetIconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, tooltip, onClick, disabled, size, color, edge }, ref) => {
    const button = (
      <MuiIconButton
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        size={size}
        color={color}
        edge={edge}
      >
        {icon}
      </MuiIconButton>
    );

    if (tooltip) {
      return <MuiTooltip title={tooltip}>{button}</MuiTooltip>;
    }

    return button;
  },
);

SupersetIconButton.displayName = 'SupersetIconButton';

export default SupersetIconButton;
