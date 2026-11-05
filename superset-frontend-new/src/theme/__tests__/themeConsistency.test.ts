import { test, expect } from "vitest";
import { getTheme } from "@/theme";

/**
 * 主题策略：纸本与 notion 只允许调色板不同。
 *
 * 字体/字号、圆角、间距、组件样式（含密度与动效）必须共用同一套设计
 * 系统配置；否则同一控件会在两个主题下呈现不同尺寸、形状或节奏，进而
 * 需要为每个主题分别兜底。
 */

const TYPOGRAPHY_VARIANTS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "subtitle1",
  "subtitle2",
  "body1",
  "body2",
  "button",
  "caption",
  "overline",
] as const;

test("两个主题的字体与字号体系一致", () => {
  const paper = getTheme("paper");
  const notion = getTheme("notion");
  expect(notion.typography.fontFamily).toBe(paper.typography.fontFamily);
  for (const variant of TYPOGRAPHY_VARIANTS) {
    expect(notion.typography[variant]).toEqual(paper.typography[variant]);
  }
});

test("两个主题的圆角与间距策略一致", () => {
  const paper = getTheme("paper");
  const notion = getTheme("notion");
  expect(notion.shape).toEqual(paper.shape);
  for (const factor of [0, 1, 2, 4]) {
    expect(notion.spacing(factor)).toBe(paper.spacing(factor));
  }
});

test("两个主题的组件覆写（形状/密度/动效）一致", () => {
  const paper = getTheme("paper");
  const notion = getTheme("notion");
  expect(notion.components).toEqual(paper.components);
});

test("两个主题的调色板不同", () => {
  const paper = getTheme("paper");
  const notion = getTheme("notion");
  expect(notion.palette.primary.main).not.toBe(paper.palette.primary.main);
  expect(notion.palette.background.default).not.toBe(
    paper.palette.background.default,
  );
});

test("两个调色板的 token 结构一致", () => {
  const paper = getTheme("paper").palette as unknown as Record<
    string,
    Record<string, string>
  >;
  const notion = getTheme("notion").palette as unknown as Record<
    string,
    Record<string, string>
  >;
  // 共用组件样式通过 var(--mui-palette-*) 取这些自定义 token；两个调色板
  // 必须暴露完全相同的 token 结构，否则某个主题下会出现空值样式。
  for (const token of ["surface", "bg", "border", "shadow", "status", "accent"]) {
    expect(Object.keys(notion[token]).sort()).toEqual(
      Object.keys(paper[token]).sort(),
    );
  }
  expect(Object.keys(notion).sort()).toEqual(Object.keys(paper).sort());
});
