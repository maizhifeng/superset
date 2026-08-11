import { test, expect } from "vitest";
import {
  tryRenderStructuredContent,
  isValidStructuredOutput,
  renderStructuredOutput,
} from "../renderer.js";

test("renders a ```json fenced block embedded in text", () => {
  const text = [
    "好的，分析如下：",
    "```json",
    '{"summary":"总体结论","tables":[{"title":"表1","headers":["列1"],"rows":[["v1"]]}],"analysis":["要点"],"recommendations":["建议"]}',
    "```",
    "以上。",
  ].join("\n");
  const rendered = tryRenderStructuredContent(text);
  expect(rendered).not.toBeNull();
  expect(rendered).toContain("总体结论");
  expect(rendered).toContain("### 表1");
  expect(rendered).toContain("### 分析要点");
  expect(rendered).toContain("### 优化建议");
});

test("renders whole-output JSON object", () => {
  const text = '{"summary":"s","analysis":["a1"]}';
  const rendered = tryRenderStructuredContent(text);
  expect(rendered).not.toBeNull();
  expect(rendered).toContain("s");
  expect(rendered).toContain("- a1");
});

test("returns null for plain markdown output", () => {
  expect(tryRenderStructuredContent("## 标题\n普通文本")).toBeNull();
});

test("returns null for invalid JSON inside fenced block", () => {
  const text = "```json\n{not valid json}\n```";
  expect(tryRenderStructuredContent(text)).toBeNull();
});

test("returns null for valid JSON that fails the structured schema", () => {
  const text = '{"summary": 123}';
  expect(tryRenderStructuredContent(text)).toBeNull();
});

test("isValidStructuredOutput validates nested table structure", () => {
  expect(
    isValidStructuredOutput({
      tables: [{ title: "t", headers: ["a"], rows: [["1"]] }],
    }),
  ).toBe(true);
  expect(
    isValidStructuredOutput({
      tables: [{ title: "t", headers: ["a"], rows: [[1]] }],
    }),
  ).toBe(false);
});

test("renders free-form markdown body from the markdown field", () => {
  const text =
    '```json\n{"summary":"结论","markdown":"## 趋势判断\\n消耗上升，新增下降。\\n\\n| 渠道 | 消耗 |\\n|---|---|\\n| A | 100 |"}\n```';
  const rendered = tryRenderStructuredContent(text);
  expect(rendered).not.toBeNull();
  expect(rendered).toContain("结论");
  expect(rendered).toContain("## 趋势判断");
  expect(rendered).toContain("| 渠道 | 消耗 |");
});

test("markdown field takes precedence over legacy slots", () => {
  const rendered = renderStructuredOutput({
    summary: "s",
    markdown: "## 自由章节\n正文",
    tables: [{ title: "旧表", headers: ["a"], rows: [["1"]] }],
    analysis: ["旧要点"],
    recommendations: ["旧建议"],
  });
  expect(rendered).toContain("## 自由章节");
  expect(rendered).not.toContain("旧表");
  expect(rendered).not.toContain("旧要点");
});

test("isValidStructuredOutput validates markdown field type", () => {
  expect(isValidStructuredOutput({ markdown: "## 标题" })).toBe(true);
  expect(isValidStructuredOutput({ markdown: 123 })).toBe(false);
});

test("renderStructuredOutput skips empty tables", () => {
  const rendered = renderStructuredOutput({
    summary: "s",
    tables: [{ title: "空表", headers: [], rows: [] }],
  });
  expect(rendered).not.toContain("空表");
  expect(rendered).toBe("s");
});
