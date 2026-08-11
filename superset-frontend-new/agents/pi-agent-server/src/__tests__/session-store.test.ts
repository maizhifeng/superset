import { test, expect, vi } from "vitest";
import WebSocket from "ws";
import {
  SessionStore,
  setWsPreferredModel,
  getWsPreferredModel,
} from "../session-store.js";

function createMockWs(): WebSocket {
  return new WebSocket("http://localhost");
}

test("create and has a session", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const agentSession = { dispose: vi.fn() } as any;

  store.create(ws, "sid-1", "user-1", agentSession);
  expect(store.has(ws, "sid-1")).toBe(true);
  expect(store.has(ws, "sid-2")).toBe(false);
});

test("getSession returns session metadata", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const agentSession = { dispose: vi.fn() } as any;

  store.create(ws, "sid-1", "user-1", agentSession);
  const session = store.getSession("sid-1");
  expect(session).toBeDefined();
  expect(session!.id).toBe("sid-1");
  expect(session!.userId).toBe("user-1");
  expect(session!.state).toBe("idle");
});

test("setState updates session state", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const agentSession = { dispose: vi.fn() } as any;

  store.create(ws, "sid-1", "user-1", agentSession);
  store.setState("sid-1", "running");
  expect(store.getSession("sid-1")!.state).toBe("running");
});

test("remove cleans up agent session and deletes entries", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const dispose = vi.fn();
  const agentSession = { dispose } as any;

  store.create(ws, "sid-1", "user-1", agentSession);
  store.remove(ws, "sid-1");
  expect(store.has(ws, "sid-1")).toBe(false);
  expect(store.getSession("sid-1")).toBeUndefined();
  expect(dispose).toHaveBeenCalledTimes(1);
});

test("cleanup disposes all sessions for a WebSocket", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const dispose1 = vi.fn();
  const dispose2 = vi.fn();

  store.create(ws, "sid-1", "user-1", { dispose: dispose1 } as any);
  store.create(ws, "sid-2", "user-2", { dispose: dispose2 } as any);
  store.cleanup(ws);

  expect(store.has(ws, "sid-1")).toBe(false);
  expect(store.has(ws, "sid-2")).toBe(false);
  expect(dispose1).toHaveBeenCalledTimes(1);
  expect(dispose2).toHaveBeenCalledTimes(1);
});

test("cleanup does not affect other WebSocket connections", () => {
  const store = new SessionStore();
  const ws1 = createMockWs();
  const ws2 = createMockWs();

  store.create(ws1, "sid-1", "user-1", { dispose: vi.fn() } as any);
  store.create(ws2, "sid-2", "user-2", { dispose: vi.fn() } as any);
  store.cleanup(ws1);

  expect(store.has(ws1, "sid-1")).toBe(false);
  expect(store.has(ws2, "sid-2")).toBe(true);
});

test("removeAll disposes every session and clears current session id", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const dispose1 = vi.fn();
  const dispose2 = vi.fn();

  store.create(ws, "sid-1", "user-1", { dispose: dispose1 } as any);
  store.create(ws, "sid-2", "user-2", { dispose: dispose2 } as any);
  store.setCurrentSessionId(ws, "sid-1");

  store.removeAll(ws);

  expect(store.has(ws, "sid-1")).toBe(false);
  expect(store.has(ws, "sid-2")).toBe(false);
  expect(store.getSession("sid-1")).toBeUndefined();
  expect(store.getSession("sid-2")).toBeUndefined();
  expect(dispose1).toHaveBeenCalledTimes(1);
  expect(dispose2).toHaveBeenCalledTimes(1);
  expect(store.getCurrentSessionId(ws)).toBeUndefined();
});

test("removeAll does not affect other WebSocket connections", () => {
  const store = new SessionStore();
  const ws1 = createMockWs();
  const ws2 = createMockWs();

  store.create(ws1, "sid-1", "user-1", { dispose: vi.fn() } as any);
  store.create(ws2, "sid-2", "user-2", { dispose: vi.fn() } as any);
  store.removeAll(ws1);

  expect(store.has(ws1, "sid-1")).toBe(false);
  expect(store.has(ws2, "sid-2")).toBe(true);
});

test("create is idempotent for existing session", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const agentSession = { dispose: vi.fn() } as any;

  store.create(ws, "sid-1", "user-1", agentSession);

  // Second create should be a no-op
  const agentSession2 = { dispose: vi.fn() } as any;
  store.create(ws, "sid-1", "user-1", agentSession2);
  expect(store.getAgentSession(ws, "sid-1")).toBe(agentSession);
});

test("setSubscription calls previous unsub before replacing", () => {
  const store = new SessionStore();
  const unsubOld = vi.fn();
  const unsubNew = vi.fn();

  store.setSubscription("sid-1", unsubOld);
  store.setSubscription("sid-1", unsubNew);
  expect(unsubOld).toHaveBeenCalledTimes(1);
});

test("deleteSubscription calls unsub before removing", () => {
  const store = new SessionStore();
  const unsub = vi.fn();
  store.setSubscription("sid-1", unsub);
  store.deleteSubscription("sid-1");
  expect(unsub).toHaveBeenCalledTimes(1);
});

test("getCurrentSessionId / setCurrentSessionId roundtrip", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  store.setCurrentSessionId(ws, "current-sid");
  expect(store.getCurrentSessionId(ws)).toBe("current-sid");
});

test("setPreferredModel / getPreferredModel roundtrip", () => {
  const ws = createMockWs();
  setWsPreferredModel(ws, "test-model");
  expect(getWsPreferredModel(ws)).toBe("test-model");
  const ws2 = createMockWs();
  expect(getWsPreferredModel(ws2)).toBeUndefined();
});
