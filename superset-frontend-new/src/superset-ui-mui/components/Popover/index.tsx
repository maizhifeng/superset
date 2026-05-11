import { forwardRef, type ReactNode } from 'react';
import MuiPopover, { PopoverProps as MuiPopoverProps } from '@mui/material/Popover';

type PopoverPlacement = 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end' | 'left' | 'left-start' | 'left-end' | 'right' | 'right-start' | 'right-end';

const placementToAnchorOrigin: Record<PopoverPlacement, NonNullable<MuiPopoverProps['anchorOrigin']>> = {
  'top': { vertical: 'top', horizontal: 'center' },
  'top-start': { vertical: 'top', horizontal: 'left' },
  'top-end': { vertical: 'top', horizontal: 'right' },
  'bottom': { vertical: 'bottom', horizontal: 'center' },
  'bottom-start': { vertical: 'bottom', horizontal: 'left' },
  'bottom-end': { vertical: 'bottom', horizontal: 'right' },
  'left': { vertical: 'center', horizontal: 'left' },
  'left-start': { vertical: 'top', horizontal: 'left' },
  'left-end': { vertical: 'bottom', horizontal: 'left' },
  'right': { vertical: 'center', horizontal: 'right' },
  'right-start': { vertical: 'top', horizontal: 'right' },
  'right-end': { vertical: 'bottom', horizontal: 'right' },
};

export interface PopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children?: ReactNode;
  placement?: PopoverPlacement;
}

const SupersetPopover = forwardRef<HTMLDivElement, PopoverProps>(
  ({ open, anchorEl, onClose, children, placement = 'bottom' }, ref) => {
    const anchorOrigin = placementToAnchorOrigin[placement];

    return (
      <MuiPopover
        ref={ref}
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={anchorOrigin}
      >
        {children}
      </MuiPopover>
    );
  },
);

SupersetPopover.displayName = 'SupersetPopover';

export default SupersetPopover;
