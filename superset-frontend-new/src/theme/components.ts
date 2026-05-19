const quick = "150ms cubic-bezier(0.2, 0, 0, 1)";
const standard = "200ms cubic-bezier(0, 0, 0.2, 1)";

export default {
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        backgroundColor: "#f5f5f5",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        lineHeight: 1.5,
        minHeight: "100vh",
        margin: 0,
      },
    },
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
        transition: `background-color ${quick}, box-shadow ${quick}`,
      },
      contained: {
        boxShadow: "none",
        "&:hover": {
          boxShadow: "var(--mui-palette-shadow-md, 0 4px 8px rgba(0,0,0,0.12))",
        },
      },
      outlined: {
        borderColor: "#d0d0d0",
        "&:hover": {
          backgroundColor: "rgba(0,0,0,0.04)",
          borderColor: "#b0b0b0",
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
        transition: `box-shadow ${standard}, transform ${standard}`,
        "&:hover": {
          transform: "translateY(-1px)",
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
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 12,
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
        borderBottom: "1px solid #e0e0e0",
      },
      body: {
        fontSize: "0.875rem",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        "& .MuiTableCell-head": {
          backgroundColor: "#f0f4f5",
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
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e0e0e0",
        color: "#1a1a1a",
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        transition: `background-color ${quick}, transform ${quick}`,
        "&:hover": {
          backgroundColor: "rgba(0,0,0,0.04)",
          transform: "scale(1.08)",
        },
        "&:active": { transform: "scale(0.95)" },
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      indicator: {
        backgroundColor: "#20a7c9",
        transition: `transform ${standard}`,
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        textTransform: "none",
        fontWeight: 500,
        fontSize: "0.875rem",
        transition: `color ${quick}`,
        "&.Mui-selected": { color: "#20a7c9" },
      },
    },
  },
  MuiSwitch: {
    styleOverrides: {
      switchBase: { transition: `transform ${quick}` },
    },
  },
  MuiDivider: {
    styleOverrides: { root: { borderColor: "#e0e0e0" } },
  },
  MuiSkeleton: {
    styleOverrides: { root: { borderRadius: 6 } },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: { fontSize: "0.8125rem", transition: `background-color ${quick}` },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: { borderRadius: 8, transition: `background-color ${quick}` },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        transition: `border-color ${quick}, box-shadow ${quick}`,
        "&.Mui-focused": {
          "& .MuiOutlinedInput-notchedOutline": {
            borderWidth: 2,
            borderColor: "#20a7c9",
          },
        },
      },
    },
  },
  MuiCheckbox: {
    styleOverrides: {
      root: { transition: `color ${quick}` },
    },
  },
  MuiBreadcrumbs: {
    styleOverrides: {
      root: { fontSize: "0.8125rem" },
    },
  },
};
