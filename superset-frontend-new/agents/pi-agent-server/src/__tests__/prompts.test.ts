import { test, expect } from "vitest";
import {
  CHAT_SYSTEM_PROMPT,
  CHART_INSIGHT_SYSTEM_PROMPT,
  DATA_DICT_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
} from "../prompts.js";

test("report prompt defines the analyst identity and output contract", () => {
  expect(REPORT_SYSTEM_PROMPT).toContain("数据分析师");
  expect(REPORT_SYSTEM_PROMPT).toContain("昨日 vs 前日");
  expect(REPORT_SYSTEM_PROMPT).toContain("±X%");
  expect(REPORT_SYSTEM_PROMPT).toContain("禁止使用 LaTeX");
  expect(REPORT_SYSTEM_PROMPT).toContain("不得编造");
});

test("chat prompt is concise and forbids reasoning output", () => {
  expect(CHAT_SYSTEM_PROMPT).toContain("AI 助手");
  expect(CHAT_SYSTEM_PROMPT).toContain("不要输出推理过程");
});

test("dict prompt requires schema-backed answers", () => {
  expect(DATA_DICT_SYSTEM_PROMPT).toContain("Schema");
  expect(DATA_DICT_SYSTEM_PROMPT).toContain("不得编造");
});

test("insight prompt is non-empty and requires structured analysis", () => {
  expect(CHART_INSIGHT_SYSTEM_PROMPT.length).toBeGreaterThan(20);
  expect(CHART_INSIGHT_SYSTEM_PROMPT).toContain("趋势");
});
