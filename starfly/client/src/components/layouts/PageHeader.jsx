import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export default function PageHeader({ title, subtitle, actions, breadcrumbs, compact = false, className, sx: customSx }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: compact ? 1.5 : 3, ...customSx }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {breadcrumbs && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>{breadcrumbs}</Typography>
        )}
        <Typography variant={compact ? 'subtitle1' : 'h5'} sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>{actions}</Box>
      )}
    </Box>
  );
}
