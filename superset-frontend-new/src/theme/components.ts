import type { Theme } from "@mui/material/styles";
import { transitions, timing } from "./motion";

const t = (prop: string, val: string) => `${prop} ${val}`;

export default {
  MuiCssBaseline: {
    styleOverrides: (theme: Theme) => ({
      body: {
        backgroundColor: theme.palette.background.default,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        lineHeight: 1.5,
        minHeight: "100vh",
        margin: 0,
      },
      "::-webkit-scrollbar": {
        width: 6,
        height: 6,
      },
      "::-webkit-scrollbar-track": {
        background: "transparent",
      },
      "::-webkit-scrollbar-thumb": {
        background: "rgba(0, 0, 0, 0.15)",
        borderRadius: 3,
        transition: transitions.background,
      },
      "::-webkit-scrollbar-thumb:hover": {
        background: "rgba(0, 0, 0, 0.25)",
      },
      "@media (prefers-reduced-motion: reduce)": {
        "*, *::before, *::after": {
          animationDuration: "0.01ms !important",
          animationIterationCount: "1 !important",
          transitionDuration: "0.01ms !important",
          scrollBehavior: "auto !important",
        },
      },
    }),
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        textTransform: "none",
        fontWeight: 500,
        fontSize: "0.875rem",
        letterSpacing: 0.02,
        borderRadius: 8,
        transition: `${transitions.backgroundColor}, ${t("box-shadow", timing.quick)}`,
      },
      contained: {
        boxShadow: "none",
        "&:hover": {
          boxShadow:
            "0 2px 4px rgba(0,0,0,0.08), 0 4px 12px rgba(32, 167, 201, 0.15)",
        },
      },
      outlined: {
        borderColor: "var(--mui-palette-divider, #e0e0e0)",
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover, rgba(0,0,0,0.04))",
          borderColor: "var(--mui-palette-text-secondary, #5f6368)",
        },
      },
      text: {
        "&:hover": { backgroundColor: "rgba(32, 167, 201, 0.08)" },
      },
      sizeSmall: { padding: "4px 10px", fontSize: "0.8125rem" },
      sizeMedium: { padding: "6px 16px" },
      sizeLarge: { padding: "10px 24px", fontSize: "1rem" },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        border: "none",
        borderRadius: 12,
        boxShadow:
          "var(--mui-palette-shadow-card, 0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.06))",
        transition: `${transitions.boxShadow}, ${t("transform", timing.quick)}`,
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow:
            "var(--mui-palette-shadow-cardHover, 0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.10))",
        },
      },
    },
  },
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: {
        backgroundImage: "none",
      },
      rounded: { borderRadius: 8 },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: transitions.backgroundColor,
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover, rgba(0,0,0,0.04))",
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12,
        boxShadow: "0 4px 8px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.12)",
      },
    },
  },
  MuiBackdrop: {
    styleOverrides: {
      root: {
        backgroundColor: "rgba(0, 0, 0, 0.35)",
        backdropFilter: "blur(2px)",
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: { root: { padding: "24px 24px 8px" } },
  },
  MuiDialogContent: {
    styleOverrides: { root: { padding: "8px 24px 16px" } },
  },
  MuiDialogActions: {
    styleOverrides: { root: { padding: "8px 24px 24px" } },
  },
  MuiTableCell: {
    styleOverrides: {
      head: {
        fontWeight: 600,
        fontSize: "0.8125rem",
        borderBottom: "1px solid var(--mui-palette-divider, #e0e0e0)",
      },
      body: {
        fontSize: "0.875rem",
        borderBottom:
          "1px solid var(--mui-palette-border-light, rgba(0,0,0,0.06))",
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        "& .MuiTableCell-head": {
          backgroundColor: "var(--mui-palette-surface-variant, #f0f4f5)",
        },
      },
    },
  },
  MuiChip: {
    styleOverrides: { root: { fontWeight: 500 } },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { fontSize: "0.75rem", borderRadius: 6 },
    },
  },
  MuiAppBar: {
    styleOverrides: {
      root: {
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        backgroundColor: "var(--mui-palette-background-paper, #ffffff)",
        borderBottom: "1px solid var(--mui-palette-divider, #e0e0e0)",
        color: "var(--mui-palette-text-primary, #1a1a1a)",
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        transition: `${transitions.backgroundColor}, ${t("transform", timing.quick)}`,
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover, rgba(0,0,0,0.04))",
          transform: "scale(1.08)",
        },
        "&:active": { transform: "scale(0.95)" },
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      indicator: {
        backgroundColor: "var(--mui-palette-primary-main, #20a7c9)",
        height: 3,
        borderRadius: "3px 3px 0 0",
        transition: t("transform", timing.standard),
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        textTransform: "none",
        fontWeight: 500,
        fontSize: "0.875rem",
        transition: transitions.color,
        "&.Mui-selected": {
          color: "var(--mui-palette-primary-main, #20a7c9)",
        },
      },
    },
  },
  MuiSwitch: {
    styleOverrides: {
      switchBase: {
        transition: t("transform", timing.quick),
      },
    },
  },
  MuiDivider: {
    styleOverrides: {
      root: { borderColor: "var(--mui-palette-divider, #e0e0e0)" },
    },
  },
  MuiSkeleton: {
    styleOverrides: { root: { borderRadius: 6 } },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: {
        fontSize: "0.8125rem",
        transition: transitions.backgroundColor,
      },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        transition: transitions.backgroundColor,
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        transition: `${transitions.borderColor}, ${t("box-shadow", timing.quick)}`,
        "&:hover": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--mui-palette-text-secondary, #5f6368)",
          },
        },
        "&.Mui-focused": {
          boxShadow: "0 0 0 3px rgba(32, 167, 201, 0.12)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderWidth: 2,
            borderColor: "var(--mui-palette-primary-main, #20a7c9)",
          },
        },
      },
    },
  },
  MuiCheckbox: {
    styleOverrides: {
      root: { transition: transitions.color },
    },
  },
  MuiBreadcrumbs: {
    styleOverrides: {
      root: { fontSize: "0.8125rem" },
    },
  },
};
