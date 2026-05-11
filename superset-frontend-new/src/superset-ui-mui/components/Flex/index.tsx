import { forwardRef, type ReactNode } from 'react';
import Box from '@mui/material/Box';

type FlexDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';
type FlexJustify =
  | 'flex-start'
  | 'center'
  | 'flex-end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';
type FlexAlign = 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';

export interface FlexProps {
  direction?: FlexDirection;
  justify?: FlexJustify;
  align?: FlexAlign;
  wrap?: FlexWrap;
  gap?: number | string;
  children?: ReactNode;
}

const SupersetFlex = forwardRef<HTMLDivElement, FlexProps>(
  ({ direction, justify, align, wrap, gap, children }, ref) => (
    <Box
      ref={ref}
      sx={{
        display: 'flex',
        flexDirection: direction,
        justifyContent: justify,
        alignItems: align,
        flexWrap: wrap,
        gap,
      }}
    >
      {children}
    </Box>
  ),
);

SupersetFlex.displayName = 'SupersetFlex';

export default SupersetFlex;
