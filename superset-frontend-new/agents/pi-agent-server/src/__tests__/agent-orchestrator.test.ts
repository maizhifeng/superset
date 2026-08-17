import { test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  validateAgentOutput,
  extractLastAssistantText,
  extractToolResultText,
  extractPersistableMessages,
  isReasoningIntent,
  isReportIntent,
  isDictIntent,
  fetchReportData,
  parseMarkdownRows,
  processPrompt,
} from "../agent-orchestrator.js";
import {
  REPORT_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  DATA_DICT_SYSTEM_PROMPT,
} from "../prompts.js";
import { SessionStore } from "../session-store.js";
import type { AgentConfig } from "../agent-config.js";

vi.mock("../tools/querySuperset.js", () => ({
  executeQuerySuperset: vi
    .fn()
    .mockResolvedValue("平台 | 消耗\n--- | ---\nmini_game | 1000"),
  getSchema: vi.fn().mockResolvedValue("可用维度列: 日期, 平台\n\n可用指标: SUM(消耗)"),
}));

test("isReportIntent matches periodic report requests", () => {
  expect(isReportIntent("请生成昨日数据日报")).toBe(true);
  expect(isReportIntent("帮我生成上周的周报")).toBe(true);
  expect(isReportIntent("生成月度报表")).toBe(true);
  expect(isReportIntent("查一下昨天的消耗")).toBe(false);
});

test("isReasoningIntent matches report requests", () => {
  expect(isReasoningIntent("请生成昨日数据日报")).toBe(true);
  expect(isReasoningIntent("对比上周和本周的消耗变化")).toBe(true);
  expect(isReasoningIntent("帮我算一下各渠道的消耗占比")).toBe(true);
  expect(isReasoningIntent("分析近7天各渠道商的返点后消耗")).toBe(false);
  expect(isReasoningIntent("查询渠道商微信小游戏的消耗")).toBe(false);
});

test("fetchReportData queries every perspective and emits progress", async () => {
  const config: AgentConfig = {
    report: {
      defaultTimeRange: "Last 7 days",
      perspectives: [
        {
          name: "平台维度",
          description: "近 7 天趋势",
          columns: ["日期", "平台"],
          metrics: ["SUM(消耗)"],
        },
        {
          name: "主游戏维度",
          description: "近 7 天趋势",
          columns: ["日期", "主游戏"],
          metrics: ["SUM(消耗)", "cpa"],
        },
      ],
    },
  };
  const events: Array<Record<string, unknown>> = [];
  const data = await fetchReportData(
    config,
    "alice",
    (e) => events.push(e),
    "sid-1",
    "token",
  );

  expect(data).toContain("### 视角 1：平台维度");
  expect(data).toContain("### 视角 2：主游戏维度");
  expect(events.filter((e) => e.type === "tool_execution_start")).toHaveLength(
    2,
  );
  expect(events.filter((e) => e.type === "tool_execution_end")).toHaveLength(2);
  expect(events[0].toolName).toBe("query_superset");
  expect(events[0].args).toMatchObject({
    columns: ["日期", "平台"],
    metrics: ["SUM(消耗)"],
    time_range: "Last 7 days",
  });
});

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

class FakeWS extends EventEmitter {
  readyState = 1;
  static OPEN = 1;
  send(): void {}
  close(): void {
    this.emit("close");
  }
}

type SessionLike = ReturnType<typeof createMockSession>;

function createMockSession() {
  const listeners: Array<(e: Record<string, unknown>) => void> = [];
  const state: { messages: unknown[]; systemPrompt: string } = {
    messages: [],
    systemPrompt: "",
  };
  const session = {
    state,
    prompt: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((cb: (e: Record<string, unknown>) => void) => {
      listeners.push(cb);
      return () => {};
    }),
    dispose: vi.fn(),
    _emit: (e: Record<string, unknown>) => listeners.forEach((l) => l(e)),
  };
  return session;
}

async function runPrompt(session: SessionLike, message: string) {
  const ws = new FakeWS();
  const store = new SessionStore();
  const sid = "test-session";
  store.create(ws, sid, "alice", session);
  store.setCurrentSessionId(ws, sid);
  const events: Array<Record<string, unknown>> = [];
  await processPrompt(ws, sid, session, message, (e) => events.push(e), store);
  return { events, store };
}

test("report prompts are prefetched with data before the agent runs", async () => {
  const session = createMockSession();
  await runPrompt(session, "请生成昨日数据日报");

  expect(session.prompt).toHaveBeenCalledTimes(1);
  const promptText = String(session.prompt.mock.calls[0][0]);
  expect(promptText).toContain("以下是系统已获取的数据");
  expect(promptText).toContain("### 视角 1：平台维度");
  expect(promptText).toContain("### 视角 4：平台 × 媒体维度");
  expect(promptText).toContain("报告需覆盖全部 4 个分析视角");
});

