import * as React from "react"
import InputLabel from '@mui/material/InputLabel'

const Label = React.forwardRef(({ className, shrink, ...props }, ref) => (
  <InputLabel
    ref={ref}
    shrink={shrink}
    sx={{ fontSize: '0.75rem', fontWeight: 500 }}
    {...props}
  />
))
Label.displayName = "Label"

export { Label }
