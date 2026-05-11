import * as React from 'react'
import Chip from '@mui/material/Chip'

const variantMap = {
  default: { color: 'primary', variant: 'filled' },
  secondary: { color: 'secondary', variant: 'filled' },
  destructive: { color: 'error', variant: 'filled' },
  outline: { color: 'default', variant: 'outlined' },
  success: { color: 'success', variant: 'filled' },
  warning: { color: 'warning', variant: 'filled' },
  tertiary: { color: 'default', variant: 'filled', custom: true },
}

function Badge({ variant = 'default', children, size = 'small', sx: customSx, ...props }) {
  const { color, variant: chipVariant, custom } = variantMap[variant] || variantMap.default
  const customSxApplied = custom
    ? { backgroundColor: 'var(--mui-palette-tertiary-container)', color: 'var(--mui-palette-tertiary-onContainer)', ...customSx }
    : customSx
  return (
    <Chip
      label={children}
      size={size}
      color={custom ? 'default' : color}
      variant={custom ? 'filled' : chipVariant}
      sx={{ fontWeight: 500, height: 20, fontSize: '0.6875rem', ...customSxApplied }}
      {...props}
    />
  )
}

export { Badge, variantMap as badgeVariants }
