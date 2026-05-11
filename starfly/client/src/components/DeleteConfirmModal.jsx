import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
import Button from '@mui/material/Button';
import WarningIcon from '@mui/icons-material/ReportProblem';
import Slide from '@mui/material/Slide';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="down" ref={ref} timeout={200} {...props} />;
});

/**
 * DeleteConfirmModal component - confirmation dialog for widget deletion
 */
export default function DeleteConfirmModal({ isOpen, onClose, title, onConfirm }) {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      slots={{ transition: Transition }}
      slotProps={{
        paper: {
          sx: {
            maxWidth: 480,
            width: '100%',
            mx: 2,
          },
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon sx={{ fontSize: 20, color: 'error.main', flexShrink: 0 }} />
        确认删除
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          确定要删除组件 &ldquo;{title}&rdquo; 吗？此操作无法撤销。
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          删除
        </Button>
      </DialogActions>
    </Dialog>
  );
}
