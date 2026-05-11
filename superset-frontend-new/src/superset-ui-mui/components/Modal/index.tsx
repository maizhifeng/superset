import { forwardRef, type ReactNode } from 'react';
import MuiDialog, { DialogProps as MuiDialogProps } from '@mui/material/Dialog';
import MuiDialogTitle from '@mui/material/DialogTitle';
import MuiDialogContent from '@mui/material/DialogContent';
import MuiDialogActions from '@mui/material/DialogActions';

export interface SupersetModalProps {
  open?: boolean;
  onClose?: MuiDialogProps['onClose'];
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  disableBackdropClick?: boolean;
}

const SupersetModal = forwardRef<HTMLDivElement, SupersetModalProps>(
  (
    {
      open,
      onClose,
      title,
      children,
      footer,
      width,
      fullWidth,
      disableBackdropClick,
    },
    ref,
  ) => {
    const handleClose: MuiDialogProps['onClose'] = (event, reason) => {
      if (disableBackdropClick && reason === 'backdropClick') {
        return;
      }
      onClose?.(event, reason);
    };

    return (
      <MuiDialog
        ref={ref}
        open={!!open}
        onClose={handleClose}
        maxWidth={width}
        fullWidth={fullWidth ?? false}
      >
        {title && <MuiDialogTitle>{title}</MuiDialogTitle>}
        {children && <MuiDialogContent>{children}</MuiDialogContent>}
        {footer && <MuiDialogActions>{footer}</MuiDialogActions>}
      </MuiDialog>
    );
  },
);

SupersetModal.displayName = 'SupersetModal';

export default SupersetModal;
