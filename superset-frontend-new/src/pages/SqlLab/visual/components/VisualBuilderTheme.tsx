import { useMemo, type ReactNode } from "react";
import { ThemeProvider, useTheme, type Theme } from "@mui/material/styles";

/**
 * 可视化 SQL 组装器的紧凑主题：仅在组装器子树（含其弹窗/菜单等 Portal）
 * 内缩小控件高度、字号、内边距，不影响页面其余区域。
 *
 * 通过浅合并当前主题的 `components` 得到局部主题，保留调色板 / CSS 变量 /
 * 明暗模式等全局配置，只覆盖与密度相关的槽位。
 */

interface CompactComponentOptions {
  defaultProps?: Record<string, unknown>;
  styleOverrides?: Record<string, unknown>;
}

type CompactComponents = Record<string, CompactComponentOptions>;

const COMPACT_COMPONENTS: CompactComponents = {
  MuiButton: {
    styleOverrides: {
      sizeSmall: {
        minHeight: 26,
        padding: "2px 9px",
        fontSize: "0.75rem",
        lineHeight: 1.5,
        borderRadius: 6,
      },
      startIcon: {
        marginRight: 4,
        marginLeft: 0,
        "& > *:nth-of-type(1)": { fontSize: 14 },
      },
      endIcon: {
        marginLeft: 4,
        marginRight: 0,
        "& > *:nth-of-type(1)": { fontSize: 14 },
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      sizeSmall: { padding: 3, borderRadius: 5 },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      // 紧凑密度必须显式收回根节点高度：若基础设计系统给输入框写死高度，
      // 只补 minHeight 压不过 height（height 优先于 min-height）。
      root: {
        borderRadius: 6,
        height: "auto",
        minHeight: 30,
        fontSize: "0.75rem",
      },
      input: {
        padding: "5px 9px",
        fontSize: "0.75rem",
        height: "auto",
        boxSizing: "border-box",
      },
      notchedOutline: { top: -3, "& legend": { fontSize: "0.75em" } },
    },
  },
  MuiInputBase: {
    styleOverrides: {
      root: { fontSize: "0.75rem" },
    },
  },
  MuiSelect: {
    styleOverrides: {
      select: {
        minHeight: "0 !important",
        padding: "5px 26px 5px 9px",
        fontSize: "0.75rem",
      },
      icon: { fontSize: 18, right: 6 },
    },
  },
  MuiInputLabel: {
    styleOverrides: {
      root: { fontSize: "0.75rem" },
      sizeSmall: {
        transform: "translate(12px, 6px) scale(1)",
        "&.MuiInputLabel-shrink": {
          transform: "translate(12px, -9px) scale(0.75)",
        },
      },
    },
  },
  MuiAutocomplete: {
    styleOverrides: {
      input: { fontSize: "0.75rem" },
      option: {
        fontSize: "0.75rem",
        minHeight: 28,
        paddingTop: 3,
        paddingBottom: 3,
      },
    },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: {
        fontSize: "0.75rem",
        minHeight: 28,
        paddingTop: 3,
        paddingBottom: 3,
      },
    },
  },
  MuiListSubheader: {
    styleOverrides: {
      root: { fontSize: "0.6875rem", lineHeight: "24px" },
    },
  },
  MuiFormHelperText: {
    styleOverrides: {
      root: { fontSize: "0.6875rem", margin: "2px 8px 0" },
    },
  },
  MuiTypography: {
    styleOverrides: {
      subtitle2: { fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.4 },
      body2: { fontSize: "0.75rem", lineHeight: 1.45 },
      caption: { fontSize: "0.6875rem", lineHeight: 1.35 },
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: {
        padding: "2px 8px",
        fontSize: "0.75rem",
        borderRadius: 6,
        alignItems: "center",
      },
      message: { padding: 0, fontSize: "0.75rem" },
      icon: { fontSize: 16, marginRight: 6, padding: "4px 0" },
      action: { padding: 0, marginRight: 0, alignItems: "center" },
    },
  },
  MuiCheckbox: {
    styleOverrides: {
      root: { padding: 4 },
    },
  },
  MuiChip: {
    styleOverrides: {
      sizeSmall: { height: 18, fontSize: "0.625rem" },
    },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { fontSize: "0.6875rem", padding: "4px 8px" },
    },
  },
  MuiDialogTitle: {
    styleOverrides: {
      root: { padding: "12px 16px 4px", fontSize: "0.9375rem" },
    },
  },
  MuiDialogContent: {
    styleOverrides: {
      root: { padding: "4px 16px 8px" },
    },
  },
  MuiDialogActions: {
    styleOverrides: {
      root: { padding: "4px 16px 12px" },
    },
  },
};

type Components = NonNullable<Theme["components"]>;

function mergeStyleOverrides(base: unknown, patch: unknown): unknown {
  if (
    typeof base !== "object" ||
    base === null ||
    typeof patch !== "object" ||
    patch === null
  ) {
    return patch;
  }
  return {
    ...(base as Record<string, unknown>),
    ...(patch as Record<string, unknown>),
  };
}

function mergeComponents(
  base: Components | undefined,
  patch: CompactComponents,
): Components {
  const merged = {
    ...(base as unknown as Record<string, CompactComponentOptions>),
  };
  for (const [name, options] of Object.entries(patch)) {
    const current = merged[name] ?? {};
    const styleOverrides: Record<string, unknown> = {
      ...(current.styleOverrides ?? {}),
    };
    for (const [slot, styles] of Object.entries(options.styleOverrides ?? {})) {
      styleOverrides[slot] = mergeStyleOverrides(styleOverrides[slot], styles);
    }
    merged[name] = {
      ...current,
      ...options,
      ...(current.defaultProps || options.defaultProps
        ? {
            defaultProps: {
              ...(current.defaultProps ?? {}),
              ...(options.defaultProps ?? {}),
            },
          }
        : {}),
      styleOverrides,
    };
  }
  return merged;
}

export default function VisualBuilderTheme({
  children,
}: {
  children: ReactNode;
}) {
  const theme = useTheme();
  const compactTheme = useMemo<Theme>(
    () => ({
      ...theme,
      components: mergeComponents(theme.components, COMPACT_COMPONENTS),
    }),
    [theme],
  );
  return <ThemeProvider theme={compactTheme}>{children}</ThemeProvider>;
}
