import React from 'react';
import { Card, CardHeader, CardContent, Typography, Box } from '@mui/material';
import { Icon } from '@/components/ui/icon';

/**
 * ConfigSection - GTM-style section card for AddWidgetModal
 * Provides consistent layout for configuration sections
 */
export default function ConfigSection({ title, icon, subtitle, action, children }) {
  return (
    <Card elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
      <CardHeader
        sx={{
          px: 2,
          py: 1.5,
          backgroundColor: 'grey.50',
          borderBottom: children ? '1px solid' : 'none',
          borderColor: 'divider',
          '& .MuiCardHeader-content': { display: 'flex', alignItems: 'center', gap: 1.5 },
          '& .MuiCardHeader-action': { mr: 0 },
        }}
        avatar={<Icon name={icon} size={16} sx={{ color: 'primary.main' }} />}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
        }
        action={action}
      />
      {children && <CardContent sx={{ p: 2, pt: 2 }}>{children}</CardContent>}
    </Card>
  );
}