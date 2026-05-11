import * as React from 'react'
import MuiCard from '@mui/material/Card'
import MuiCardHeader from '@mui/material/CardHeader'
import MuiCardContent from '@mui/material/CardContent'
import MuiCardActions from '@mui/material/CardActions'
import Typography from '@mui/material/Typography'

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <MuiCard ref={ref} {...props} />
))
Card.displayName = 'Card'

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <MuiCardHeader ref={ref} {...props} />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <Typography ref={ref} component="h3" variant="h6" {...props} />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <Typography ref={ref} component="p" variant="body2" color="text.secondary" {...props} />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <MuiCardContent ref={ref} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <MuiCardActions ref={ref} sx={{ display: 'flex', alignItems: 'center' }} {...props} />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
