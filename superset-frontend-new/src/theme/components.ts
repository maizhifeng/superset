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
          boxShadow: "var(--mui-palette-shadow-md)",
        },
      },
      outlined: {
        borderColor: "var(--mui-palette-divider)",
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover)",
          borderColor: "var(--mui-palette-text-secondary)",
        },
      },
      text: {
        "&:hover": { backgroundColor: "var(--mui-palette-action-hover)" },
      },
      sizeSmall: { padding: "4px 10px", fontSize: "0.8125rem" },
      sizeMedium: { padding: "6px 16px" },
      sizeLarge: { padding: "10px 24px", fontSize: "1rem" },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        border: "1px solid var(--mui-palette-border-light)",
        borderRadius: 12,
        backgroundColor: "var(--mui-palette-surface-main)",
        boxShadow: "var(--mui-palette-shadow-card)",
        transition: `${transitions.boxShadow}, ${t("transform", timing.quick)}`,
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: "var(--mui-palette-shadow-cardHover)",
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
          backgroundColor: "var(--mui-palette-action-hover)",
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12,
        boxShadow: "var(--mui-palette-shadow-lg)",
      },
    },
  },
  MuiBackdrop: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        backgroundColor: theme.palette.shadow.backdrop,
        backdropFilter: "blur(3px)",
      }),
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
        borderBottom: "1px solid var(--mui-palette-divider)",
      },
      body: {
        fontSize: "0.875rem",
        borderBottom: "1px solid var(--mui-palette-border-light)",
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        "& .MuiTableCell-head": {
          backgroundColor: "var(--mui-palette-surface-variant)",
        },
      },
    },
  },
  MuiChip: {
    styleOverrides: { root: { fontWeight: 500, borderRadius: 6 } },
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
        backgroundColor: "var(--mui-palette-background-paper)",
        borderBottom: "1px solid var(--mui-palette-divider)",
        color: "var(--mui-palette-text-primary)",
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        transition: `${transitions.backgroundColor}, ${t("transform", timing.quick)}`,
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover)",
          transform: "scale(1.08)",
        },
        "&:active": { transform: "scale(0.95)" },
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      indicator: {
        backgroundColor: "var(--mui-palette-primary-main)",
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
          color: "var(--mui-palette-primary-main)",
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
      root: { borderColor: "var(--mui-palette-divider)" },
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
            borderColor: "var(--mui-palette-text-secondary)",
          },
        },
        "&.Mui-focused": {
          boxShadow: "var(--mui-palette-shadow-focus)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderWidth: 2,
            borderColor: "var(--mui-palette-primary-main)",
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
