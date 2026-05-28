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
            "0 2px 4px rgba(184,101,58,0.08), 0 4px 12px rgba(184,101,58,0.12)",
        },
      },
      outlined: {
        borderColor: "var(--mui-palette-divider, #ece5d8)",
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover, rgba(184,101,58,0.08))",
          borderColor: "var(--mui-palette-text-secondary, #8c8172)",
        },
      },
      text: {
        "&:hover": { backgroundColor: "rgba(184, 101, 58, 0.08)" },
      },
      sizeSmall: { padding: "4px 10px", fontSize: "0.8125rem" },
      sizeMedium: { padding: "6px 16px" },
      sizeLarge: { padding: "10px 24px", fontSize: "1rem" },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        border: "1px solid var(--mui-palette-border-light, rgba(44,36,22,0.05))",
        borderRadius: 12,
        backgroundColor: "var(--mui-palette-surface-main, #fefdfa)",
        boxShadow:
          "var(--mui-palette-shadow-card, 0 1px 2px rgba(44,36,22,0.02), 0 1px 4px rgba(44,36,22,0.03), 0 2px 8px rgba(44,36,22,0.02))",
        transition: `${transitions.boxShadow}, ${t("transform", timing.quick)}`,
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow:
            "var(--mui-palette-shadow-cardHover, 0 2px 4px rgba(44,36,22,0.03), 0 4px 12px rgba(44,36,22,0.05), 0 8px 24px rgba(184,101,58,0.04))",
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
          backgroundColor: "var(--mui-palette-action-hover, rgba(184,101,58,0.04))",
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12,
        boxShadow:
          "0 4px 8px rgba(44,36,22,0.03), 0 12px 40px rgba(44,36,22,0.08)",
      },
    },
  },
  MuiBackdrop: {
    styleOverrides: {
      root: {
        backgroundColor: "rgba(44, 36, 22, 0.35)",
        backdropFilter: "blur(3px)",
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
        borderBottom: "1px solid var(--mui-palette-divider, #ece5d8)",
      },
      body: {
        fontSize: "0.875rem",
        borderBottom:
          "1px solid var(--mui-palette-border-light, rgba(44,36,22,0.05))",
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        "& .MuiTableCell-head": {
          backgroundColor: "var(--mui-palette-surface-variant, #f2ece2)",
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
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
        backgroundColor: "var(--mui-palette-background-paper, #ffffff)",
        borderBottom: "1px solid var(--mui-palette-divider, #ece5d8)",
        color: "var(--mui-palette-text-primary, #2c2416)",
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        transition: `${transitions.backgroundColor}, ${t("transform", timing.quick)}`,
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover, rgba(184,101,58,0.08))",
          transform: "scale(1.08)",
        },
        "&:active": { transform: "scale(0.95)" },
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      indicator: {
        backgroundColor: "var(--mui-palette-primary-main, #b8653a)",
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
        fontWeight: 500,
        fontSize: "0.875rem",
        transition: transitions.color,
        "&.Mui-selected": {
          color: "var(--mui-palette-primary-main, #b8653a)",
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
      root: { borderColor: "var(--mui-palette-divider, #ece5d8)" },
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
            borderColor: "var(--mui-palette-text-secondary, #8c8172)",
          },
        },
        "&.Mui-focused": {
          boxShadow: "0 0 0 3px rgba(184, 101, 58, 0.12)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderWidth: 2,
            borderColor: "var(--mui-palette-primary-main, #b8653a)",
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
