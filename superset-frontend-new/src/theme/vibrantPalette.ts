// Google-inspired vibrant palette with iconic four-color scheme.
// Blue, Red, Yellow, Green — the classic Google color identity.
// Each color is distinct and recognizable, creating a truly vibrant feel.

const primary = "#4285F4";
const primaryLight = "#669DF6";
const primaryDark = "#1A73E8";

export const vibrantPalette = {
  mode: "light" as const,
  primary: {
    main: primary,
    light: primaryLight,
    dark: primaryDark,
    container: "#E8F0FE",
    onContainer: "#174EA6",
    contrastText: "#ffffff",
  },
  secondary: {
    main: "#EA4335",
    light: "#F28B82",
    dark: "#C5221F",
    container: "#FCE8E6",
    onContainer: "#A50E0E",
    contrastText: "#ffffff",
  },
  error: {
    main: "#EA4335",
    light: "#FCE8E6",
    container: "#FCE8E6",
    onContainer: "#A50E0E",
    contrastText: "#ffffff",
  },
  warning: {
    main: "#FBBC05",
    contrastText: "#202124",
  },
  success: {
    main: "#34A853",
    light: "#E6F4EA",
    container: "#E6F4EA",
    onContainer: "#137333",
    contrastText: "#ffffff",
  },
  info: {
    main: "#4285F4",
    contrastText: "#ffffff",
  },
  background: {
    default: "#F8F9FA",
    paper: "#ffffff",
  },
  surface: {
    main: "#ffffff",
    variant: "#F1F3F4",
  },
  text: {
    primary: "#202124",
    secondary: "#5F6368",
    disabled: "#9AA0A6",
  },
  divider: "#DADCE0",
  outline: "#BDC1C6",
  action: {
    hover: "rgba(66, 133, 244, 0.04)",
    selected: "rgba(66, 133, 244, 0.08)",
    focus: "rgba(66, 133, 244, 0.12)",
    disabled: "rgba(32, 33, 36, 0.38)",
    disabledBackground: "rgba(32, 33, 36, 0.12)",
  },
  bg: {
    page: "#F8F9FA",
    sidebar: "#F1F3F4",
    card: "#ffffff",
    header: "#F1F3F4",
    hover: "rgba(66, 133, 244, 0.04)",
    selected: "rgba(66, 133, 244, 0.08)",
    muted: "rgba(32, 33, 36, 0.04)",
  },
  border: {
    light: "rgba(32, 33, 36, 0.06)",
    medium: "rgba(32, 33, 36, 0.12)",
    strong: "rgba(32, 33, 36, 0.18)",
  },
  shadow: {
    sm: "0 1px 2px rgba(32,33,36,0.04), 0 1px 3px rgba(32,33,36,0.08)",
    md: "0 2px 4px rgba(32,33,36,0.04), 0 6px 16px rgba(32,33,36,0.08)",
    lg: "0 4px 8px rgba(32,33,36,0.04), 0 12px 32px rgba(32,33,36,0.08)",
    card: "0 1px 2px rgba(32,33,36,0.02), 0 2px 6px rgba(32,33,36,0.06)",
    cardHover: "0 2px 4px rgba(32,33,36,0.04), 0 8px 24px rgba(32,33,36,0.08)",
    focus: "0 0 0 3px rgba(66, 133, 244, 0.25)",
    glow: "0 0 0 2px rgba(66, 133, 244, 0.15), 0 0 16px rgba(66, 133, 244, 0.08)",
  },
  status: {
    success: "#34A853",
    successBg: "rgba(52, 168, 83, 0.1)",
    warning: "#FBBC05",
    warningBg: "rgba(251, 188, 5, 0.1)",
    error: "#EA4335",
    errorBg: "rgba(234, 67, 53, 0.1)",
  },
};

// Google's iconic four-color palette for card accents
export const cardAccents = [
  "#4285F4", // Google Blue
  "#EA4335", // Google Red
  "#FBBC05", // Google Yellow
  "#34A853", // Google Green
  "#5F6368", // Google Gray
] as const;