test("regular prompts go to the agent unchanged", async () => {
  const session = createMockSession();
  await runPrompt(session, "你好");

  expect(session.prompt).toHaveBeenCalledTimes(1);
  expect(String(session.prompt.mock.calls[0][0])).toBe("你好");
});

test("extractPersistableMessages keeps only plain-text user/assistant turns", () => {
  const messages = [
    { role: "system", content: "you are an analyst" },
    { role: "user", content: "查一下消耗" },
    {
      role: "assistant",
      content: [{ type: "text", text: "消耗为 1000" }],
    },
    { role: "tool", content: "| 消耗 |\n| 1000 |" },
    { role: "assistant", content: "   " },
  ];

  expect(extractPersistableMessages(messages)).toEqual([
    { role: "user", content: "查一下消耗" },
    { role: "assistant", content: "消耗为 1000" },
  ]);
});

test("isDictIntent matches data dictionary requests", () => {
  expect(isDictIntent("介绍一下数据字典")).toBe(true);
  expect(isDictIntent("字段定义是什么")).toBe(true);
  expect(isDictIntent("各字段的业务含义")).toBe(true);
  expect(isDictIntent("请生成昨日数据日报")).toBe(false);
});

test("parseMarkdownRows extracts data rows from a markdown table", () => {
  const md = [
    "主游戏 | SUM(消耗)",
    "--- | ---",
    "三国 | 5000",
    "西游 | 4000",
  ].join("\n");

  expect(parseMarkdownRows(md)).toEqual([
    ["三国", "5000"],
    ["西游", "4000"],
  ]);
});

test("parseMarkdownRows returns empty for non-table content", () => {
  expect(parseMarkdownRows("查询失败: 指标名不存在")).toEqual([]);
});

test("report prompts override the system prompt with the analyst prompt", async () => {
  const session = createMockSession();
  await runPrompt(session, "请生成昨日数据日报");

  expect(session.state.systemPrompt).toBe(REPORT_SYSTEM_PROMPT);
  const promptText = String(session.prompt.mock.calls[0][0]);
  expect(promptText).toContain("昨日 vs 前日变化率");
});

test("regular prompts override the system prompt with the chat prompt", async () => {
  const session = createMockSession();
  await runPrompt(session, "你好");

  expect(session.state.systemPrompt).toBe(CHAT_SYSTEM_PROMPT);
});

test("dict prompts inject the dataset schema and the dict system prompt", async () => {
  const session = createMockSession();
  await runPrompt(session, "介绍一下数据字典");

  expect(session.state.systemPrompt).toBe(DATA_DICT_SYSTEM_PROMPT);
  const promptText = String(session.prompt.mock.calls[0][0]);
  expect(promptText).toContain("可用维度列: 日期, 平台");
  expect(promptText).toContain("可用指标: SUM(消耗)");
});

test("two-step perspectives rank topN first then filter with IN", async () => {
  const { executeQuerySuperset } = await import("../tools/querySuperset.js");
  const mocked = vi.mocked(executeQuerySuperset);
  mocked
    .mockResolvedValueOnce("主游戏 | SUM(消耗)\n--- | ---\n三国 | 5000\n西游 | 4000")
    .mockResolvedValueOnce(
      "日期 | 主游戏 | 渠道商 | SUM(消耗)\n--- | --- | --- | ---\n7/1 | 三国 | 微信 | 1000",
    );

  const config: AgentConfig = {
    report: {
      defaultTimeRange: "Last 7 days",
      perspectives: [
        {
          name: "渠道商维度",
          description: "重点主游戏下钻",
          columns: ["日期", "主游戏", "渠道商"],
          metrics: ["SUM(消耗)"],
          orderby: "日期↑",
          topBy: "主游戏",
          topMetric: "SUM(消耗)",
          topN: 2,
          rowLimit: 400,
        },
      ],
    },
  };
  const events: Array<Record<string, unknown>> = [];
  const data = await fetchReportData(config, "alice", (e) => events.push(e), "s1", "tok");

  expect(mocked).toHaveBeenCalledTimes(2);
  const [topArgs, drillArgs] = mocked.mock.calls.map((c) => c[0]) as [
    Record<string, unknown>,
    Record<string, unknown>,
  ];
  expect(topArgs).toMatchObject({
    columns: ["主游戏"],
    metrics: ["SUM(消耗)"],
    row_limit: 2,
  });
  expect(drillArgs).toMatchObject({
    columns: ["日期", "主游戏", "渠道商"],
    row_limit: 400,
  });
  expect(drillArgs.filters).toEqual({ 主游戏: ["三国", "西游"] });
  expect(data).toContain("按 SUM(消耗) 排名前 2 的主游戏");
  expect(data).toContain("三国、西游");
  expect(events.filter((e) => e.type === "tool_execution_start")).toHaveLength(2);
});
