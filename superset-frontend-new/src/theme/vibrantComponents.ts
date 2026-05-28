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
        borderRadius: 6,
        transition: `${transitions.backgroundColor}, ${t("box-shadow", timing.quick)}`,
      },
      containedPrimary: {
        boxShadow: "0 1px 3px rgba(66,133,244,0.2)",
        background: "linear-gradient(135deg, #4285F4 0%, #1A73E8 100%)",
        "&:hover": {
          boxShadow: "0 2px 8px rgba(66,133,244,0.3)",
          background: "linear-gradient(135deg, #1A73E8 0%, #1557B0 100%)",
        },
      },
      containedSecondary: {
        boxShadow: "0 1px 3px rgba(234,67,53,0.2)",
        background: "linear-gradient(135deg, #EA4335 0%, #C5221F 100%)",
        "&:hover": {
          boxShadow: "0 2px 8px rgba(234,67,53,0.3)",
          background: "linear-gradient(135deg, #C5221F 0%, #A50E0E 100%)",
        },
      },
      outlined: {
        borderColor: "var(--mui-palette-divider, #DADCE0)",
        "&:hover": {
          backgroundColor: "rgba(66,133,244,0.04)",
          borderColor: "var(--mui-palette-primary-main, #4285F4)",
        },
      },
      text: {
        "&:hover": { backgroundColor: "rgba(66, 133, 244, 0.04)" },
      },
      sizeSmall: { padding: "4px 10px", fontSize: "0.8125rem" },
      sizeMedium: { padding: "6px 16px" },
      sizeLarge: { padding: "10px 24px", fontSize: "1rem" },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        border: "1px solid var(--mui-palette-border-light, rgba(32,33,36,0.06))",
        borderRadius: 8,
        backgroundColor: "var(--mui-palette-surface-main, #ffffff)",
        boxShadow:
          "var(--mui-palette-shadow-card, 0 1px 2px rgba(32,33,36,0.02), 0 2px 6px rgba(32,33,36,0.06))",
        transition: `${transitions.boxShadow}, ${t("transform", timing.quick)}`,
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow:
            "var(--mui-palette-shadow-cardHover, 0 2px 4px rgba(32,33,36,0.04), 0 8px 24px rgba(32,33,36,0.08))",
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
          backgroundColor: "rgba(66,133,244,0.04)",
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 8,
        boxShadow: "0 4px 8px rgba(32,33,36,0.04), 0 12px 40px rgba(32,33,36,0.08)",
      },
    },
  },
  MuiBackdrop: {
    styleOverrides: {
      root: {
        backgroundColor: "rgba(32, 33, 36, 0.32)",
        backdropFilter: "blur(2px)",
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: { root: { padding: "24px 24px 8px", fontWeight: 500 } },
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
        fontWeight: 500,
        fontSize: "0.8125rem",
        borderBottom: "1px solid var(--mui-palette-divider, #DADCE0)",
      },
      body: {
        fontSize: "0.875rem",
        borderBottom: "1px solid var(--mui-palette-border-light, rgba(32,33,36,0.06))",
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        "& .MuiTableCell-head": {
          backgroundColor: "var(--mui-palette-surface-variant, #F1F3F4)",
        },
      },
    },
  },
  MuiChip: {
    styleOverrides: { root: { fontWeight: 500, borderRadius: 6 } },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { fontSize: "0.75rem", borderRadius: 4 },
    },
  },
  MuiAppBar: {
    styleOverrides: {
      root: {
        boxShadow: "0 1px 0 rgba(32,33,36,0.1)",
        backgroundColor: "var(--mui-palette-background-paper, #ffffff)",
        borderBottom: "1px solid var(--mui-palette-divider, #DADCE0)",
        color: "var(--mui-palette-text-primary, #202124)",
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        transition: `${transitions.backgroundColor}, ${t("transform", timing.quick)}`,
        "&:hover": {
          backgroundColor: "rgba(66,133,244,0.04)",
          transform: "scale(1.04)",
        },
        "&:active": { transform: "scale(0.96)" },
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      indicator: {
        backgroundColor: "var(--mui-palette-primary-main, #4285F4)",
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
          color: "var(--mui-palette-primary-main, #4285F4)",
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
      root: { borderColor: "var(--mui-palette-divider, #DADCE0)" },
    },
  },
  MuiSkeleton: {
    styleOverrides: { root: { borderRadius: 4 } },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: {
        fontSize: "0.8125rem",
        transition: transitions.backgroundColor,
        borderRadius: 4,
        margin: "0 4px",
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
            borderColor: "var(--mui-palette-text-secondary, #5F6368)",
          },
        },
        "&.Mui-focused": {
          boxShadow: "0 0 0 2px rgba(66, 133, 244, 0.2)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderWidth: 2,
            borderColor: "var(--mui-palette-primary-main, #4285F4)",
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
