import { createTheme } from "@mui/material/styles";
import { supersetPalette } from "./palette";
import typography from "./typography";
import components from "./components";
import { vibrantPalette } from "./vibrantPalette";
import vibrantTypography from "./vibrantTypography";
import vibrantComponents from "./vibrantComponents";
import type { ThemeMode } from "@/store/themeStore";

const baseShape = { borderRadius: 8 } as const;
const baseSpacing = 8;

export function createPaperTheme() {
  return createTheme({
    cssVariables: true,
    colorSchemes: {
      light: {
        palette: supersetPalette,
      },
    },
    typography,
    shape: baseShape,
    spacing: baseSpacing,
    components,
  });
}

export function createVibrantTheme() {
  return createTheme({
    cssVariables: true,
    colorSchemes: {
      light: {
        palette: vibrantPalette,
      },
    },
    typography: vibrantTypography,
    shape: baseShape,
    spacing: baseSpacing,
    components: vibrantComponents,
  });
}

export function getTheme(mode: ThemeMode) {
  return mode === "vibrant" ? createVibrantTheme() : createPaperTheme();
}
