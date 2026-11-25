/*
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
  initStore,
  loadSessionMessages,
  saveSessionMessages,
} from "../store.js";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class {
    query = mocks.query;
  },
}));

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  mocks.query.mockReset();
  mocks.query.mockResolvedValue({ rowCount: 0, rows: [] });
  await initStore();
  mocks.query.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("database save updates only a row owned by the same user", async () => {
  mocks.query.mockResolvedValue({ rowCount: 1, rows: [] });
  const messages = [{ role: "user" as const, content: "private" }];

  await saveSessionMessages("s1", "alice", messages);

  expect(mocks.query).toHaveBeenCalledWith(
    expect.stringContaining("WHERE agent_sessions.user_id = EXCLUDED.user_id"),
    ["s1", "alice", JSON.stringify(messages)],
  );
});

test("database save treats an ownership conflict as a no-op", async () => {
  mocks.query.mockResolvedValue({ rowCount: 0, rows: [] });

  await saveSessionMessages("s1", "bob", [
    { role: "user", content: "overwrite attempt" },
  ]);

  expect(mocks.query).toHaveBeenCalledTimes(1);
});

test("database load filters by both session id and user id", async () => {
  const messages = [{ role: "user", content: "private" }];
  mocks.query.mockResolvedValue({ rowCount: 1, rows: [{ messages }] });

  expect(await loadSessionMessages("s1", "alice")).toEqual(messages);
  expect(mocks.query).toHaveBeenCalledWith(
    expect.stringContaining("WHERE id = $1 AND user_id = $2"),
    ["s1", "alice"],
  );
});

test("database delete filters by both session id and user id", async () => {
  await deleteSession("s1", "alice");

  expect(mocks.query).toHaveBeenCalledWith(
    expect.stringContaining("WHERE id = $1 AND user_id = $2"),
    ["s1", "alice"],
  );
});
