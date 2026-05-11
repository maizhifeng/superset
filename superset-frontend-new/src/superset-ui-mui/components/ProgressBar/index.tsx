import { forwardRef } from 'react';
import LinearProgress from '@mui/material/LinearProgress';

export interface ProgressBarProps {
  percent?: number;
  strokeWidth?: number;
  color?: string;
  trailColor?: string;
}

const SupersetProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ percent, strokeWidth, color, trailColor }, ref) => (
    <LinearProgress
      ref={ref}
      variant={percent !== undefined ? 'determinate' : 'indeterminate'}
      value={percent}
      sx={{
        height: strokeWidth,
        backgroundColor: trailColor,
        '& .MuiLinearProgress-bar': {
          backgroundColor: color,
        },
      }}
    />
  ),
);

SupersetProgressBar.displayName = 'SupersetProgressBar';

export default SupersetProgressBar;
