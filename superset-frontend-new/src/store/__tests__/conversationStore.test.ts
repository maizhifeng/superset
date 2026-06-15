import { test, expect, beforeEach } from "vitest";
import { useConversationStore } from "@/store/conversationStore";

beforeEach(() => {
  localStorage.clear();
  useConversationStore.setState({ threads: [], activeThreadId: null });
});

test("initial state has no threads", () => {
  const s = useConversationStore.getState();
  expect(s.threads).toEqual([]);
  expect(s.activeThreadId).toBeNull();
});

test("createThread adds new thread and sets it as active", () => {
  const id = useConversationStore.getState().createThread();
  const s = useConversationStore.getState();
  expect(s.threads).toHaveLength(1);
  expect(s.threads[0].id).toBe(id);
  expect(s.activeThreadId).toBe(id);
});

test("switchThread changes active thread", () => {
  const id1 = useConversationStore.getState().createThread();
  const id2 = useConversationStore.getState().createThread();
  useConversationStore.getState().switchThread(id1);
  expect(useConversationStore.getState().activeThreadId).toBe(id1);
  useConversationStore.getState().switchThread(id2);
  expect(useConversationStore.getState().activeThreadId).toBe(id2);
});

test("deleteThread removes thread and updates active", () => {
  const id1 = useConversationStore.getState().createThread();
  const id2 = useConversationStore.getState().createThread();
  useConversationStore.getState().deleteThread(id2);
  const s = useConversationStore.getState();
  expect(s.threads).toHaveLength(1);
  expect(s.threads[0].id).toBe(id1);
  expect(s.activeThreadId).toBe(id1);
});

test("addMessage appends message to thread", () => {
  const id = useConversationStore.getState().createThread();
  useConversationStore
    .getState()
    .addMessage(id, "user", { type: "text", body: "hello" });
  const s = useConversationStore.getState();
  expect(s.threads[0].messages).toHaveLength(1);
  expect(s.threads[0].messages[0].role).toBe("user");
});

test("getActiveThread returns current thread", () => {
  const id = useConversationStore.getState().createThread();
  const thread = useConversationStore.getState().getActiveThread();
  expect(thread?.id).toBe(id);
});
