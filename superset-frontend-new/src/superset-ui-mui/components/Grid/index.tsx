import { forwardRef, type ReactNode } from 'react';
import MuiGrid from '@mui/material/Grid';
import type { GridSize } from '@mui/material/Grid';

export interface GridProps {
  container?: boolean;
  item?: boolean;
  xs?: GridSize;
  sm?: GridSize;
  md?: GridSize;
  lg?: GridSize;
  xl?: GridSize;
  spacing?: number | string;
  children?: ReactNode;
}

const SupersetGrid = forwardRef<HTMLDivElement, GridProps>(
  ({ container, item, xs, sm, md, lg, xl, spacing, children }, ref) => {
    const size = {
      ...(xs !== undefined && { xs }),
      ...(sm !== undefined && { sm }),
      ...(md !== undefined && { md }),
      ...(lg !== undefined && { lg }),
      ...(xl !== undefined && { xl }),
    };

    return (
      <MuiGrid
        ref={ref}
        container={container}
        size={item && Object.keys(size).length > 0 ? size : undefined}
        spacing={spacing}
      >
        {children}
      </MuiGrid>
    );
  },
);

SupersetGrid.displayName = 'SupersetGrid';

export default SupersetGrid;
