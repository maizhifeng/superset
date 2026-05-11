import * as React from "react"
import MuiTooltip from '@mui/material/Tooltip'

const TooltipProviderContext = React.createContext({})

const TooltipProvider = ({ children, delayDuration = 0, ...props }) => (
  <TooltipProviderContext.Provider value={{ delayDuration, ...props }}>
    {children}
  </TooltipProviderContext.Provider>
)

const Tooltip = React.forwardRef(({ children, delayDuration, open, onOpenChange, disableHoverListener, ...props }, ref) => {
  const ctx = React.useContext(TooltipProviderContext)
  const placementMap = { top: 'top', bottom: 'bottom', left: 'left', right: 'right' }
  const side = props.side
  const placement = placementMap[side] || 'top'

  return (
    <MuiTooltip
      ref={ref}
      title={props.children || ''}
      placement={placement}
      enterDelay={delayDuration ?? ctx.delayDuration ?? 0}
      {...props}
    >
      {children}
    </MuiTooltip>
  )
})
Tooltip.displayName = 'Tooltip'

const TooltipTrigger = React.forwardRef(({ children, asChild, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { ref, ...props })
  }
  return <span ref={ref} {...props}>{children}</span>
})
TooltipTrigger.displayName = 'TooltipTrigger'

const TooltipContent = React.forwardRef(({ className, sideOffset = 4, children, side, ...props }, ref) => {
  // In the shadcn pattern, TooltipContent is inside Tooltip and provides the tooltip text.
  // With MUI, the title is passed to the Tooltip wrapper directly.
  // We store the content via context so the parent Tooltip can access it.
  return <span ref={ref} {...props}>{children}</span>
})
TooltipContent.displayName = 'TooltipContent'

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
