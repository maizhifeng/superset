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

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { handleConnection } from "../router.js";
import { verifyToken } from "../ws-auth.js";
import { processPrompt, processInsight } from "../agent-orchestrator.js";
import {
  deleteSession,
  getSessionOwner,
  loadSessionMessages,
  setPreferredModel,
} from "../store.js";

vi.mock("../ws-auth.js", () => ({
  verifyToken: vi.fn(),
  getTokenFingerprint: vi.fn((token: string) => `fingerprint:${token}`),
}));

vi.mock("../agent-orchestrator.js", () => ({
  processPrompt: vi.fn().mockResolvedValue(undefined),
  processInsight: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../store.js", () => ({
  getSessionOwner: vi.fn(),
  loadSessionMessages: vi.fn(),
  deleteSession: vi.fn(),
  setPreferredModel: vi.fn(),
  toAgentMessages: vi.fn((messages: unknown[]) => messages),
}));

class FakeWS extends EventEmitter {
  readyState = 1;
  static OPEN = 1;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit("close");
  }
}

function emitJson(ws: FakeWS, msg: unknown): void {
  ws.emit("message", Buffer.from(JSON.stringify(msg)));
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function parsedSent(ws: FakeWS): Array<Record<string, unknown>> {
  return ws.sent.map((message) => JSON.parse(message));
}

function createMockSession(): AgentSession {
  return {
    state: { messages: [] },
    dispose: vi.fn(),
  } as unknown as AgentSession;
}

const sessionFactory = vi.fn(async () => createMockSession());
const persistedOwners = new Map<string, string>();

beforeEach(() => {
  vi.clearAllMocks();
  persistedOwners.clear();
  vi.mocked(verifyToken).mockResolvedValue("alice");
  vi.mocked(getSessionOwner).mockImplementation(
    async (sessionId) => persistedOwners.get(sessionId) ?? null,
  );
  vi.mocked(loadSessionMessages).mockResolvedValue(null);
  vi.mocked(deleteSession).mockResolvedValue(undefined);
  vi.mocked(setPreferredModel).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function authenticate(ws: FakeWS, token = "valid-token"): Promise<void> {
  emitJson(ws, { type: "auth", access_token: token });
  await flush();
}

test("rejects new_session without a verified token", async () => {
  vi.mocked(verifyToken).mockResolvedValue(null);
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");

  emitJson(ws, { type: "new_session", storeSessionId: "s1" });
  await flush();

  const errors = parsedSent(ws).filter((message) => message.type === "error");
  expect(errors.length).toBeGreaterThan(0);
  expect(String(errors[0].message)).toContain("未认证");
  expect(sessionFactory).not.toHaveBeenCalled();
});

test.each([
  { type: "select_session", storeSessionId: "s1" },
  { type: "prompt", message: "查一下数据", storeSessionId: "s1" },
  { type: "insight", storeSessionId: "s1", chartId: 1 },
  { type: "set_model", model: "model-a" },
  { type: "abort", storeSessionId: "s1" },
  { type: "delete_session", storeSessionId: "s1" },
])("rejects unauthenticated $type without side effects", async (message) => {
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");

  emitJson(ws, { ...message, user_id: "attacker" });
  await flush();

  expect(
    String(parsedSent(ws).find((item) => item.type === "error")?.message),
  ).toContain("未认证");
  expect(verifyToken).not.toHaveBeenCalled();
  expect(sessionFactory).not.toHaveBeenCalled();
  expect(processPrompt).not.toHaveBeenCalled();
  expect(processInsight).not.toHaveBeenCalled();
  expect(setPreferredModel).not.toHaveBeenCalled();
  expect(deleteSession).not.toHaveBeenCalled();
});

test("creates a session after auth using the verified username", async () => {
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");

  await authenticate(ws);
  emitJson(ws, { type: "new_session", storeSessionId: "s1" });
  await flush();

  expect(verifyToken).toHaveBeenCalledWith("valid-token");
  expect(sessionFactory).toHaveBeenCalledWith("alice", ws);
  const created = parsedSent(ws).filter(
    (message) => message.type === "session_created",
  );
  expect(created.length).toBeGreaterThan(0);
});

test("requires an auth message instead of connection query credentials", async () => {
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");
  await flush();

  emitJson(ws, { type: "delete_session", storeSessionId: "s1" });
  await flush();

  expect(verifyToken).not.toHaveBeenCalled();
  expect(deleteSession).not.toHaveBeenCalled();
  expect(
    String(parsedSent(ws).find((item) => item.type === "error")?.message),
  ).toContain("未认证");
});

test("does not trust a client-supplied user_id when setting a model", async () => {
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");
  await authenticate(ws);

  emitJson(ws, { type: "set_model", model: "model-a", user_id: "attacker" });
  await flush();

  expect(setPreferredModel).toHaveBeenCalledWith("alice", "model-a");
  expect(setPreferredModel).not.toHaveBeenCalledWith("attacker", "model-a");
});

test.each([
  { type: "new_session", storeSessionId: "shared", dataset_id: 26 },
  { type: "select_session", storeSessionId: "shared" },
  { type: "prompt", message: "读取会话", storeSessionId: "shared" },
  { type: "insight", storeSessionId: "shared", chartId: 42 },
  { type: "abort", storeSessionId: "shared" },
  { type: "delete_session", storeSessionId: "shared" },
])("rejects cross-user persisted session access for $type", async (message) => {
  persistedOwners.set("shared", "alice");
  vi.mocked(verifyToken).mockResolvedValue("bob");
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");
  await authenticate(ws, "bob-token");

  emitJson(ws, message);
  await flush();

  expect(sessionFactory).not.toHaveBeenCalled();
  expect(loadSessionMessages).not.toHaveBeenCalled();
  expect(processPrompt).not.toHaveBeenCalled();
  expect(processInsight).not.toHaveBeenCalled();
  expect(deleteSession).not.toHaveBeenCalled();
  expect(
    String(parsedSent(ws).find((item) => item.type === "error")?.message),
  ).toContain("无权访问");
});

test("loads persisted history only for the verified owner", async () => {
  persistedOwners.set("s1", "alice");
  const history = [{ role: "user" as const, content: "alice history" }];
  vi.mocked(loadSessionMessages).mockResolvedValue(history);
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");
  await authenticate(ws);

  emitJson(ws, { type: "select_session", storeSessionId: "s1" });
  await flush();

  expect(loadSessionMessages).toHaveBeenCalledWith("s1", "alice");
  const session = await sessionFactory.mock.results[0].value;
  expect(session.state.messages).toEqual(history);
});

test("deletes a persisted session only for the verified owner", async () => {
  persistedOwners.set("s1", "alice");
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");
  await authenticate(ws);

  emitJson(ws, { type: "delete_session", storeSessionId: "s1" });
  await flush();

  expect(deleteSession).toHaveBeenCalledWith("s1", "alice");
});

test("a rejected replacement token invalidates the previous identity", async () => {
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");
  await authenticate(ws);
  emitJson(ws, { type: "new_session", storeSessionId: "s1" });
  await flush();
  vi.mocked(deleteSession).mockClear();

  vi.mocked(verifyToken).mockResolvedValue(null);
  await authenticate(ws, "invalid-token");
  emitJson(ws, { type: "delete_session", storeSessionId: "s1" });
  await flush();

  expect(deleteSession).not.toHaveBeenCalled();
  expect(String(parsedSent(ws).at(-1)?.message)).toContain("未认证");
});

test("revalidates the stored identity before every session operation", async () => {
  vi.mocked(verifyToken)
    .mockResolvedValueOnce("alice")
    .mockResolvedValueOnce("alice")
    .mockResolvedValueOnce(null);
  const ws = new FakeWS();
  handleConnection(ws as unknown as WebSocket, sessionFactory, [], "default");
  await authenticate(ws);

  emitJson(ws, { type: "new_session", storeSessionId: "s1" });
  await flush();
  expect(sessionFactory).toHaveBeenCalledTimes(1);

  emitJson(ws, { type: "delete_session", storeSessionId: "s1" });
  await flush();
  expect(verifyToken).toHaveBeenCalledTimes(3);
  expect(deleteSession).not.toHaveBeenCalled();
  expect(String(parsedSent(ws).at(-1)?.message)).toContain("未认证");
});
