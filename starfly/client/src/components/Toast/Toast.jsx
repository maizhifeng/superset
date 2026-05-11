import React from 'react';
import { Box, Typography, IconButton, Paper, Tooltip } from '@mui/material';
import { CheckCircle, Error, Warning, Info, Close } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';

const iconMap = {
  success: <CheckCircle fontSize="small" />,
  error: <Error fontSize="small" />,
  warning: <Warning fontSize="small" />,
  info: <Info fontSize="small" />,
};

export default function Toast({ id, type = 'info', message, onClose }) {
  const theme = useTheme();
  const color = theme.palette[type]?.main ?? theme.palette.info.main;
  const lightColor = theme.palette[type]?.light ?? theme.palette.info.light;

  return (
    <Paper elevation={3} role="alert" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, pr: 5, position: 'relative', minWidth: 300, maxWidth: 400, border: '1px solid', borderColor: `${color}4d`, bgcolor: `${lightColor}26`, color, animation: 'slideInRight 0.3s ease-out', borderRadius: 1.5 }}>
      <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{iconMap[type]}</Box>
      <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, lineHeight: 1.4, pr: 1 }}>{message}</Typography>
      <Tooltip title="关闭">
        <IconButton size="small" onClick={() => onClose(id)} aria-label="Close" sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', p: 0.5, color: 'inherit', opacity: 0.7, '&:hover': { opacity: 1 } }}>
          <Close fontSize="small" />
        </IconButton>
      </Tooltip>
    </Paper>
  );
}
