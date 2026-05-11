import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export function Callout({ title, children, variant = 'info', icon, sx, ...props }) {
  const variantStyles = {
    info: {
      borderColor: 'var(--mui-palette-tertiary-main)',
      bgcolor: 'var(--mui-palette-tertiary-container)',
      color: 'var(--mui-palette-tertiary-onContainer)',
    },
    note: {
      borderColor: 'var(--mui-palette-primary-main)',
      bgcolor: 'var(--mui-palette-primary-container)',
      color: 'var(--mui-palette-primary-onContainer)',
    },
  }
  const styles = variantStyles[variant] || variantStyles.info

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        borderLeft: '4px solid',
        ...styles,
        ...sx,
      }}
      {...props}
    >
      {icon && (
        <Box sx={{ flexShrink: 0, mt: 0.25, lineHeight: 0 }}>
          {icon}
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {title && (
          <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.25, display: 'block' }}>
            {title}
          </Typography>
        )}
        <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
          {children}
        </Typography>
      </Box>
    </Box>
  )
}
