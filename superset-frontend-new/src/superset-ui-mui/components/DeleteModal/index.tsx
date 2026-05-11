import { forwardRef, type ReactNode } from 'react';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogTitle from '@mui/material/DialogTitle';
import MuiDialogContent from '@mui/material/DialogContent';
import MuiDialogContentText from '@mui/material/DialogContentText';
import MuiDialogActions from '@mui/material/DialogActions';
import MuiButton from '@mui/material/Button';

export interface DeleteModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: ReactNode;
  description?: ReactNode;
  objectName?: string;
}

const SupersetDeleteModal = forwardRef<HTMLDivElement, DeleteModalProps>(
  (
    { open, onConfirm, onCancel, title, description, objectName },
    ref,
  ) => (
    <MuiDialog ref={ref} open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      {title && <MuiDialogTitle>{title}</MuiDialogTitle>}
      {(description || objectName) && (
        <MuiDialogContent>
          <MuiDialogContentText>
            {description}
            {objectName && <> &quot;{objectName}&quot;</>}
          </MuiDialogContentText>
        </MuiDialogContent>
      )}
      <MuiDialogActions>
        <MuiButton onClick={onCancel}>Cancel</MuiButton>
        <MuiButton onClick={onConfirm} color="error" variant="contained">
          Delete
        </MuiButton>
      </MuiDialogActions>
    </MuiDialog>
  ),
);

SupersetDeleteModal.displayName = 'SupersetDeleteModal';

export default SupersetDeleteModal;
