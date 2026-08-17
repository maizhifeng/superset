import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LightMdRenderer from "@/components/LightMdRenderer";

function renderText(content: string): string {
  const { container } = render(<LightMdRenderer content={content} />);
  return container.textContent ?? "";
}

test("renders escaped underscores without backslash in table cells", () => {
  render(
    <LightMdRenderer
      content={[
        "| 游戏 | 消耗 |",
        "| --- | --- |",
        "| mini\\_game | 1000 |",
        "| LTV\\_1 | 2000 |",
      ].join("\n")}
    />,
  );
  const cells = screen.getAllByRole("cell").map((c) => c.textContent);
  expect(cells).toContain("mini_game");
  expect(cells).toContain("LTV_1");
  expect(cells.some((c) => c?.includes("\\"))).toBe(false);
});

test("renders escaped pipes inside table cells", () => {
  render(
    <LightMdRenderer
      content={["| 名称 |", "| --- |", "| A\\|B |"].join("\n")}
    />,
  );
  const cells = screen.getAllByRole("cell").map((c) => c.textContent);
  expect(cells).toContain("A|B");
  expect(cells.some((c) => c?.includes("\\"))).toBe(false);
});

test("renders escaped asterisks as plain text", () => {
  expect(renderText("消耗 \\* 占比")).toBe("消耗 * 占比");
});

test("double backslash collapses to a single backslash", () => {
  expect(renderText("路径 C:\\\\dir")).toBe("路径 C:\\dir");
});

test("escaped markdown punctuation in bold text", () => {
  expect(renderText("**mini\\_game 消耗**")).toBe("mini_game 消耗");
});

test("escaped underscores in a paragraph", () => {
  expect(renderText("mini\\_game 平台")).toBe("mini_game 平台");
});
