import { test, expect } from "vitest";
import {
  usePiAgentStore,
  reducePiAgentEvent,
} from "@/store/piAgentStore";
import { useAgentStore } from "@/store/agentStore";

function resetStore(sessionId = "s1") {
  usePiAgentStore.getState().clearRuntime();
  useAgentStore.setState({ sessions: [], activeSessionId: sessionId });
  const id = useAgentStore.getState().createSession();
  return id;
}

test("agent_start captures the step offset and marks the session running", () => {
  const sid = resetStore();
  reducePiAgentEvent(
    { type: "agent_start", storeSessionId: sid },
    sid,
  );
  const s = usePiAgentStore.getState();
  expect(s.running).toContain(sid);
  expect(s.turnStepCount[sid]).toBe(0);
  expect(s.reasoning[sid]).toBe("streaming");
});

test("text deltas accumulate and finish reasoning on first text", () => {
  const sid = resetStore();
  reducePiAgentEvent(
    { type: "agent_start", storeSessionId: sid },
    sid,
  );
  usePiAgentStore.getState().appendThinking(sid, "analysis…");
  reducePiAgentEvent(
    {
      type: "thinking_delta",
      storeSessionId: sid,
      delta: "more",
    },
    sid,
  );
  // First text delta flips reasoning -> done because thinking exists.
  reducePiAgentEvent(
    {
      type: "message_update",
      storeSessionId: sid,
      assistantMessageEvent: { type: "text_delta", delta: "He" },
    },
    sid,
  );
  reducePiAgentEvent(
    {
      type: "message_update",
      storeSessionId: sid,
      assistantMessageEvent: { type: "text_delta", delta: "llo" },
    },
    sid,
  );
  const s = usePiAgentStore.getState();
  expect(s.text[sid]).toBe("Hello");
  expect(s.reasoning[sid]).toBe("done");
});

test("tool steps are recorded and completed with a bounded result", () => {
  const sid = resetStore();
  reducePiAgentEvent(
    {
      type: "tool_execution_start",
      storeSessionId: sid,
      toolCallId: "t1",
      toolName: "query_superset",
      args: { columns: ["a"], metrics: ["sum__x"], time_range: "P1M" },
    },
    sid,
  );
  const agentStore = useAgentStore.getState();
  const step = agentStore.sessions.find((s) => s.id === sid)?.steps[0];
  expect(step?.status).toBe("running");
  expect(step?.description).toContain("指标:1");

  reducePiAgentEvent(
    {
      type: "tool_execution_end",
      storeSessionId: sid,
      toolCallId: "t1",
      result: "x".repeat(600),
    },
    sid,
  );
  const doneStep = useAgentStore
    .getState()
    .sessions.find((s) => s.id === sid)?.steps[0];
  expect(doneStep?.status).toBe("done");
  expect(doneStep?.result?.length).toBe(500);
  expect(doneStep?.duration).toBeGreaterThanOrEqual(0);
});

test("agent_end writes the agent_done message and clears the buffers", () => {
  const sid = resetStore();
  reducePiAgentEvent(
    {
      type: "agent_end",
      storeSessionId: sid,
      finalText: "答复",
      messages: [],
    },
    sid,
  );
  const agentStore = useAgentStore.getState();
  const msg = agentStore.sessions.find((s) => s.id === sid)?.messages[0];
  expect(msg?.content.type).toBe("agent_done");
  expect(msg?.content).toMatchObject({ type: "agent_done", summary: "答复" });
  const s = usePiAgentStore.getState();
  expect(s.running).not.toContain(sid);
  expect(s.text[sid]).toBe("");
});

test("insight events are routed to the callback and skip chat history", () => {
  const sid = resetStore();
  let routed: unknown = null;
  reducePiAgentEvent(
    {
      type: "agent_start",
      storeSessionId: "req-1",
      insight: true,
    } as never,
    sid,
    (ev) => {
      routed = ev;
    },
  );
  expect(routed).not.toBeNull();
  // No chat message should be appended for an insight event.
  expect(useAgentStore.getState().sessions[0].messages.length).toBe(0);
});

test("model_list updates the model list and current model", () => {
  resetStore();
  reducePiAgentEvent(
    { type: "model_list", models: [{ id: "m1" }, { id: "m2" }], current: "m2" },
    "n/a",
  );
  const s = usePiAgentStore.getState();
  expect(s.modelList).toHaveLength(2);
  expect(s.currentModel).toBe("m2");
});
