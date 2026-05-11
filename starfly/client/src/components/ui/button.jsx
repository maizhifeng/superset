import * as React from "react"
import MuiButton from '@mui/material/Button'
import { Slot } from "@radix-ui/react-slot"

const Button = React.forwardRef(({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  color,
  ...props
}, ref) => {
  // Map shadcn variants to MUI variants/colors
  const muiProps = (() => {
    switch (variant) {
      case "destructive":
        return { color: "error", variant: "contained" }
      case "outline":
        return { variant: "outlined", color: color || "inherit" }
      case "secondary":
        return { variant: "contained", color: "secondary" }
      case "ghost":
        return { variant: "text", color: color || "inherit" }
      case "link":
        return { variant: "text", underline: "hover" }
      default:
        return { variant: "contained", color: color || "primary" }
    }
  })()

  // Map sizes
  const muiSize = (() => {
    switch (size) {
      case "sm": return "small"
      case "lg": return "large"
      case "icon": return "small"
      default: return "medium"
    }
  })()

  const Comp = asChild ? Slot : "button"

  return (
    <MuiButton
      component={asChild ? undefined : Comp}
      variant={muiProps.variant}
      color={muiProps.color}
      size={muiSize}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button }
