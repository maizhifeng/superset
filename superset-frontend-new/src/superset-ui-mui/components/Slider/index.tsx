import { forwardRef } from 'react';
import MuiSlider from '@mui/material/Slider';
import type { SliderProps as MuiSliderProps } from '@mui/material/Slider';

export interface SliderProps extends Omit<MuiSliderProps, 'onChange'> {
  onChange?: (value: number | number[]) => void;
  range?: boolean;
}

const SupersetSlider = forwardRef<HTMLSpanElement, SliderProps>(
  ({ range, onChange, ...rest }, ref) => (
    <MuiSlider
      ref={ref}
      {...rest}
      onChange={(_, value) => onChange?.(value as number | number[])}
    />
  ),
);

SupersetSlider.displayName = 'SupersetSlider';

export default SupersetSlider;
