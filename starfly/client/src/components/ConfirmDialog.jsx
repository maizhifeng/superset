import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import HelpOutlineIcon from '@mui/icons-material/Help';
import WarningIcon from '@mui/icons-material/ReportProblem';
import Slide from '@mui/material/Slide';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="down" ref={ref} timeout={200} {...props} />;
});

export default function ConfirmDialog({
  isOpen,
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  isDanger = false,
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      await onConfirm();
    } catch (error) {
      // Error handling should be done by parent component
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onCancel}
      slots={{ transition: Transition }}
      slotProps={{
        paper: {
          onClick: (e) => e.stopPropagation(),
          sx: {
            maxWidth: 480,
            width: '100%',
            mx: 2,
          },
        },
      }}
    >
      {/* Header with icon */}
      <DialogTitle
        sx={{
          pb: 2,
          borderBottom: 1,
          borderColor: isDanger ? 'error.light' : 'divider',
          backgroundColor: isDanger ? 'error.50' : 'action.hover',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDanger ? 'error.100' : 'primary.50',
            flexShrink: 0,
          }}
        >
          {isDanger ? (
            <WarningIcon sx={{ fontSize: 20, color: 'error.main' }} />
          ) : (
            <HelpOutlineIcon sx={{ fontSize: 20, color: 'primary.main' }} />
          )}
        </Box>
        {title}
      </DialogTitle>

      {/* Body */}
      <DialogContent sx={{ pt: '16px !important' }}>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>

      {/* Footer */}
      <DialogActions sx={{ pt: 1, pb: 2, px: 3 }}>
        <Button
          onClick={onCancel}
          disabled={isLoading}
          variant="outlined"
          color="inherit"
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isLoading}
          variant="contained"
          color={isDanger ? 'error' : 'primary'}
          startIcon={isLoading && <CircularProgress size={16} color="inherit" />}
        >
          {isLoading ? '处理中...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Hook for easier usage
export function useConfirmDialog() {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '确认',
    cancelText: '取消',
    isDanger: false,
    onConfirm: null,
  });

  const show = ({ title, message, confirmText = '确认', cancelText = '取消', isDanger = false, onConfirm }) => {
    setState({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      isDanger,
      onConfirm,
    });
  };

  const hide = () => {
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  const confirm = async () => {
    if (state.onConfirm) {
      await state.onConfirm();
    }
    hide();
  };

  // 返回 props 对象和方法分离，避免将方法展开到 Dialog
  const props = {
    isOpen: state.isOpen,
    title: state.title,
    message: state.message,
    confirmText: state.confirmText,
    cancelText: state.cancelText,
    isDanger: state.isDanger,
    onConfirm: confirm,
    onCancel: hide,
  };

  return {
    props,
    show,
    hide,
    isOpen: state.isOpen,
  };
}
