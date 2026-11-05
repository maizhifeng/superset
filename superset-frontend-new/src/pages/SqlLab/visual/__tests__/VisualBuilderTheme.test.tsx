import { render } from "@testing-library/react";
import { ThemeProvider, useTheme, type Theme } from "@mui/material/styles";
import { test, expect } from "vitest";
import { getTheme } from "@/theme";
import VisualBuilderTheme from "@/pages/SqlLab/visual/components/VisualBuilderTheme";
import type { ThemeMode } from "@/store/themeStore";

/**
 * 组装器的紧凑主题按「基础主题 → 紧凑覆盖」的顺序合并组件样式。
 * 基础设计系统里与密度相关的声明（例如给 OutlinedInput 根节点写死的
 * 固定高度）必须被紧凑值压住，否则组装器的密度会随基础配置漂移。
 */

const MODES: ThemeMode[] = ["paper", "notion"];

interface Captured {
  theme?: Theme;
}

function compactThemeOf(mode: ThemeMode): Theme {
  const captured: Captured = {};
  function ThemeProbe() {
    captured.theme = useTheme();
    return null;
  }
  render(
    <ThemeProvider theme={getTheme(mode)}>
      <VisualBuilderTheme>
        <ThemeProbe />
      </VisualBuilderTheme>
    </ThemeProvider>,
  );
  if (!captured.theme) throw new Error("紧凑主题未挂载");
  return captured.theme;
}

type StyleOverrides = Record<string, Record<string, unknown>>;

function overridesOf(theme: Theme, component: string): StyleOverrides {
  const config = (
    theme.components as Record<
      string,
      { styleOverrides?: StyleOverrides } | undefined
    >
  )[component];
  return config?.styleOverrides ?? {};
}

test.each(MODES)(
  "%s 主题：输入框根节点显式收回主题写死的高度",
  (mode) => {
    const root = overridesOf(compactThemeOf(mode), "MuiOutlinedInput").root;
    expect(root).toMatchObject({ height: "auto", minHeight: 30 });
  },
);

test.each(MODES)("%s 主题：输入框内部元素保持紧凑", (mode) => {
  const input = overridesOf(compactThemeOf(mode), "MuiOutlinedInput").input;
  expect(input).toMatchObject({
    height: "auto",
    padding: "5px 9px",
    fontSize: "0.75rem",
  });
  const root = overridesOf(compactThemeOf(mode), "MuiOutlinedInput").root;
  expect(root).toMatchObject({ borderRadius: 6, fontSize: "0.75rem" });
});

test.each(MODES)("%s 主题：紧凑化保留主题自身的焦点样式", (mode) => {
  const root = overridesOf(compactThemeOf(mode), "MuiOutlinedInput").root;
  // 两个主题都给聚焦态加投影（值不同），紧凑化只能叠加密度槽位，
  // 不能把主题已有的配色/焦点声明整体覆盖掉。
  const focused = root["&.Mui-focused"] as Record<string, unknown>;
  expect(focused.boxShadow).toBe("var(--mui-palette-shadow-focus)");
});
