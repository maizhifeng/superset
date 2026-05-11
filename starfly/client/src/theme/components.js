/**
 * MUI 组件样式覆盖 — Material Design 3
 *
 * 核心原则：
 * - 高程通过 shadow/elevation 表达，不靠边框
 * - Card 等高程组件常态 elevation 1，hover 提层到 elevation 3
 * - 交互组件使用 M3 状态层（hover/focus/pressed）
 * - 动效使用 M3 easing curve
 */

const quick = '150ms cubic-bezier(0.2, 0, 0, 1)'
const standard = '200ms cubic-bezier(0, 0, 0.2, 1)'
const slow = '300ms cubic-bezier(0, 0, 0.2, 1)'

const components = {
  MuiCssBaseline: {
    styleOverrides: {
      html: {
        fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      },
      body: {
        fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        backgroundColor: 'var(--mui-palette-background-default)',
        color: 'var(--mui-palette-text-primary)',
        minHeight: '100vh',
        margin: 0,
        lineHeight: 1.5,
      },
      '*, *::before, *::after': {
        fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      },
    },
  },

  // Button: M3 风格 variants
  MuiButton: {
    defaultProps: {
      disableElevation: true,
      size: 'small',
    },
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontSize: '0.875rem',
        fontWeight: 500,
        letterSpacing: 0.02,
        borderRadius: 8,
        transition: `background-color ${quick}, box-shadow ${quick}`,
      },
      contained: {
        boxShadow: 'none',
        '&:hover': {
          boxShadow: 'var(--mui-palette-shadow-md)',
        },
      },
      outlined: {
        borderWidth: '1px',
        borderColor: 'var(--mui-palette-border-medium)',
        '&:hover': {
          backgroundColor: 'var(--mui-palette-bg-hover)',
          borderWidth: '1px',
          borderColor: 'var(--mui-palette-border-strong)',
        },
      },
      text: {
        '&:hover': { backgroundColor: 'var(--mui-palette-bg-selected)' },
      },
      sizeSmall: { padding: '6px 12px', fontSize: '0.8125rem' },
      sizeMedium: { padding: '8px 16px' },
      sizeLarge: { padding: '10px 24px', fontSize: '1rem' },
    },
  },

  // Card: M3 elevated card
  MuiCard: {
    styleOverrides: {
      root: {
        border: 'none',
        boxShadow: 'var(--mui-palette-shadow-sm)',
        borderRadius: 12,
        transition: `box-shadow ${standard}, transform ${standard}`,
        '&:hover': {
          boxShadow: 'var(--mui-palette-shadow-md)',
          transform: 'translateY(-1px)',
        },
      },
    },
  },
  MuiCardHeader: { styleOverrides: { root: { padding: '16px 24px 8px' } } },
  MuiCardContent: { styleOverrides: { root: { padding: '8px 24px 16px' } } },
  MuiCardActions: { styleOverrides: { root: { padding: '8px 24px 16px' } } },

  // Dialog: M3 elevated dialog
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12,
        border: 'none',
        boxShadow: 'var(--mui-palette-shadow-lg)',
        transition: `opacity ${standard}`,
      },
    },
  },
  MuiDialogTitle: { styleOverrides: { root: { padding: '24px 24px 8px' } } },
  MuiDialogContent: { styleOverrides: { root: { padding: '8px 24px 16px' } } },
  MuiDialogActions: { styleOverrides: { root: { padding: '8px 24px 24px' } } },

  // Drawer
  MuiDrawer: {
    styleOverrides: {
      paper: {
        border: 'none',
        transition: `transform ${slow}`,
      },
    },
    variants: [
      {
        props: { drawerType: 'sidebar' },
        style: {
          '& .MuiDrawer-paper': {
            borderRight: '1px solid var(--mui-palette-border-medium)',
            backgroundColor: 'var(--mui-palette-bg-sidebar)',
          },
        },
      },
      {
        props: { drawerType: 'modal' },
        style: {
          '& .MuiDrawer-paper': {
            width: '50vw',
            minWidth: 500,
            maxWidth: 700,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--mui-palette-background-paper)',
            boxShadow: 'var(--mui-palette-shadow-lg)',
          },
        },
      },
    ],
  },

  // TextField / Input: M3 outlined text field
  MuiTextField: {
    defaultProps: { size: 'small' },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        backgroundColor: 'var(--mui-palette-background-paper)',
        borderRadius: 8,
        transition: `border-color ${quick}, box-shadow ${quick}`,
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: 'var(--mui-palette-border-strong)',
        },
        '&.Mui-focused': {
          backgroundColor: 'var(--mui-palette-background-paper)',
          '& .MuiOutlinedInput-notchedOutline': {
            borderWidth: 2,
            borderColor: 'var(--mui-palette-primary-main)',
            boxShadow: '0 0 0 3px var(--mui-palette-action-focus)',
          },
        },
      },
      notchedOutline: { borderColor: 'var(--mui-palette-border-medium)' },
    },
  },

  MuiSelect: {
    styleOverrides: {
      icon: { fontSize: '1rem' },
    },
  },

  MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },

  MuiTooltip: {
    styleOverrides: {
      tooltip: { fontSize: '0.75rem', borderRadius: 6, backgroundColor: 'var(--mui-palette-text-primary, #3C4043)', color: 'var(--mui-palette-background-paper, #FFF)' },
      arrow: { color: 'var(--mui-palette-text-primary, #3C4043)' },
    },
  },

  MuiSkeleton: { styleOverrides: { root: { borderRadius: 6 } } },

  MuiDivider: { styleOverrides: { root: { borderColor: 'var(--mui-palette-divider)' } } },

  // Table
  MuiTableHead: { styleOverrides: { root: { backgroundColor: 'var(--mui-palette-bg-header)' } } },
  MuiTableCell: {
    styleOverrides: {
      head: {
        fontWeight: 600,
        fontSize: '0.8125rem',
        borderBottom: '1px solid var(--mui-palette-border-medium)',
      },
      body: {
        fontSize: '0.875rem',
        borderBottom: '1px solid var(--mui-palette-border-light)',
      },
    },
  },

  // Paper: M3 surface (no forced elevation, no forced border)
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: {
        backgroundImage: 'none',
      },
      rounded: { borderRadius: 8 },
    },
  },

  // List items
  MuiListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        transition: `background-color ${quick}`,
      },
    },
  },

  // AppBar: M3 top app bar
  MuiAppBar: {
    defaultProps: { color: 'inherit' },
    styleOverrides: {
      root: {
        boxShadow: 'none',
        backgroundColor: 'var(--mui-palette-background-paper)',
        borderBottom: '1px solid var(--mui-palette-border-medium)',
        color: 'var(--mui-palette-text-primary)',
      },
    },
  },

  // InputBase
  MuiInputBase: {
    styleOverrides: {
      root: {
        backgroundColor: 'var(--mui-palette-background-paper)',
        transition: `border-color ${quick}, box-shadow ${quick}`,
      },
    },
  },

  // ToggleButton
  MuiToggleButton: {
    styleOverrides: {
      root: {
        border: '1px solid var(--mui-palette-border-medium)',
        textTransform: 'none',
        fontSize: '0.75rem',
        color: 'var(--mui-palette-text-secondary)',
        transition: `background-color ${quick}, color ${quick}`,
        '&.Mui-selected': {
          backgroundColor: 'var(--mui-palette-bg-selected)',
          color: 'var(--mui-palette-primary-main)',
          '&:hover': { backgroundColor: 'var(--mui-palette-bg-hover)' },
        },
        '&:hover': { backgroundColor: 'var(--mui-palette-bg-hover)' },
      },
    },
  },

  // MenuItem
  MuiMenuItem: {
    styleOverrides: {
      root: {
        fontSize: '0.8125rem',
        py: 0.75,
        transition: `background-color ${quick}`,
      },
    },
  },

  // Checkbox
  MuiCheckbox: {
    defaultProps: {
      sx: { color: 'var(--mui-palette-text-secondary)' },
    },
    styleOverrides: {
      root: {
        transition: `color ${quick}`,
        '&.Mui-checked': { color: 'var(--mui-palette-primary-main)' },
      },
    },
  },

  // Tabs
  MuiTabs: {
    styleOverrides: {
      indicator: {
        backgroundColor: 'var(--mui-palette-primary-main)',
        transition: `transform ${standard} cubic-bezier(0.3, 0, 0, 1)`,
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 500,
        fontSize: '0.875rem',
        transition: `color ${quick}`,
        '&.Mui-selected': { color: 'var(--mui-palette-primary-main)' },
      },
    },
  },

  MuiFormControlLabel: {
    styleOverrides: {
      label: { fontSize: '0.8125rem' },
    },
  },

  // IconButton: M3 with state layer + scale on hover
  MuiIconButton: {
    styleOverrides: {
      root: {
        transition: `background-color ${quick}, transform ${quick}`,
        '&:hover': {
          backgroundColor: 'var(--mui-palette-bg-hover)',
          transform: 'scale(1.08)',
        },
        '&:active': {
          transform: 'scale(0.95)',
        },
      },
    },
  },

  // Badge
  MuiBadge: {
    styleOverrides: {
      badge: {
        fontSize: '0.625rem',
        fontWeight: 600,
      },
    },
  },

  // LinearProgress
  MuiLinearProgress: {
    styleOverrides: {
      bar: {
        transition: `transform ${slow} cubic-bezier(0.3, 0, 0, 1)`,
      },
    },
  },

  // Switch
  MuiSwitch: {
    styleOverrides: {
      switchBase: {
        transition: `transform ${quick} cubic-bezier(0.3, 0, 0, 1)`,
      },
    },
  },
}

export default components
