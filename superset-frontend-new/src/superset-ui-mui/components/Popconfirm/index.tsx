import { forwardRef, useState, type ReactElement, type ReactNode } from 'react';
import MuiPopover from '@mui/material/Popover';
import MuiBox from '@mui/material/Box';
import MuiTypography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import MuiClickAwayListener from '@mui/material/ClickAwayListener';

export interface PopconfirmProps {
  title?: ReactNode;
  description?: ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
  children: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const SupersetPopconfirm = forwardRef<HTMLDivElement, PopconfirmProps>(
  (
    {
      title,
      description,
      onConfirm,
      onCancel,
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      children,
      open: controlledOpen,
      onOpenChange,
    },
    ref,
  ) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const isOpen = isControlled ? controlledOpen : internalOpen;
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const setOpen = (value: boolean) => {
      if (!isControlled) {
        setInternalOpen(value);
      }
      onOpenChange?.(value);
    };

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
      setOpen(true);
    };

    const handleConfirm = () => {
      setOpen(false);
      onConfirm?.();
    };

    const handleCancel = () => {
      setOpen(false);
      onCancel?.();
    };

    return (
      <MuiClickAwayListener onClickAway={() => setOpen(false)}>
        <MuiBox ref={ref} sx={{ display: 'inline-block' }}>
          <MuiBox onClick={handleClick}>{children}</MuiBox>
          <MuiPopover
            open={isOpen}
            anchorEl={anchorEl}
            onClose={handleCancel}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          >
            <MuiBox sx={{ p: 2, maxWidth: 300 }}>
              {title && (
                <MuiTypography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {title}
                </MuiTypography>
              )}
              {description && (
                <MuiTypography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {description}
                </MuiTypography>
              )}
              <MuiBox
                sx={{ mt: 1.5, display: 'flex', gap: 1, justifyContent: 'flex-end' }}
              >
                <MuiButton size="small" onClick={handleCancel}>
                  {cancelText}
                </MuiButton>
                <MuiButton size="small" variant="contained" onClick={handleConfirm}>
                  {confirmText}
                </MuiButton>
              </MuiBox>
            </MuiBox>
          </MuiPopover>
        </MuiBox>
      </MuiClickAwayListener>
    );
  },
);

SupersetPopconfirm.displayName = 'SupersetPopconfirm';

export default SupersetPopconfirm;
