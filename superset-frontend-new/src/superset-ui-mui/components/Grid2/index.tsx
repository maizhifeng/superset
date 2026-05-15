import { forwardRef, type ReactNode } from 'react';
import MuiGrid from '@mui/material/Grid';
import type { SxProps, Theme } from '@mui/material/styles';

type GridSize = 'auto' | 'grow' | number | false;
type ResponsiveSize = GridSize | { xs?: GridSize; sm?: GridSize; md?: GridSize; lg?: GridSize; xl?: GridSize };

export interface Grid2Props {
  container?: boolean;
  size?: ResponsiveSize;
  spacing?: number | string;
  columns?: number;
  direction?: 'row' | 'row-reverse';
  sx?: SxProps<Theme>;
  children?: ReactNode;
}

const SupersetGrid2 = forwardRef<HTMLDivElement, Grid2Props>(
  ({ container, size, spacing, columns, direction, sx, children }, ref) => (
    <MuiGrid
      ref={ref}
      container={container}
      size={size as any}
      spacing={spacing}
      columns={columns}
      direction={direction}
      sx={sx}
    >
      {children}
    </MuiGrid>
  ),
);

SupersetGrid2.displayName = 'SupersetGrid2';

export default SupersetGrid2;
