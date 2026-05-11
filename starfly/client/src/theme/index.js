import { createTheme } from '@mui/material/styles'
import defaultPalette from './palette'
import typography from './typography'
import components from './components'
import motion from './motion'

// ============================================================
// MUI 主题配置 - 支持 CSS 变量、颜色方案、排版与组件样式覆盖
// ============================================================

/**
 * MUI 主题配置（支持 CSS 变量）
 *
 * 启用 cssVariables: true 后，MUI 自动生成 CSS 变量作为初始值。
 * ThemeContext 会通过 inject CSS 动态覆盖这些变量以支持 preset 切换和 dark mode。
 *
 * cssVariables: { disable: true } 禁用 MUI 自动 CSS 变量，
 * 避免 JS 注入的变量被 MUI 重新生成覆盖。
 *
 * 使用方式：
 * 1. CSS 中: var(--mui-palette-primary-main)
 * 2. sx 中: theme.vars.palette.primary.main
 */
const theme = createTheme({
  cssVariables: true,

  colorSchemes: {
    light: {
      palette: defaultPalette,
    },
  },

  typography,

  shape: {
    borderRadius: 8,
  },

  spacing: 8,

  motion,

  components,
})

export default theme
