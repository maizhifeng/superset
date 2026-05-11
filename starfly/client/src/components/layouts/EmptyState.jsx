import { Box, Typography } from '@mui/material';
import { Icon } from '@/components/ui/icon';

export default function EmptyState({
  icon,
  title,
  description,
  action,
}) {
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        p: 3,
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          mx: 'auto',
          width: 48,
          height: 48,
          bgcolor: 'action.hover',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1.5,
        }}
      >
        <Icon name={icon} size={24} sx={{ color: 'text.secondary' }} />
      </Box>
      <Typography
        variant="body2"
        sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}
      >
        {title}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', mb: 2 }}
      >
        {description}
      </Typography>
      {action && <Box sx={{ mt: 4 }}>{action}</Box>}
    </Box>
  );
}