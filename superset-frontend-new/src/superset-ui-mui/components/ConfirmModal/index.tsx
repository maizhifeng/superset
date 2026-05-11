import { forwardRef, type ReactNode } from 'react';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogTitle from '@mui/material/DialogTitle';
import MuiDialogContent from '@mui/material/DialogContent';
import MuiDialogContentText from '@mui/material/DialogContentText';
import MuiDialogActions from '@mui/material/DialogActions';
import MuiButton from '@mui/material/Button';

export interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: ReactNode;
  description?: ReactNode;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
  confirmLoading?: boolean;
  danger?: boolean;
}

const SupersetConfirmModal = forwardRef<HTMLDivElement, ConfirmModalProps>(
  (
    {
      open,
      onConfirm,
      onCancel,
      title,
      description,
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmLoading,
      danger,
    },
    ref,
  ) => (
    <MuiDialog ref={ref} open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      {title && <MuiDialogTitle>{title}</MuiDialogTitle>}
      {description && (
        <MuiDialogContent>
          <MuiDialogContentText>{description}</MuiDialogContentText>
        </MuiDialogContent>
      )}
      <MuiDialogActions>
        <MuiButton onClick={onCancel} disabled={confirmLoading}>
          {cancelText}
        </MuiButton>
        <MuiButton
          onClick={onConfirm}
          color={danger ? 'error' : 'primary'}
          variant="contained"
          disabled={confirmLoading}
        >
          {confirmText}
        </MuiButton>
      </MuiDialogActions>
    </MuiDialog>
  ),
);

SupersetConfirmModal.displayName = 'SupersetConfirmModal';

export default SupersetConfirmModal;
