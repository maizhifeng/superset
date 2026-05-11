import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

export interface LoadingProps {
  text?: string;
  fullScreen?: boolean;
  size?: number | string;
}

const SupersetLoading = forwardRef<HTMLDivElement, LoadingProps>(
  ({ text, fullScreen, size }, ref) => (
    <Box
      ref={ref}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: fullScreen ? '100vh' : undefined,
      }}
    >
      <CircularProgress size={size} />
      {text && (
        <Typography variant="body2" sx={{ mt: 2 }}>
          {text}
        </Typography>
      )}
    </Box>
  ),
);

SupersetLoading.displayName = 'SupersetLoading';

export default SupersetLoading;
