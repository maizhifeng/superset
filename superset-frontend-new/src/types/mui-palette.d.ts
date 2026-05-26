import type {
  PaletteColor,
  TypeBackground,
} from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    surface: PaletteSurface;
    bg: PaletteBg;
    border: PaletteBorder;
    shadow: PaletteShadow;
    status: PaletteStatus;
  }

  interface PaletteColor {
    container?: string;
    onContainer?: string;
  }

  interface TypeBackground {
    default: string;
    paper: string;
  }

  interface SimplePaletteColorOptions {
    container?: string;
    onContainer?: string;
  }
}

interface PaletteSurface {
  main: string;
  variant: string;
}

interface PaletteBg {
  page: string;
  sidebar: string;
  card: string;
  header: string;
  hover: string;
  selected: string;
  muted: string;
}

interface PaletteBorder {
  light: string;
  medium: string;
  strong: string;
}

interface PaletteShadow {
  sm: string;
  md: string;
  lg: string;
  card: string;
  cardHover: string;
  focus: string;
  glow: string;
}

interface PaletteStatus {
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
}

declare module "@mui/material/styles/createPalette" {
  interface Palette {
    surface: PaletteSurface;
    bg: PaletteBg;
    border: PaletteBorder;
    shadow: PaletteShadow;
    status: PaletteStatus;
  }

  interface PaletteColor {
    container?: string;
    onContainer?: string;
  }
}
