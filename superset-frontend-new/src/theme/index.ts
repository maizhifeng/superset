import type { Theme } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";
import { supersetPalette } from "./palette";
import { vibrantPalette } from "./vibrantPalette";
import typography from "./typography";
import components from "./components";
import type { ThemeMode } from "@/store/themeStore";

const baseShape = { borderRadius: 8 } as const;
const baseSpacing = 8;

let cachedPaperTheme: Theme | null = null;
let cachedVibrantTheme: Theme | null = null;

export function createPaperTheme() {
  if (!cachedPaperTheme) {
    cachedPaperTheme = createTheme({
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
  return cachedPaperTheme;
}

export function createVibrantTheme() {
  if (!cachedVibrantTheme) {
    cachedVibrantTheme = createTheme({
      cssVariables: true,
      colorSchemes: {
        light: {
          palette: vibrantPalette,
        },
      },
      typography,
      shape: baseShape,
      spacing: baseSpacing,
      components,
    });
  }
  return cachedVibrantTheme;
}

export function getTheme(mode: ThemeMode) {
  return mode === "vibrant" ? createVibrantTheme() : createPaperTheme();
}
