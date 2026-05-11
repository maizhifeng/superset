import { forwardRef } from 'react';
import MuiRadio from '@mui/material/Radio';
import MuiRadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import type { RadioGroupProps as MuiRadioGroupProps } from '@mui/material/RadioGroup';

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioProps extends Omit<MuiRadioGroupProps, 'onChange'> {
  options: RadioOption[];
  onChange?: (value: string) => void;
  row?: boolean;
}

const SupersetRadio = forwardRef<HTMLDivElement, RadioProps>(
  ({ options, onChange, row, ...rest }, ref) => (
    <MuiRadioGroup
      ref={ref}
      onChange={(_, value) => onChange?.(value)}
      row={row}
      {...rest}
    >
      {options.map(option => (
        <FormControlLabel
          key={option.value}
          value={option.value}
          control={<MuiRadio />}
          label={option.label}
          disabled={option.disabled}
        />
      ))}
    </MuiRadioGroup>
  ),
);

SupersetRadio.displayName = 'SupersetRadio';

export default SupersetRadio;
