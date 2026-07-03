import type { Theme } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";
import { supersetPalette } from "./palette";
import { createNotionTheme } from "./notion";
import typography from "./typography";
import components from "./components";
import type { ThemeMode } from "@/store/themeStore";

const baseShape = { borderRadius: 8 } as const;
const baseSpacing = 8;

let cachedPaperTheme: Theme | null = null;

export function createPaperTheme() {
  if (!cachedPaperTheme) {
    cachedPaperTheme = createTheme({
      cssVariables: { colorSchemeSelector: "data" },
      palette: supersetPalette,
      typography,
      shape: baseShape,
      spacing: baseSpacing,
      components,
    });
  }
  return cachedPaperTheme;
}

export function getTheme(mode: ThemeMode) {
  if (mode === "notion") return createNotionTheme();
  return createPaperTheme();
}
