import React from 'react';
import { Box, Fade } from '@mui/material';
import Toast from './Toast';

// ForwardRef wrapper to satisfy Slide component's ref requirement
const ToastContainer = React.forwardRef(function ToastContainer({ toasts, removeToast }, ref) {
  if (toasts.length === 0) return null;

  return (
    <Box
      ref={ref}
      sx={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1400,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Fade in timeout={200}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              id={toast.id}
              type={toast.type}
              message={toast.message}
              onClose={removeToast}
            />
          ))}
        </Box>
      </Fade>
    </Box>
  );
});

export default ToastContainer;
