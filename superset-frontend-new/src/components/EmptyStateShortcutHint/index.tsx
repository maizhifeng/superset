import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import KeyboardIcon from '@mui/icons-material/Keyboard';

interface EmptyStateShortcutHintProps {
  message?: string;
}

export default function EmptyStateShortcutHint({
  message = 'Press Shift+? to view all keyboard shortcuts',
}: EmptyStateShortcutHintProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        gap: 1.5,
        opacity: 0.6,
      }}
    >
      <KeyboardIcon sx={{ fontSize: 32, color: 'text.secondary' }} />
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        {message}
      </Typography>
    </Box>
  );
}
