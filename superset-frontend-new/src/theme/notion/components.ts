import type { Theme } from "@mui/material/styles";
import { transitions, timing } from "@/theme/motion";

const t = (prop: string, val: string) => `${prop} ${val}`;

export default {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        textTransform: "none",
        fontWeight: 500,
        fontSize: "1rem",
        letterSpacing: 0,
        borderRadius: 8,
        padding: "10px 18px",
        transition: `${transitions.backgroundColor}, ${t("box-shadow", timing.quick)}`,
      },
      contained: {
        boxShadow: "none",
        "&:hover": { boxShadow: "var(--mui-palette-shadow-md)" },
      },
      outlined: {
        borderRadius: 9999,
        padding: "10px 20px",
        borderColor: "var(--mui-palette-divider)",
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover)",
          borderColor: "var(--mui-palette-text-secondary)",
        },
      },
      text: {
        "&:hover": { backgroundColor: "var(--mui-palette-action-hover)" },
        borderRadius: 9999,
        padding: "10px 20px",
      },
      sizeSmall: { padding: "4px 10px", fontSize: "0.875rem" },
      sizeMedium: { padding: "10px 18px", fontSize: "1rem" },
      sizeLarge: { padding: "12px 24px", fontSize: "1.125rem" },
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
      },
    },
  },
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: { backgroundImage: "none" },
      rounded: { borderRadius: 8 },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: 4,
        height: 44,
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
      input: {
        padding: "10px 16px",
        height: 44,
        boxSizing: "border-box" as const,
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: { fontWeight: 600, borderRadius: 9999, fontSize: "0.75rem" },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: transitions.backgroundColor,
        "&:hover": { backgroundColor: "var(--mui-palette-action-hover)" },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: { borderRadius: 12, boxShadow: "var(--mui-palette-shadow-modal)" },
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
  MuiDialogTitle: { styleOverrides: { root: { padding: "24px 24px 8px" } } },
  MuiDialogContent: { styleOverrides: { root: { padding: "8px 24px 16px" } } },
  MuiDialogActions: { styleOverrides: { root: { padding: "8px 24px 24px" } } },
  MuiTableCell: {
    styleOverrides: {
      head: {
        fontWeight: 600,
        fontSize: "0.75rem",
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
  MuiTooltip: {
    styleOverrides: { tooltip: { fontSize: "0.75rem", borderRadius: 6 } },
  },
  MuiAppBar: {
    styleOverrides: {
      root: {
        boxShadow: "none",
        backgroundColor: "var(--mui-palette-background-paper)",
        borderBottom: "1px solid var(--mui-palette-border-light)",
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
        "&.Mui-selected": { color: "var(--mui-palette-primary-main)" },
      },
    },
  },
  MuiSwitch: {
    styleOverrides: {
      switchBase: { transition: t("transform", timing.quick) },
    },
  },
  MuiDivider: {
    styleOverrides: { root: { borderColor: "var(--mui-palette-divider)" } },
  },
  MuiSkeleton: { styleOverrides: { root: { borderRadius: 6 } } },
  MuiMenuItem: {
    styleOverrides: {
      root: { fontSize: "0.8125rem", transition: transitions.backgroundColor },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: { borderRadius: 8, transition: transitions.backgroundColor },
    },
  },
  MuiCheckbox: { styleOverrides: { root: { transition: transitions.color } } },
  MuiDataGrid: {
    styleOverrides: {
      root: {
        border: "none",
        "--DataGrid-rowBorderColor": "var(--mui-palette-border-light)",
      },
      columnHeaders: {
        backgroundColor: "var(--mui-palette-surface-variant)",
      },
      columnHeader: {
        borderBottom: "1px solid var(--mui-palette-divider)",
      },
      columnHeaderTitle: {
        fontWeight: 600,
        fontSize: "0.75rem",
      },
      row: {
        transition: transitions.backgroundColor,
        "&.Mui-selected": {
          backgroundColor: "var(--mui-palette-action-selected)",
          "&:hover": {
            backgroundColor: "var(--mui-palette-action-selected)",
          },
        },
        "&:hover": {
          backgroundColor: "var(--mui-palette-action-hover)",
        },
      },
      cell: {
        borderColor: "var(--mui-palette-border-light)",
      },
      footerContainer: {
        borderTop: "1px solid var(--mui-palette-divider)",
      },
    },
  },
  MuiBreadcrumbs: { styleOverrides: { root: { fontSize: "0.8125rem" } } },
};
