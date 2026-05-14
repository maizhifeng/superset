import { useState, type ReactNode } from 'react';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import AddIcon from '@mui/icons-material/Add';

interface Action {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

interface FloatingCreateButtonProps {
  actions: Action[];
}

export default function FloatingCreateButton({ actions }: FloatingCreateButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <SpeedDial
      ariaLabel="Create"
      icon={<SpeedDialIcon icon={<AddIcon />} />}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      open={open}
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: { xs: 'flex', sm: 'none' },
        '& .MuiSpeedDial-fab': {
          width: 48,
          height: 48,
        },
      }}
    >
      {actions.map(action => (
        <SpeedDialAction
          key={action.label}
          icon={action.icon}
          title={action.label}
          onClick={() => { action.onClick(); setOpen(false); }}
        />
      ))}
    </SpeedDial>
  );
}
