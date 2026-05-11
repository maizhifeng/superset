import * as React from "react"
import InputBase from '@mui/material/InputBase'

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <InputBase
    type={type}
    inputRef={ref}
    sx={{
      fontSize: '0.875rem',
      border: '1px solid var(--mui-palette-border-gray)',
      borderRadius: 1.5,
      padding: '6px 12px',
      backgroundColor: 'var(--mui-palette-background-paper)',
      transition: 'border-color 150ms ease, box-shadow 150ms ease',
      '&:focus': {
        outline: 'none',
        borderColor: 'var(--mui-palette-primary-main)',
        boxShadow: '0 0 0 3px var(--mui-palette-action-focus)',
      },
      '&:disabled': {
        cursor: 'not-allowed',
        opacity: 0.5,
      },
      '&::placeholder': {
        color: 'var(--mui-palette-text-disabled)',
      },
      width: '100%',
    }}
    {...props}
  />
))
Input.displayName = "Input"

export { Input }
