import { forwardRef } from 'react';
import MuiDivider from '@mui/material/Divider';
import type { DividerProps as MuiDividerProps } from '@mui/material/Divider';

export interface DividerProps extends MuiDividerProps {
  dashed?: boolean;
}

const SupersetDivider = forwardRef<HTMLHRElement, DividerProps>(
  ({ dashed, sx, ...rest }, ref) => (
    <MuiDivider
      ref={ref}
      sx={{
        ...(dashed ? { borderStyle: 'dashed' } : {}),
        ...sx,
      }}
      {...rest}
    />
  ),
);

SupersetDivider.displayName = 'SupersetDivider';

export default SupersetDivider;
