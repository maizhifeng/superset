import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import Slide from '@mui/material/Slide';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="down" ref={ref} timeout={200} {...props} />;
});

const typeConfig = {
  info: {
    isDanger: false,
    icon: InfoIcon,
    iconColor: 'info.main',
    iconBg: 'info.50',
  },
  success: {
    isDanger: false,
    icon: CheckCircleIcon,
    iconColor: 'success.main',
    iconBg: 'success.50',
  },
  error: {
    isDanger: true,
    icon: ErrorIcon,
    iconColor: 'error.main',
    iconBg: 'error.50',
  },
};

export default function MessageDialog({
  isOpen,
  type = 'info',
  title,
  message,
  buttonText = '确定',
  onClose,
}) {
  const config = typeConfig[type] || typeConfig.info;
  const IconComponent = config.icon;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
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
          borderColor: config.isDanger ? 'error.light' : 'divider',
          backgroundColor: config.isDanger ? 'error.50' : 'action.hover',
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
            backgroundColor: config.iconBg,
            flexShrink: 0,
          }}
        >
          <IconComponent sx={{ fontSize: 20, color: config.iconColor }} />
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
          onClick={onClose}
          variant="contained"
          color={config.isDanger ? 'error' : 'primary'}
        >
          {buttonText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Hook for easier usage
export function useMessageDialog() {
  const [state, setState] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    buttonText: '确定',
  });

  const show = ({ type = 'info', title, message, buttonText = '确定' }) => {
    setState({
      isOpen: true,
      type,
      title,
      message,
      buttonText,
    });
  };

  const showInfo = (title, message) => show({ type: 'info', title, message });
  const showSuccess = (title, message) => show({ type: 'success', title, message });
  const showError = (title, message) => show({ type: 'error', title, message });

  const hide = () => {
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  // 返回 props 对象和方法分离
  const props = {
    isOpen: state.isOpen,
    type: state.type,
    title: state.title,
    message: state.message,
    buttonText: state.buttonText,
    onClose: hide,
  };

  return {
    props,
    show,
    showInfo,
    showSuccess,
    showError,
    hide,
    isOpen: state.isOpen,
  };
}
