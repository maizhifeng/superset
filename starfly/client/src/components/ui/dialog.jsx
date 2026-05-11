import * as React from 'react'
import MuiDialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import MuiDialogContent from '@mui/material/DialogContent'
import MuiDialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import Slide from '@mui/material/Slide'
import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

const Dialog = React.forwardRef(function Dialog({ slots, ...props }, ref) {
  return <MuiDialog ref={ref} slots={{ transition: Transition, ...slots }} {...props} />
})

const DialogTrigger = React.forwardRef(({ children, onClick, asChild, ...props }, ref) => {
  if (asChild) return React.cloneElement(children, { ref, onClick })
  return <span ref={ref} onClick={onClick} {...props}>{children}</span>
})
DialogTrigger.displayName = 'DialogTrigger'

const DialogClose = React.forwardRef(({ children, ...props }, ref) => (
  <IconButton ref={ref} size="small" {...props}>
    {children}
  </IconButton>
))
DialogClose.displayName = 'DialogClose'

const Transition = React.forwardRef((props, ref) => (
  <Slide direction="down" ref={ref} timeout={200} {...props} />
))

const DialogContent = React.forwardRef(({ className, children, showClose = true, variant, ...props }, ref) => {
  const isFullscreen = variant === 'fullscreen'
  return (
    <MuiDialogContent
      ref={ref}
      sx={isFullscreen ? { p: 0, '&:first-of-type': { pt: 0 } } : undefined}
      {...props}
    >
      {children}
    </MuiDialogContent>
  )
})
DialogContent.displayName = 'DialogContent'

const DialogHeader = ({ className, ...props }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: { xs: 'center', sm: 'left' }, mb: 1 }} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }) => (
  <MuiDialogActions sx={{ display: 'flex', flexDirection: { xs: 'column-reverse', sm: 'row' }, justifyContent: 'flex-end', gap: 1, p: '8px 24px 20px' }} {...props} />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitleComp = React.forwardRef(({ className, ...props }, ref) => (
  <DialogTitle ref={ref} variant="h6" sx={{ pb: 0 }} {...props} />
))
DialogTitleComp.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <Typography ref={ref} component="p" variant="body2" color="text.secondary" sx={{ mt: 0.5 }} {...props} />
))
DialogDescription.displayName = 'DialogDescription'

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitleComp as DialogTitle, DialogDescription, DialogClose, Transition as DialogTransition }
