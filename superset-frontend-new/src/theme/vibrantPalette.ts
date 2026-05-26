// Safe, professional palette inspired by AppsFlyer's design system.
// Primary: AppsFlyer purple + dark/light variants.
// Supporting colors: Tailwind's professionally designed, WCAG-compliant scale.
// Neutrals: Tailwind slate scale.

const primary = "#6C5CE7";
const primaryLight = "#A29BFE";
const primaryDark = "#4A38D6";

export const vibrantPalette = {
  mode: "light" as const,
  primary: {
    main: primary,
    light: primaryLight,
    dark: primaryDark,
    container: "#EDE9FE",
    onContainer: "#3B27B0",
    contrastText: "#ffffff",
  },
  secondary: {
    main: "#0D9488",
    light: "#14B8A6",
    dark: "#0F766E",
    container: "#F0FDFA",
    onContainer: "#134E4A",
    contrastText: "#ffffff",
  },
  error: {
    main: "#DC2626",
    light: "#FEF2F2",
    container: "#FEF2F2",
    onContainer: "#7F1D1D",
    contrastText: "#ffffff",
  },
  warning: {
    main: "#D97706",
    contrastText: "#ffffff",
  },
  success: {
    main: "#059669",
    light: "#ECFDF5",
    container: "#ECFDF5",
    onContainer: "#064E3B",
    contrastText: "#ffffff",
  },
  info: {
    main: "#2563EB",
    contrastText: "#ffffff",
  },
  background: {
    default: "#F8FAFC",
    paper: "#ffffff",
  },
  surface: {
    main: "#ffffff",
    variant: "#F1F5F9",
  },
  text: {
    primary: "#1E293B",
    secondary: "#64748B",
    disabled: "#94A3B8",
  },
  divider: "#E2E8F0",
  outline: "#CBD5E1",
  action: {
    hover: "rgba(108, 92, 231, 0.08)",
    selected: "rgba(108, 92, 231, 0.12)",
    focus: "rgba(108, 92, 231, 0.14)",
    disabled: "rgba(30, 41, 59, 0.26)",
    disabledBackground: "rgba(30, 41, 59, 0.08)",
  },
  bg: {
    page: "#F8FAFC",
    sidebar: "#F1F5F9",
    card: "#ffffff",
    header: "#F1F5F9",
    hover: "rgba(108, 92, 231, 0.08)",
    selected: "rgba(108, 92, 231, 0.12)",
    muted: "rgba(30, 41, 59, 0.04)",
  },
  border: {
    light: "rgba(30, 41, 59, 0.06)",
    medium: "rgba(30, 41, 59, 0.12)",
    strong: "rgba(30, 41, 59, 0.18)",
  },
  shadow: {
    sm: "0 1px 2px rgba(30,41,59,0.03), 0 1px 3px rgba(30,41,59,0.04)",
    md: "0 2px 4px rgba(30,41,59,0.03), 0 6px 16px rgba(30,41,59,0.06)",
    lg: "0 4px 8px rgba(30,41,59,0.03), 0 12px 32px rgba(30,41,59,0.07)",
    card: "0 1px 2px rgba(108,92,231,0.02), 0 2px 6px rgba(108,92,231,0.04), 0 4px 12px rgba(30,41,59,0.03)",
    cardHover: "0 2px 4px rgba(108,92,231,0.04), 0 8px 20px rgba(108,92,231,0.07), 0 12px 32px rgba(30,41,59,0.05)",
    focus: "0 0 0 3px rgba(108, 92, 231, 0.25)",
    glow: "0 0 0 2px rgba(108, 92, 231, 0.15), 0 0 16px rgba(108, 92, 231, 0.08)",
  },
  status: {
    success: "#059669",
    successBg: "rgba(5, 150, 105, 0.1)",
    warning: "#D97706",
    warningBg: "rgba(217, 119, 6, 0.1)",
    error: "#DC2626",
    errorBg: "rgba(220, 38, 38, 0.1)",
  },
};

// Subtle accent colors for card variety — still safe, muted, accessible
export const cardAccents = [
  "#6C5CE7",
  "#0D9488",
  "#2563EB",
  "#7C3AED",
  "#0891B2",
] as const;
