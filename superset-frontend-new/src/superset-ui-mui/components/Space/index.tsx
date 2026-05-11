import { forwardRef } from 'react';
import MuiStack from '@mui/material/Stack';
import type { StackProps } from '@mui/material/Stack';

export type SpaceSize = number | 'small' | 'medium' | 'large';

export interface SpaceProps extends Omit<StackProps, 'spacing'> {
  size?: SpaceSize;
}

const sizeMap: Record<string, number> = {
  small: 4,
  medium: 8,
  large: 16,
};

const SupersetSpace = forwardRef<HTMLDivElement, SpaceProps>(
  ({ size, ...rest }, ref) => {
    const spacing =
      typeof size === 'number' ? size : size ? sizeMap[size] : 8;

    return (
      <MuiStack
        ref={ref}
        spacing={spacing}
        {...rest}
      />
    );
  },
);

SupersetSpace.displayName = 'SupersetSpace';

export default SupersetSpace;
