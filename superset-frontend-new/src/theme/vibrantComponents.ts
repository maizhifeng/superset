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
    }),
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        textTransform: "none",
        fontWeight: 600,
        fontSize: "0.875rem",
        letterSpacing: 0.02,
        borderRadius: 10,
        transition: `${transitions.backgroundColor}, ${t("box-shadow", timing.quick)}`,
      },
      containedPrimary: {
        boxShadow: "0 2px 6px rgba(108,92,231,0.2)",
        background: "linear-gradient(135deg, #6C5CE7 0%, #7C3AED 100%)",
        "&:hover": {
          boxShadow: "0 4px 14px rgba(108,92,231,0.3)",
          background: "linear-gradient(135deg, #4A38D6 0%, #6D28D9 100%)",
        },
      },
      containedSecondary: {
        boxShadow: "0 2px 6px rgba(13,148,136,0.2)",
        background: "linear-gradient(135deg, #0D9488 0%, #0891B2 100%)",
        "&:hover": {
          boxShadow: "0 4px 14px rgba(13,148,136,0.3)",
          background: "linear-gradient(135deg, #0F766E 0%, #0E7490 100%)",
        },
      },
      outlined: {
        borderColor: "var(--mui-palette-divider, #E2E8F0)",
        "&:hover": {
          backgroundColor: "rgba(108,92,231,0.06)",
          borderColor: "var(--mui-palette-primary-main, #6C5CE7)",
        },
      },
      text: {
        "&:hover": { backgroundColor: "rgba(108, 92, 231, 0.06)" },
      },
      sizeSmall: { padding: "4px 10px", fontSize: "0.8125rem" },
      sizeMedium: { padding: "6px 16px" },
      sizeLarge: { padding: "10px 24px", fontSize: "1rem" },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        border: "1px solid var(--mui-palette-border-light, rgba(30,41,59,0.06))",
        borderTop: "3px solid var(--mui-palette-primary-main, #6C5CE7)",
        borderRadius: 14,
        backgroundColor: "var(--mui-palette-surface-main, #ffffff)",
        boxShadow:
          "var(--mui-palette-shadow-card, 0 1px 2px rgba(108,92,231,0.02), 0 2px 6px rgba(108,92,231,0.04), 0 4px 12px rgba(30,41,59,0.03))",
        transition: `${transitions.boxShadow}, ${t("transform", timing.quick)}`,
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow:
            "var(--mui-palette-shadow-cardHover, 0 2px 4px rgba(108,92,231,0.04), 0 8px 20px rgba(108,92,231,0.07), 0 12px 32px rgba(30,41,59,0.05))",
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
      rounded: { borderRadius: 10 },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: transitions.backgroundColor,
        "&:hover": {
          backgroundColor: "rgba(108,92,231,0.04)",
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 14,
        boxShadow: "0 4px 8px rgba(30,41,59,0.03), 0 12px 40px rgba(30,41,59,0.08)",
      },
    },
  },
  MuiBackdrop: {
    styleOverrides: {
      root: {
        backgroundColor: "rgba(30, 41, 59, 0.3)",
        backdropFilter: "blur(3px)",
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: { root: { padding: "24px 24px 8px", fontWeight: 700 } },
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
        fontWeight: 700,
        fontSize: "0.8125rem",
        borderBottom: "1px solid var(--mui-palette-divider, #E2E8F0)",
      },
      body: {
        fontSize: "0.875rem",
        borderBottom: "1px solid var(--mui-palette-border-light, rgba(30,41,59,0.06))",
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        "& .MuiTableCell-head": {
          backgroundColor: "var(--mui-palette-surface-variant, #F1F5F9)",
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
        boxShadow: "none",
        backgroundColor: "var(--mui-palette-background-paper, #ffffff)",
        borderBottom: "1px solid var(--mui-palette-primary-main, #6C5CE7)",
        color: "var(--mui-palette-text-primary, #1E293B)",
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        transition: `${transitions.backgroundColor}, ${t("transform", timing.quick)}`,
        "&:hover": {
          backgroundColor: "rgba(108,92,231,0.08)",
          transform: "scale(1.08)",
        },
        "&:active": { transform: "scale(0.95)" },
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      indicator: {
        backgroundColor: "var(--mui-palette-primary-main, #6C5CE7)",
        height: 2,
        borderRadius: "2px 2px 0 0",
        transition: t("transform", timing.standard),
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        textTransform: "none",
        fontWeight: 600,
        fontSize: "0.875rem",
        transition: transitions.color,
        "&.Mui-selected": {
          color: "var(--mui-palette-primary-main, #6C5CE7)",
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
      root: { borderColor: "var(--mui-palette-divider, #E2E8F0)" },
    },
  },
  MuiSkeleton: {
    styleOverrides: { root: { borderRadius: 8 } },
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
        borderRadius: 10,
        transition: `${transitions.borderColor}, ${t("box-shadow", timing.quick)}`,
        "&:hover": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--mui-palette-text-secondary, #64748B)",
          },
        },
        "&.Mui-focused": {
          boxShadow: "0 0 0 3px rgba(108, 92, 231, 0.15)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderWidth: 2,
            borderColor: "var(--mui-palette-primary-main, #6C5CE7)",
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
