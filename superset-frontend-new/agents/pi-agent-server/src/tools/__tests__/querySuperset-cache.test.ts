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

import { test, expect, vi, afterEach } from "vitest";
import {
  buildQueryCacheKey,
  executeQuerySuperset,
  getSchema,
  type SupersetDataContext,
} from "../querySuperset.js";

let sequence = 0;

function createContext(
  userId: string,
  datasetId = 26,
  token = `${userId}-token-${++sequence}`,
): SupersetDataContext {
  return { userId, datasetId, token };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installSupersetMock(
  schemas: Record<string, string[]> = {},
  values: Record<string, number> = {},
) {
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const authorization = new Headers(init?.headers).get("Authorization");
      const token = authorization?.replace(/^Bearer /, "") ?? "";
      if (url.includes("/api/v1/dataset/")) {
        const datasetId = url.split("/").at(-1) ?? "";
        const metrics = schemas[`${token}:${datasetId}`] ?? ["spend"];
        return jsonResponse({
          result: {
            columns: [{ column_name: "value", type_generic: 0 }],
            metrics: metrics.map((metric_name) => ({ metric_name })),
          },
        });
      }
      if (url.includes("/api/v1/chart/agent-data")) {
        const metric = "spend";
        const value = values[token] ?? 100;
        return jsonResponse({
          result: [
            {
              data: [{ [metric]: value }],
              colnames: [metric],
              rowcount: 1,
            },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function queryCallCount(
  fetchMock: ReturnType<typeof installSupersetMock>,
): number {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).includes("/chart/agent-data"),
  ).length;
}

const queryArgs: Record<string, unknown> = {
  columns: ["channel"],
  metrics: ["spend"],
  time_range: "Last 7 days",
  row_limit: 10,
  orderby: [["spend", false]],
  filters: { region: "west" },
  show_all: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("query cache isolates users, datasets, and auth contexts", async () => {
  const fetchMock = installSupersetMock(
    {},
    { "alice-token": 100, "bob-token": 200 },
  );
  const alice = createContext("alice", 26, "alice-token");
  const bob = createContext("bob", 26, "bob-token");
  const otherDataset = createContext("alice", 27, "alice-token");
  const refreshedAlice = createContext("alice", 26, "alice-refreshed-token");

  const first = await executeQuerySuperset(queryArgs, alice);
  expect(first).toContain("100");
  expect(await executeQuerySuperset(queryArgs, alice)).toBe(first);
  expect(queryCallCount(fetchMock)).toBe(1);

  expect(await executeQuerySuperset(queryArgs, bob)).toContain("200");
  expect(await executeQuerySuperset(queryArgs, otherDataset)).toContain("100");
  expect(await executeQuerySuperset(queryArgs, refreshedAlice)).toContain(
    "100",
  );
  expect(queryCallCount(fetchMock)).toBe(4);
});

test("query cache reads are rejected before authentication", async () => {
  const fetchMock = installSupersetMock();
  const context = createContext("alice");
  await executeQuerySuperset(queryArgs, context);
  const callsBefore = fetchMock.mock.calls.length;

  await expect(
    executeQuerySuperset(queryArgs, { ...context, token: "" }),
  ).rejects.toThrow("未认证");
  await expect(getSchema({ ...context, userId: "" })).rejects.toThrow("未认证");
  expect(fetchMock).toHaveBeenCalledTimes(callsBefore);
});

test("service-account environment variables never provide a fallback token", async () => {
  vi.stubEnv("SUPERSET_USERNAME", "service-account");
  vi.stubEnv("SUPERSET_PASSWORD", "service-password");
  const fetchMock = installSupersetMock();
  const unauthenticated = createContext("alice", 26, "");

  await expect(
    executeQuerySuperset(queryArgs, unauthenticated),
  ).rejects.toThrow("未认证");
  await expect(getSchema(unauthenticated)).rejects.toThrow("未认证");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("schema cache isolates users, datasets, and token fingerprints", async () => {
  const fetchMock = installSupersetMock();
  const alice = createContext("alice");

  await getSchema(alice);
  await getSchema(alice);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await getSchema(createContext("bob"));
  await getSchema(createContext("alice", 27));
  await getSchema(createContext("alice"));
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("schema validation sets do not leak across users or datasets", async () => {
  const aliceToken = `alice-schema-${++sequence}`;
  const bobToken = `bob-schema-${++sequence}`;
  const fetchMock = installSupersetMock({
    [`${aliceToken}:26`]: ["alice_only"],
    [`${bobToken}:26`]: ["bob_only"],
    [`${aliceToken}:27`]: ["dataset_two_only"],
  });
  const alice = createContext("alice", 26, aliceToken);
  const bob = createContext("bob", 26, bobToken);
  const otherDataset = createContext("alice", 27, aliceToken);

  expect(
    await executeQuerySuperset(
      { ...queryArgs, metrics: ["alice_only"] },
      alice,
    ),
  ).not.toContain("查询失败");
  expect(
    await executeQuerySuperset({ ...queryArgs, metrics: ["alice_only"] }, bob),
  ).toContain("查询失败");
  expect(
    await executeQuerySuperset(
      { ...queryArgs, metrics: ["alice_only"] },
      otherDataset,
    ),
  ).toContain("查询失败");
  expect(queryCallCount(fetchMock)).toBe(1);

  expect(
    await executeQuerySuperset({ ...queryArgs, metrics: ["bob_only"] }, bob),
  ).not.toContain("查询失败");
  expect(queryCallCount(fetchMock)).toBe(2);
});

test("query cache key includes every query argument and preserves array order", () => {
  const context = createContext("alice", 26, "secret-token");
  const base = buildQueryCacheKey(context, queryArgs);
  const keys = [
    base,
    buildQueryCacheKey(createContext("bob", 26, context.token), queryArgs),
    buildQueryCacheKey({ ...context, datasetId: 27 }, queryArgs),
    buildQueryCacheKey({ ...context, token: "other-token" }, queryArgs),
    buildQueryCacheKey(context, { ...queryArgs, orderby: [["spend", true]] }),
    buildQueryCacheKey(context, { ...queryArgs, show_all: false }),
    buildQueryCacheKey(context, { ...queryArgs, row_limit: 11 }),
    buildQueryCacheKey(context, { ...queryArgs, time_range: "Last 14 days" }),
    buildQueryCacheKey(context, { ...queryArgs, filters: { region: "east" } }),
    buildQueryCacheKey(context, { ...queryArgs, columns: ["channel", "day"] }),
    buildQueryCacheKey(context, { ...queryArgs, metrics: ["spend", "roi"] }),
    buildQueryCacheKey(context, { ...queryArgs, custom_arg: "different" }),
  ];

  expect(new Set(keys).size).toBe(keys.length);
  expect(base).toMatch(/^[a-f0-9]{64}$/);
  expect(base).not.toContain(context.token);
  expect(
    buildQueryCacheKey(context, {
      ...queryArgs,
      filters: { region: "west", day: "Monday" },
    }),
  ).toBe(
    buildQueryCacheKey(context, {
      ...queryArgs,
      filters: { day: "Monday", region: "west" },
    }),
  );
});
