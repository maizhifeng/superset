import { forwardRef } from 'react';
import MuiSwitch, { SwitchProps } from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';

export interface SupersetSwitchProps extends SwitchProps {
  label?: string;
}

const SupersetSwitch = forwardRef<HTMLButtonElement, SupersetSwitchProps>(
  ({ label, ...rest }, ref) => {
    if (label) {
      return <FormControlLabel control={<MuiSwitch ref={ref} {...rest} />} label={label} />;
    }
    return <MuiSwitch ref={ref} {...rest} />;
  },
);

SupersetSwitch.displayName = 'SupersetSwitch';

export default SupersetSwitch;
