/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { test, expect, vi } from "vitest";
import type WebSocket from "ws";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import {
  SessionStore,
  setWsPreferredModel,
  getWsPreferredModel,
} from "../session-store.js";

function createMockWs(): WebSocket {
  return {} as WebSocket;
}

function createMockAgentSession(dispose = vi.fn()): AgentSession {
  return { dispose } as unknown as AgentSession;
}

test("create and has a session for its owner", () => {
  const store = new SessionStore();
  const ws = createMockWs();

  store.create(ws, "sid-1", "user-1", createMockAgentSession());
  expect(store.has(ws, "sid-1", "user-1")).toBe(true);
  expect(store.has(ws, "sid-1", "user-2")).toBe(false);
  expect(store.has(ws, "sid-2", "user-1")).toBe(false);
});

test("getSession returns session metadata", () => {
  const store = new SessionStore();
  const ws = createMockWs();

  store.create(ws, "sid-1", "user-1", createMockAgentSession());
  const session = store.getSession("sid-1");
  expect(session).toBeDefined();
  expect(session!.id).toBe("sid-1");
  expect(session!.userId).toBe("user-1");
  expect(session!.state).toBe("idle");
});

test("setState updates session state only for its owner", () => {
  const store = new SessionStore();
  const ws = createMockWs();

  store.create(ws, "sid-1", "user-1", createMockAgentSession());
  store.setState("sid-1", "running", "user-2");
  expect(store.getSession("sid-1")!.state).toBe("idle");
  store.setState("sid-1", "running", "user-1");
  expect(store.getSession("sid-1")!.state).toBe("running");
});

test("remove cleans up agent session and deletes entries", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const dispose = vi.fn();

  store.create(ws, "sid-1", "user-1", createMockAgentSession(dispose));
  store.remove(ws, "sid-1", "user-1");
  expect(store.has(ws, "sid-1", "user-1")).toBe(false);
  expect(store.getSession("sid-1")).toBeUndefined();
  expect(dispose).toHaveBeenCalledTimes(1);
});

test("remove refuses to delete another user's session", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const dispose = vi.fn();

  store.create(ws, "sid-1", "user-1", createMockAgentSession(dispose));
  store.remove(ws, "sid-1", "user-2");
  expect(store.getSession("sid-1")?.userId).toBe("user-1");
  expect(dispose).not.toHaveBeenCalled();
});

test("cleanup disposes all sessions for a WebSocket", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const dispose1 = vi.fn();
  const dispose2 = vi.fn();

  store.create(ws, "sid-1", "user-1", createMockAgentSession(dispose1));
  store.create(ws, "sid-2", "user-2", createMockAgentSession(dispose2));
  store.setCurrentSessionId(ws, "sid-1", "user-1");
  store.cleanup(ws);

  expect(store.has(ws, "sid-1", "user-1")).toBe(false);
  expect(store.has(ws, "sid-2", "user-2")).toBe(false);
  expect(store.getSession("sid-1")).toBeUndefined();
  expect(store.getSession("sid-2")).toBeUndefined();
  expect(store.getCurrentSessionId(ws)).toBeUndefined();
  expect(dispose1).toHaveBeenCalledTimes(1);
  expect(dispose2).toHaveBeenCalledTimes(1);
});

test("cleanup does not affect other WebSocket connections", () => {
  const store = new SessionStore();
  const ws1 = createMockWs();
  const ws2 = createMockWs();

  store.create(ws1, "sid-1", "user-1", createMockAgentSession());
  store.create(ws2, "sid-2", "user-2", createMockAgentSession());
  store.cleanup(ws1);

  expect(store.has(ws1, "sid-1", "user-1")).toBe(false);
  expect(store.has(ws2, "sid-2", "user-2")).toBe(true);
});

test("removeAll disposes every session and clears current session id", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const dispose1 = vi.fn();
  const dispose2 = vi.fn();

  store.create(ws, "sid-1", "user-1", createMockAgentSession(dispose1));
  store.create(ws, "sid-2", "user-2", createMockAgentSession(dispose2));
  store.setCurrentSessionId(ws, "sid-1", "user-1");

  store.removeAll(ws);

  expect(store.has(ws, "sid-1", "user-1")).toBe(false);
  expect(store.has(ws, "sid-2", "user-2")).toBe(false);
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

  store.create(ws1, "sid-1", "user-1", createMockAgentSession());
  store.create(ws2, "sid-2", "user-2", createMockAgentSession());
  store.removeAll(ws1);

  expect(store.has(ws1, "sid-1", "user-1")).toBe(false);
  expect(store.has(ws2, "sid-2", "user-2")).toBe(true);
});

test("create is idempotent for an existing session", () => {
  const store = new SessionStore();
  const ws = createMockWs();
  const agentSession = createMockAgentSession();

  store.create(ws, "sid-1", "user-1", agentSession);
  store.create(ws, "sid-1", "user-1", createMockAgentSession());
  expect(store.getAgentSession(ws, "sid-1", "user-1")).toBe(agentSession);
});

test("create rejects a session id already owned by another user", () => {
  const store = new SessionStore();
  const ws = createMockWs();

  store.create(ws, "sid-1", "user-1", createMockAgentSession());
  expect(() =>
    store.create(ws, "sid-1", "user-2", createMockAgentSession()),
  ).toThrow("已被其他用户使用");
  expect(store.getSession("sid-1")?.userId).toBe("user-1");
});

test("setSubscription calls previous unsub before replacing", () => {
  const unsubOld = vi.fn();
  const unsubNew = vi.fn();

  const store = new SessionStore();
  store.setSubscription("sid-1", unsubOld);
  store.setSubscription("sid-1", unsubNew);
  expect(unsubOld).toHaveBeenCalledTimes(1);
});

test("deleteSubscription calls unsub before removing", () => {
  const unsub = vi.fn();
  const store = new SessionStore();
  store.setSubscription("sid-1", unsub);
  store.deleteSubscription("sid-1");
  expect(unsub).toHaveBeenCalledTimes(1);
});

test("getCurrentSessionId / setCurrentSessionId roundtrip for the owner", () => {
  const ws = createMockWs();
  const store = new SessionStore();
  store.create(ws, "current-sid", "user-1", createMockAgentSession());
  store.setCurrentSessionId(ws, "current-sid", "user-2");
  expect(store.getCurrentSessionId(ws)).toBeUndefined();
  store.setCurrentSessionId(ws, "current-sid", "user-1");
  expect(store.getCurrentSessionId(ws)).toBe("current-sid");
});

test("setPreferredModel / getPreferredModel roundtrip", () => {
  const ws = createMockWs();
  setWsPreferredModel(ws, "test-model");
  expect(getWsPreferredModel(ws)).toBe("test-model");
  const ws2 = createMockWs();
  expect(getWsPreferredModel(ws2)).toBeUndefined();
});
