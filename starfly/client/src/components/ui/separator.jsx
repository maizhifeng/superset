import * as React from "react"
import Divider from '@mui/material/Divider'

const Separator = React.forwardRef(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <Divider ref={ref} orientation={orientation} {...props} />
))
Separator.displayName = "Separator"

export { Separator }
