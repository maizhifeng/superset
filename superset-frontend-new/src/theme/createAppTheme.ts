import type { Theme, ThemeOptions } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";
import components from "./components";
import typography from "./typography";

/**
 * 两个主题共用的设计系统配置。
 *
 * 主题之间只允许调色板不同：字体/字号、圆角、间距、组件样式、动效等
 * 全部在这里定义一次。这样切换主题不会改变任何密度或形状策略，也不会
 * 出现「同一组件在纸本主题下是 30px、在 notion 主题下是 44px」这类
 * 只在某一个主题里成立的覆盖。
 */

const baseShape = { borderRadius: 8 } as const;
const baseSpacing = 8;

/** 用共用设计系统 + 指定调色板创建应用主题（换主题 = 换调色板）。 */
export function createAppTheme(
  palette: NonNullable<ThemeOptions["palette"]>,
): Theme {
  return createTheme({
    cssVariables: { colorSchemeSelector: "data" },
    palette,
    typography,
    shape: baseShape,
    spacing: baseSpacing,
    components,
  });
}
