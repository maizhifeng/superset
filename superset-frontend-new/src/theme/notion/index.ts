import type { Theme } from "@mui/material/styles";
import { createAppTheme } from "@/theme/createAppTheme";
import { notionPalette } from "./palette";

/**
 * notion 主题 = 纸本设计系统 + notion 调色板。
 *
 * 除调色板外不定义任何自己的字体、圆角、间距或组件覆写：主题之间必须
 * 保持同一套属性策略，避免同一控件在不同主题下呈现不同密度/形状。
 */

let cachedNotionTheme: Theme | null = null;

export function createNotionTheme(): Theme {
  if (!cachedNotionTheme) {
    cachedNotionTheme = createAppTheme(notionPalette);
  }
  return cachedNotionTheme;
}

export { notionPalette } from "./palette";
export { cardAccents } from "./cardAccents";
