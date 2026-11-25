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

import { test, expect, afterEach, vi } from "vitest";
import {
  getTokenFingerprint,
  verifyToken,
  resetTokenCache,
} from "../ws-auth.js";

process.env.FLASK_INTERNAL_URL = "http://test:8088";

afterEach(() => {
  resetTokenCache();
  vi.unstubAllGlobals();
});

function mockFetch(response: { ok: boolean; status: number; json?: unknown }) {
  const fn = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.json,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

test("returns the username for a valid token", async () => {
  const fn = mockFetch({
    ok: true,
    status: 200,
    json: { result: { username: "alice" } },
  });
  const username = await verifyToken("valid-token");
  expect(username).toBe("alice");
  expect(fn).toHaveBeenCalledWith(
    "http://test:8088/api/v1/me/",
    expect.objectContaining({
      headers: { Authorization: "Bearer valid-token" },
    }),
  );
});

test("returns null for a rejected token", async () => {
  mockFetch({ ok: false, status: 401, json: {} });
  expect(await verifyToken("bad-token")).toBeNull();
});

test("returns null when the response has no username", async () => {
  mockFetch({ ok: true, status: 200, json: { result: {} } });
  expect(await verifyToken("no-user-token")).toBeNull();
});

test("returns null when Superset is unreachable", async () => {
  const fn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
  vi.stubGlobal("fetch", fn);
  expect(await verifyToken("unreachable-token")).toBeNull();
});

test("returns null for an empty token", async () => {
  expect(await verifyToken("")).toBeNull();
});

test("caches verification results within the TTL window", async () => {
  const fn = mockFetch({
    ok: true,
    status: 200,
    json: { result: { username: "bob" } },
  });
  expect(await verifyToken("cached-token")).toBe("bob");
  expect(await verifyToken("cached-token")).toBe("bob");
  expect(fn).toHaveBeenCalledTimes(1);
});

test("re-fetches after the cache expires", async () => {
  const fn = mockFetch({
    ok: true,
    status: 200,
    json: { result: { username: "carol" } },
  });
  await verifyToken("expiring-token");
  vi.setSystemTime(Date.now() + 61_000);
  await verifyToken("expiring-token");
  expect(fn).toHaveBeenCalledTimes(2);
});

test("token cache does not alias tokens that collide under a 32-bit hash", async () => {
  const fn = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: { username: "alice" } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: { username: "bob" } }),
    });
  vi.stubGlobal("fetch", fn);

  expect(getTokenFingerprint("Aa")).not.toBe(getTokenFingerprint("BB"));
  expect(getTokenFingerprint("Aa")).toMatch(/^[a-f0-9]{64}$/);
  expect(await verifyToken("Aa")).toBe("alice");
  expect(await verifyToken("BB")).toBe("bob");
  expect(fn).toHaveBeenCalledTimes(2);
});
