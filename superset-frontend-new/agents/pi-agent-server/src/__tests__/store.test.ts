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
import {
  deleteSession,
  getSessionOwner,
  initStore,
  loadSessionMessages,
  saveSessionMessages,
  toAgentMessages,
} from "../store.js";

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "");
  await initStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("toAgentMessages maps user turns to agent user messages", () => {
  const messages = [{ role: "user" as const, content: "查一下消耗" }];

  const agent = toAgentMessages(messages);

  expect(agent).toHaveLength(1);
  expect(agent[0].role).toBe("user");
  expect(agent[0].content).toBe("查一下消耗");
});

test("toAgentMessages maps assistant turns with text content", () => {
  const messages = [{ role: "assistant" as const, content: "消耗为 1000" }];

  const agent = toAgentMessages(messages);

  expect(agent).toHaveLength(1);
  expect(agent[0].role).toBe("assistant");
  expect(agent[0].content).toEqual([{ type: "text", text: "消耗为 1000" }]);
});

test("in-memory sessions are isolated between users", async () => {
  const aliceMessages = [{ role: "user" as const, content: "alice private" }];
  const bobMessages = [{ role: "user" as const, content: "bob private" }];

  await saveSessionMessages("alice-session", "alice", aliceMessages);
  await saveSessionMessages("bob-session", "bob", bobMessages);

  expect(await loadSessionMessages("alice-session", "alice")).toEqual(
    aliceMessages,
  );
  expect(await loadSessionMessages("alice-session", "bob")).toBeNull();
  expect(await loadSessionMessages("bob-session", "alice")).toBeNull();
  expect(await loadSessionMessages("bob-session", "bob")).toEqual(bobMessages);
});

test("in-memory save cannot overwrite another user's session", async () => {
  const original = [{ role: "user" as const, content: "alice original" }];
  await saveSessionMessages("shared-session", "alice", original);

  await saveSessionMessages("shared-session", "bob", [
    { role: "user", content: "bob overwrite" },
  ]);

  expect(await loadSessionMessages("shared-session", "alice")).toEqual(
    original,
  );
  expect(await loadSessionMessages("shared-session", "bob")).toBeNull();
  expect(await getSessionOwner("shared-session")).toBe("alice");
});

test("in-memory delete cannot remove another user's session", async () => {
  const original = [{ role: "user" as const, content: "alice original" }];
  await saveSessionMessages("shared-session", "alice", original);

  await deleteSession("shared-session", "bob");
  expect(await loadSessionMessages("shared-session", "alice")).toEqual(
    original,
  );

  await deleteSession("shared-session", "alice");
  expect(await loadSessionMessages("shared-session", "alice")).toBeNull();
  expect(await getSessionOwner("shared-session")).toBeNull();
});
