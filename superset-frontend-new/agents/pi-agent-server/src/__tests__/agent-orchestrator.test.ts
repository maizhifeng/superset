import { test, expect } from "vitest";
import {
  validateAgentOutput,
  extractLastAssistantText,
  extractToolResultText,
  isReasoningIntent,
} from "../agent-orchestrator.js";

test("validateAgentOutput returns valid when tool results exist", () => {
  const messages = [{ role: "tool", content: "some data" }];
  const result = validateAgentOutput("some text", messages);
  expect(result.valid).toBe(true);
  expect(result.errors).toEqual([]);
});

test("validateAgentOutput returns invalid when text empty and no tool results", () => {
  const result = validateAgentOutput("", []);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("输出内容为空");
});

test("validateAgentOutput returns invalid when no tool calls made", () => {
  const messages = [{ role: "user", content: "hello" }];
  const result = validateAgentOutput("some text", messages);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("未调用 query_superset 获取数据");
});

test("extractLastAssistantText returns last assistant content string", () => {
  const messages = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
    { role: "user", content: "how are you" },
    { role: "assistant", content: "I'm fine" },
  ];
  expect(extractLastAssistantText(messages)).toBe("I'm fine");
});

test("extractLastAssistantText returns empty string when no assistant messages", () => {
  expect(extractLastAssistantText([])).toBe("");
  expect(extractLastAssistantText([{ role: "user", content: "hi" }])).toBe("");
});

test("extractLastAssistantText handles array content", () => {
  const messages = [
    {
      role: "assistant",
      content: [{ text: "part1" }, { text: "part2" }],
    },
  ];
  expect(extractLastAssistantText(messages)).toBe("part1\npart2");
});

test("extractToolResultText returns last tool content string", () => {
  const messages = [
    { role: "tool", content: "result1" },
    { role: "tool", content: "result2" },
  ];
  expect(extractToolResultText(messages)).toBe("result2");
});

test("extractToolResultText returns empty when no tool messages", () => {
  expect(extractToolResultText([])).toBe("");
  expect(extractToolResultText([{ role: "assistant", content: "hi" }])).toBe(
    "",
  );
});

test("extractToolResultText handles array of mixed types", () => {
  const messages = [
    {
      role: "tool",
      content: ["line1", { text: "line2" }],
    },
  ];
  expect(extractToolResultText(messages)).toBe("line1\nline2");
});

test("isReasoningIntent matches report requests", () => {
  expect(isReasoningIntent("请生成昨日数据日报")).toBe(true);
  expect(isReasoningIntent("对比上周和本周的消耗变化")).toBe(true);
  expect(isReasoningIntent("帮我算一下各渠道的消耗占比")).toBe(true);
  expect(isReasoningIntent("分析近7天各渠道商的返点后消耗")).toBe(false);
  expect(isReasoningIntent("查询渠道商微信小游戏的消耗")).toBe(false);
});
