import type { Theme } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";
import { notionPalette } from "./palette";
import typography from "./typography";
import notionComponents from "./components";
import { notionShape } from "./shape";

let cachedNotionTheme: Theme | null = null;

export function createNotionTheme() {
  if (!cachedNotionTheme) {
    cachedNotionTheme = createTheme({
      cssVariables: { colorSchemeSelector: "data" },
      palette: notionPalette,
      typography,
      shape: { borderRadius: notionShape.borderRadius },
      spacing: 8,
      components: notionComponents,
    });
  }
  return cachedNotionTheme;
}

export { notionPalette } from "./palette";
export { cardAccents } from "./cardAccents";
