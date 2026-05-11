import { forwardRef, type FormEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';

export interface FormProps {
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  children?: ReactNode;
  layout?: 'vertical' | 'horizontal';
  sx?: Record<string, unknown>;
  style?: Record<string, unknown>;
}

const SupersetForm = forwardRef<HTMLFormElement, FormProps>(
  ({ onSubmit, children, layout = 'vertical', sx, style, ...rest }, ref) => (
    <Box
      ref={ref}
      component="form"
      onSubmit={onSubmit}
      sx={{
        display: 'flex',
        flexDirection: layout === 'horizontal' ? 'row' : 'column',
        gap: 2,
        ...sx,
      }}
      style={style}
      {...rest}
    >
      {children}
    </Box>
  ),
);

SupersetForm.displayName = 'SupersetForm';

export default SupersetForm;
