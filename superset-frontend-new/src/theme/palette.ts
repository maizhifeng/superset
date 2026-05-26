const primary = "#b8653a";
const primaryLight = "#d4895e";
const primaryDark = "#8f4722";

export const supersetPalette = {
  mode: "light" as const,
  primary: {
    main: primary,
    light: primaryLight,
    dark: primaryDark,
    container: "#f5e6dc",
    onContainer: "#5c2b12",
    contrastText: "#ffffff",
  },
  secondary: {
    main: "#7a6f60",
    light: "#9c8f7c",
    dark: "#4a4137",
    container: "#ede7db",
    onContainer: "#2c2416",
    contrastText: "#ffffff",
  },
  error: {
    main: "#c2452e",
    light: "#f7e4e0",
    container: "#f7e4e0",
    onContainer: "#7a1e0e",
    contrastText: "#ffffff",
  },
  warning: {
    main: "#c9a04a",
    contrastText: "#2c2416",
  },
  success: {
    main: "#5a8f6a",
    light: "#e6f0e8",
    container: "#e6f0e8",
    onContainer: "#1a3a22",
    contrastText: "#ffffff",
  },
  info: {
    main: "#7a9eb3",
    contrastText: "#ffffff",
  },
  background: {
    default: "#f7f3ec",
    paper: "#fcfaf5",
  },
  surface: {
    main: "#fefdfa",
    variant: "#f2ece2",
  },
  text: {
    primary: "#2c2416",
    secondary: "#8c8172",
    disabled: "#bfb8aa",
  },
  divider: "#ece5d8",
  outline: "#e6ddcf",
  action: {
    hover: "rgba(184, 101, 58, 0.08)",
    selected: "rgba(184, 101, 58, 0.12)",
    focus: "rgba(184, 101, 58, 0.14)",
    disabled: "rgba(44, 36, 22, 0.26)",
    disabledBackground: "rgba(44, 36, 22, 0.08)",
  },
  bg: {
    page: "#f7f3ec",
    sidebar: "#f5efe6",
    card: "#fefdfa",
    header: "#f2ece2",
    hover: "rgba(184, 101, 58, 0.08)",
    selected: "rgba(184, 101, 58, 0.12)",
    muted: "rgba(44, 36, 22, 0.04)",
  },
  border: {
    light: "rgba(44, 36, 22, 0.05)",
    medium: "rgba(44, 36, 22, 0.10)",
    strong: "rgba(44, 36, 22, 0.14)",
  },
  shadow: {
    sm: "0 1px 2px rgba(44,36,22,0.03), 0 1px 3px rgba(44,36,22,0.04)",
    md: "0 2px 4px rgba(44,36,22,0.03), 0 6px 16px rgba(44,36,22,0.06)",
    lg: "0 4px 8px rgba(44,36,22,0.03), 0 12px 32px rgba(44,36,22,0.06)",
    card: "0 1px 2px rgba(44,36,22,0.02), 0 1px 4px rgba(44,36,22,0.03), 0 2px 8px rgba(44,36,22,0.02)",
    cardHover: "0 2px 4px rgba(44,36,22,0.03), 0 4px 12px rgba(44,36,22,0.05), 0 8px 24px rgba(184,101,58,0.04)",
    focus: "0 0 0 3px rgba(184, 101, 58, 0.2)",
    glow: "0 0 0 2px rgba(184, 101, 58, 0.12), 0 0 16px rgba(184, 101, 58, 0.06)",
  },
  status: {
    success: "#5a8f6a",
    successBg: "rgba(90, 143, 106, 0.1)",
    warning: "#c9a04a",
    warningBg: "rgba(201, 160, 74, 0.1)",
    error: "#c2452e",
    errorBg: "rgba(194, 69, 46, 0.1)",
  },
};
