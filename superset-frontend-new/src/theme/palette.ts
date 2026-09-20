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
  // Error sits far enough from ``primary`` (both are warm reds) to stay
  // distinguishable when the two are used side by side on the same screen.
  error: {
    main: "#a8321f",
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
    main: "#417a52",
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
    default: "#faf7f2",
    paper: "#ffffff",
  },
  surface: {
    main: "#fefdfa",
    variant: "#f2ece2",
  },
  text: {
    primary: "#2c2416",
    // Dark enough to clear WCAG AA (4.5:1) on both paper and the page wash —
    // this token carries captions, table headers and chart axis labels.
    secondary: "#6b6152",
    disabled: "#9c948a",
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
    page: "#faf7f2",
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
    cardHover:
      "0 2px 4px rgba(44,36,22,0.03), 0 4px 12px rgba(44,36,22,0.05), 0 8px 24px rgba(184,101,58,0.04)",
    focus: "0 0 0 3px rgba(184, 101, 58, 0.2)",
    glow: "0 0 0 2px rgba(184, 101, 58, 0.12), 0 0 16px rgba(184, 101, 58, 0.06)",
    drawer: "2px 0 8px rgba(44,36,22,0.06)",
    popover: "0 4px 16px rgba(44,36,22,0.12)",
    modal: "0 8px 24px rgba(44,36,22,0.14)",
    snackbar: "0 4px 12px rgba(44,36,22,0.1), 0 8px 24px rgba(44,36,22,0.08)",
    backdrop: "rgba(44, 36, 22, 0.35)",
  },
  status: {
    success: "#417a52",
    successBg: "rgba(65, 122, 82, 0.1)",
    warning: "#c9a04a",
    warningBg: "rgba(201, 160, 74, 0.1)",
    error: "#a8321f",
    errorBg: "rgba(168, 50, 31, 0.1)",
    info: "#7a9eb3",
    infoBg: "rgba(122, 158, 179, 0.1)",
  },
  chart: [
    "#b8653a",
    "#2a9d99",
    "#c9a04a",
    "#417a52",
    "#7a9eb3",
    // Deep plum: the sixth series has to stay separable from the success green
    // (#417a52) in charts that mix bars and lines, so it differs in both hue
    // and lightness (1.7:1 between the two, 8.7:1 on paper).
    "#5d3f74",
    "#a8321f",
    "#6a7b5c",
  ],
  accent: {
    sky: "#62aef0",
    purple: "#9c5b8a",
    pink: "#d65a8e",
    orange: "#dd5b00",
    teal: "#2a9d99",
    green: "#1aae39",
  },
};
