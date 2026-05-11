import { forwardRef } from 'react';
import MuiAlert, { AlertProps as MuiAlertProps } from '@mui/material/Alert';

export interface AlertProps extends Omit<MuiAlertProps, 'children'> {
  message: React.ReactNode;
  description?: React.ReactNode;
  closable?: boolean;
}

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ message, description, closable, onClose, ...rest }, ref) => (
    <MuiAlert
      ref={ref}
      onClose={closable ? onClose : undefined}
      {...rest}
    >
      {description ? (
        <>
          {message}
          {description}
        </>
      ) : (
        message
      )}
    </MuiAlert>
  ),
);

Alert.displayName = 'Alert';

export default Alert;
