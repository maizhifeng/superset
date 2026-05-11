import * as React from "react"
import MuiSkeleton from '@mui/material/Skeleton'

function Skeleton({ className, animation = 'pulse', variant = 'rectangular', ...props }) {
  return <MuiSkeleton animation={animation} variant={variant} sx={{ borderRadius: 0.75 }} {...props} />
}

export { Skeleton }
