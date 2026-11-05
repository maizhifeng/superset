import type { Theme } from "@mui/material/styles";
import { supersetPalette } from "./palette";
import { createNotionTheme } from "./notion";
import { createAppTheme } from "./createAppTheme";
import type { ThemeMode } from "@/store/themeStore";

/**
 * 应用主题入口。
 *
 * 纸本主题与 notion 主题共用同一套设计系统（createAppTheme），只切换
 * 调色板；两个主题之间不允许存在配色以外的属性差异。
 */

let cachedPaperTheme: Theme | null = null;

export function createPaperTheme(): Theme {
  if (!cachedPaperTheme) {
    cachedPaperTheme = createAppTheme(supersetPalette);
  }
  return cachedPaperTheme;
}

export function getTheme(mode: ThemeMode): Theme {
  if (mode === "notion") return createNotionTheme();
  return createPaperTheme();
}
