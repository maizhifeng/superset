import { forwardRef } from 'react';
import MuiTextField, { TextFieldProps as MuiTextFieldProps } from '@mui/material/TextField';

export type InputProps = MuiTextFieldProps;

const SupersetInput = forwardRef<HTMLDivElement, InputProps>(
  (props, ref) => <MuiTextField ref={ref} {...props} />,
);

SupersetInput.displayName = 'SupersetInput';

export default SupersetInput;
