import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import KeyboardIcon from '@mui/icons-material/Keyboard';

interface HelpEntryButtonProps {
  onClick: () => void;
}

export default function HelpEntryButton({ onClick }: HelpEntryButtonProps) {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: theme => theme.zIndex.drawer + 2,
      }}
    >
      <Tooltip title="Keyboard Shortcuts (Shift+?)" placement="left">
        <IconButton
          onClick={onClick}
          size="small"
          sx={{
            bgcolor: 'primary.main',
            color: 'common.white',
            width: 40,
            height: 40,
            '&:hover': { bgcolor: 'primary.dark' },
            boxShadow: 2,
          }}
        >
          <KeyboardIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
