import * as React from 'react'
import MuiDrawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import Tooltip from '@mui/material/Tooltip'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

const SheetContext = React.createContext(null)

const Sheet = ({ open, onOpenChange, children, ...props }) => (
  <SheetContext.Provider value={{ open, onOpenChange }}>
    {children}
  </SheetContext.Provider>
)

const SheetTrigger = React.forwardRef(({ children, onClick, asChild, ...props }, ref) => {
  const ctx = React.useContext(SheetContext)
  const handleClick = (e) => {
    ctx?.onOpenChange?.(true)
    onClick?.(e)
  }
  if (asChild) return React.cloneElement(children, { ref, onClick: handleClick })
  return <span ref={ref} onClick={handleClick} {...props}>{children}</span>
})
SheetTrigger.displayName = 'SheetTrigger'

const SheetClose = React.forwardRef(({ children, onClick, ...props }, ref) => {
  const ctx = React.useContext(SheetContext)
  const handleClick = (e) => {
    ctx?.onOpenChange?.(false)
    onClick?.(e)
  }
  return (
    <IconButton ref={ref} size="small" onClick={handleClick} {...props}>
      {children}
    </IconButton>
  )
})
SheetClose.displayName = 'SheetClose'

const anchorMap = { top: 'top', bottom: 'bottom', left: 'left', right: 'right' }

const SheetContent = React.forwardRef(({ side = 'right', children, sx: customSx, className, ...props }, ref) => {
  const ctx = React.useContext(SheetContext)
  // Filter out non-MUI props that would cause React warnings
  const { asChild, ...muiProps } = props
  return (
    <MuiDrawer
      ref={ref}
      anchor={anchorMap[side] || 'right'}
      open={ctx?.open ?? true}
      onClose={() => ctx?.onOpenChange?.(false)}
      sx={{ zIndex: 1300 }}
      slotProps={{
        modal: {
          keepMounted: true,
        },
        paper: {
          sx: {
            ...customSx,
          },
        },
      }}
      {...muiProps}
    >
      {children}
      <Tooltip title="关闭">
        <IconButton
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
          onClick={() => ctx?.onOpenChange?.(false)}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </MuiDrawer>
  )
})
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({ className, ...props }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: { xs: 'center', sm: 'left' }, px: 3, pt: 2, pb: 1 }} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetFooter = ({ className, ...props }) => (
  <Box sx={{ display: 'flex', flexDirection: { xs: 'column-reverse', sm: 'row' }, justifyContent: 'flex-end', gap: 1, px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }} {...props} />
)
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <Typography ref={ref} component="h2" variant="h5" {...props} />
))
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <Typography ref={ref} component="p" variant="body2" color="text.secondary" {...props} />
))
SheetDescription.displayName = 'SheetDescription'

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
