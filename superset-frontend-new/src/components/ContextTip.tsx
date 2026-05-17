import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import { useDismissible } from '@/hooks/useDismissible';
import type { PageTip } from '@/hooks/usePageTips';

interface ContextTipProps {
  tip: PageTip;
}

export default function ContextTip({ tip }: ContextTipProps) {
  const [dismissed, dismiss] = useDismissible(`tip_${tip.id}`);

  if (dismissed) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        px: 2,
        py: 1.25,
        mx: 2,
        mb: 1,
        borderRadius: 2,
        bgcolor: 'primary.light',
        color: 'primary.contrastText',
        fontSize: '0.8125rem',
        lineHeight: 1.5,
      }}
    >
      <TipsAndUpdatesIcon sx={{ fontSize: 18, mt: 0.25, flexShrink: 0, opacity: 0.9 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, opacity: 0.85, display: 'block', mb: 0.25 }}>
          {tip.title}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          {tip.message}
        </Typography>
      </Box>
      <IconButton size="small" onClick={dismiss} sx={{ mt: -0.25, mr: -0.5, color: 'inherit', opacity: 0.6, '&:hover': { opacity: 1 } }}>
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}
