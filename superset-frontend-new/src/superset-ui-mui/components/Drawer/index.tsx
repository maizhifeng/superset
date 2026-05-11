import { forwardRef, type ReactNode } from 'react';
import MuiDrawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiIconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

export interface DrawerProps {
  open?: boolean;
  onClose?: () => void;
  title?: string;
  children?: ReactNode;
  width?: number | string;
  placement?: 'left' | 'right' | 'top' | 'bottom';
}

const SupersetDrawer = forwardRef<HTMLDivElement, DrawerProps>(
  ({ open, onClose, title, children, width = 360, placement = 'right' }, ref) => (
    <MuiDrawer
      ref={ref}
      open={open}
      onClose={onClose}
      anchor={placement}
      slotProps={{
        paper: {
          sx: {
            width,
            ...(placement === 'top' || placement === 'bottom' ? { height: '40vh' } : {}),
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6">{title}</Typography>
        {onClose && (
          <MuiIconButton onClick={onClose} size="small">
            <CloseIcon />
          </MuiIconButton>
        )}
      </Box>
      <Box sx={{ p: 2, flexGrow: 1, overflow: 'auto' }}>{children}</Box>
    </MuiDrawer>
  ),
);

SupersetDrawer.displayName = 'SupersetDrawer';

export default SupersetDrawer;
