import { test, expect } from "vitest";
import { toAgentMessages } from "../store.js";

test("toAgentMessages maps user turns to agent user messages", () => {
  const messages = [{ role: "user" as const, content: "查一下消耗" }];

  const agent = toAgentMessages(messages);

  expect(agent).toHaveLength(1);
  expect(agent[0].role).toBe("user");
  expect(agent[0].content).toBe("查一下消耗");
});

test("toAgentMessages maps assistant turns with text content", () => {
  const messages = [
    { role: "assistant" as const, content: "消耗为 1000" },
  ];

  const agent = toAgentMessages(messages);

  expect(agent).toHaveLength(1);
  expect(agent[0].role).toBe("assistant");
  expect(agent[0].content).toEqual([
    { type: "text", text: "消耗为 1000" },
  ]);
});
