import { forwardRef } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';

export interface ProgressProps {
  type?: 'circular' | 'linear';
  percent?: number;
  size?: number | string;
  strokeWidth?: number;
}

const SupersetProgress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ type = 'circular', percent, size, strokeWidth }, ref) => {
    if (type === 'linear') {
      return (
        <LinearProgress
          ref={ref}
          variant={percent !== undefined ? 'determinate' : 'indeterminate'}
          value={percent}
        />
      );
    }

    return (
      <CircularProgress
        ref={ref}
        variant={percent !== undefined ? 'determinate' : 'indeterminate'}
        value={percent}
        size={size}
        thickness={strokeWidth}
      />
    );
  },
);

SupersetProgress.displayName = 'SupersetProgress';

export default SupersetProgress;
