/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@/api", () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
  QUERY_TIMEOUT_MS: 300_000,
}));

import api, { QUERY_TIMEOUT_MS } from "@/api";
import { executeSql } from "@/pages/SqlLab/api";

beforeEach(() => {
  vi.clearAllMocks();
});

test("executeSql posts the SQL payload with the query timeout", async () => {
  const payload = { database_id: 2, sql: "SELECT 1" };

  await executeSql(payload);

  expect(api.post).toHaveBeenCalledWith("/sqllab/execute/", payload, {
    timeout: QUERY_TIMEOUT_MS,
    signal: undefined,
  });
});

test("executeSql forwards the schema and AbortSignal", async () => {
  const controller = new AbortController();
  const payload = {
    database_id: 2,
    sql: "SELECT * FROM events",
    schema: "public",
  };

  await executeSql(payload, controller.signal);

  expect(api.post).toHaveBeenCalledWith("/sqllab/execute/", payload, {
    timeout: QUERY_TIMEOUT_MS,
    signal: controller.signal,
  });
});
