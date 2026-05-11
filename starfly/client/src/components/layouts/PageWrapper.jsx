import Box from '@mui/material/Box'

const maxWidthMap = { sm: '56rem', md: '80rem', lg: '112rem', xl: '128rem', '2xl': '1400px', none: 'none' }

export default function PageWrapper({ children, maxWidth = 'none', fullHeight = false, className, sx: customSx }) {
  return (
    <Box sx={{ p: 1, overflow: 'auto', ...(fullHeight && { height: '100%', display: 'flex', flexDirection: 'column' }), ...(maxWidth !== 'none' && { maxWidth: maxWidthMap[maxWidth], mx: 'auto' }), ...customSx }}>
      {children}
    </Box>
  )
}
